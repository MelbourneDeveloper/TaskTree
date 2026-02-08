/**
 * SPEC: ai-semantic-search
 *
 * Semantic search orchestration.
 * Coordinates LLM summarisation, embedding generation, and SQLite storage.
 */

import type * as vscode from 'vscode';
import type { TaskItem, Result } from '../models/TaskItem';
import { ok, err } from '../models/TaskItem';
import { logger } from '../utils/logger';
import { computeContentHash } from './store';
import type { FileSystemAdapter } from './adapters';
import { selectCopilotModel, summariseScript } from './summariser';
import { initDb, getDb, getOrCreateEmbedder, disposeSemantic } from './lifecycle';
import { getAllRows, upsertRow, getRow, importFromJsonStore } from './db';
import type { EmbeddingRow, DbHandle } from './db';
import { embedText } from './embedder';
import { rankBySimilarity, type ScoredCandidate } from './similarity';
import {
    legacyStoreExists,
    readSummaryStore,
    deleteLegacyJsonStore
} from './store';

const SEARCH_TOP_K = 20;
const SEARCH_SIMILARITY_THRESHOLD = 0.3;

/**
 * Checks if the user has enabled AI summaries.
 * ABSTRACTION: Accepts enabled flag instead of reading VS Code config directly.
 * Call site (extension.ts) reads from VS Code and passes the value.
 */
export function isAiEnabled(enabled: boolean): boolean {
    return enabled;
}

/**
 * Initialises the semantic search subsystem.
 */
export async function initSemanticStore(workspaceRoot: string): Promise<Result<void, string>> {
    const result = await initDb(workspaceRoot);
    return result.ok ? ok(undefined) : err(result.error);
}

/**
 * Disposes all semantic search resources.
 */
export async function disposeSemanticStore(): Promise<void> {
    await disposeSemantic();
}

/**
 * Migrates legacy JSON store to SQLite if needed.
 */
export async function migrateIfNeeded(params: {
    readonly workspaceRoot: string;
}): Promise<Result<void, string>> {
    const exists = await legacyStoreExists(params.workspaceRoot);
    if (!exists) { return ok(undefined); }

    const dbResult = getDb();
    if (!dbResult.ok) { return err(dbResult.error); }

    const storeResult = await readSummaryStore(params.workspaceRoot);
    if (!storeResult.ok) { return ok(undefined); }

    const importResult = importFromJsonStore({
        handle: dbResult.value,
        jsonData: storeResult.value
    });

    if (!importResult.ok) { return err(importResult.error); }

    logger.info('Migrated JSON store to SQLite', { count: importResult.value });
    const deleteResult = await deleteLegacyJsonStore(params.workspaceRoot);
    if (!deleteResult.ok) {
        logger.warn('Could not delete legacy store', { error: deleteResult.error });
    }
    return ok(undefined);
}

/**
 * Reads script content for a task using the provided file system adapter.
 * If file read fails, falls back to task.command.
 */
async function readTaskContent(params: {
    readonly task: TaskItem;
    readonly fs: FileSystemAdapter;
}): Promise<string> {
    const result = await params.fs.readFile(params.task.filePath);
    return result.ok ? result.value : params.task.command;
}

/**
 * Gets a summary for a task via Copilot.
 * NO FALLBACK. If Copilot is unavailable, callers MUST NOT reach here.
 * Fake metadata summaries let tests pass without real AI — that is fraud.
 */
async function getSummary(params: {
    readonly model: vscode.LanguageModelChat;
    readonly task: TaskItem;
    readonly content: string;
}): Promise<string | null> {
    const result = await summariseScript({
        model: params.model,
        label: params.task.label,
        type: params.task.type,
        command: params.task.command,
        content: params.content
    });
    return result.ok ? result.value : null;
}

/**
 * Summarises and embeds a single task, storing in SQLite.
 * NO FALLBACK: model must be real Copilot, embedding must succeed.
 * Storing null embeddings lets tests pass via fallbackTextSearch — that is fraud.
 */
async function processOneTask(params: {
    readonly model: vscode.LanguageModelChat;
    readonly task: TaskItem;
    readonly content: string;
    readonly hash: string;
    readonly workspaceRoot: string;
}): Promise<Result<void, string>> {
    const summary = await getSummary(params);
    if (summary === null) { return err('Copilot summary failed — no embedding stored'); }

    const embedding = await embedOrFail({ text: summary, workspaceRoot: params.workspaceRoot });
    if (!embedding.ok) { return err(embedding.error); }

    const dbResult = getDb();
    if (!dbResult.ok) { return err(dbResult.error); }

    return upsertRow({
        handle: dbResult.value,
        row: {
            commandId: params.task.id,
            contentHash: params.hash,
            summary,
            embedding: embedding.value,
            lastUpdated: new Date().toISOString()
        }
    });
}

/**
 * Embeds text into a vector. Returns error on failure — NEVER null.
 * Silently returning null lets rows get stored without embeddings,
 * which lets search fall to dumb text matching. That is fraud.
 */
async function embedOrFail(params: {
    readonly text: string;
    readonly workspaceRoot: string;
}): Promise<Result<Float32Array, string>> {
    const embedderResult = await getOrCreateEmbedder({
        workspaceRoot: params.workspaceRoot
    });
    if (!embedderResult.ok) { return err(embedderResult.error); }

    return await embedText({
        handle: embedderResult.value,
        text: params.text
    });
}

/**
 * Summarises all tasks that are new or have changed.
 * NO FALLBACK: requires real Copilot model. Without it, returns error.
 * Silently degrading to metadata strings lets tests pass without AI — fraud.
 */
export async function summariseAllTasks(params: {
    readonly tasks: readonly TaskItem[];
    readonly workspaceRoot: string;
    readonly fs: FileSystemAdapter;
    readonly onProgress?: (done: number, total: number) => void;
}): Promise<Result<number, string>> {
    const modelResult = await selectCopilotModel();
    if (!modelResult.ok) { return err(modelResult.error); }

    const dbInit = await initDb(params.workspaceRoot);
    if (!dbInit.ok) { return err(dbInit.error); }

    const pending = await findPending({
        handle: dbInit.value,
        tasks: params.tasks,
        fs: params.fs
    });
    if (pending.length === 0) {
        logger.info('All summaries up to date');
        return ok(0);
    }

    logger.info('Summarising tasks', { count: pending.length });
    let succeeded = 0;
    let failed = 0;

    for (const item of pending) {
        const result = await processOneTask({
            model: modelResult.value,
            task: item.task,
            content: item.content,
            hash: item.hash,
            workspaceRoot: params.workspaceRoot
        });
        if (result.ok) { succeeded++; } else { failed++; }
        params.onProgress?.(succeeded + failed, pending.length);
    }

    if (succeeded === 0 && failed > 0) {
        return err(`All ${failed} tasks failed to embed`);
    }
    return ok(succeeded);
}

interface PendingItem {
    readonly task: TaskItem;
    readonly content: string;
    readonly hash: string;
}

/**
 * Finds tasks that need summarisation (new or changed).
 */
async function findPending(params: {
    readonly handle: DbHandle;
    readonly tasks: readonly TaskItem[];
    readonly fs: FileSystemAdapter;
}): Promise<PendingItem[]> {
    const pending: PendingItem[] = [];
    for (const task of params.tasks) {
        const content = await readTaskContent({ task, fs: params.fs });
        const hash = computeContentHash(content);
        const existing = getRow({ handle: params.handle, commandId: task.id });
        const needsWork = !existing.ok
            || existing.value?.contentHash !== hash
            || existing.value.embedding === null;
        if (needsWork) {
            pending.push({ task, content, hash });
        }
    }
    return pending;
}

/**
 * Performs semantic search using cosine similarity on stored embeddings.
 * NO FALLBACK: if embedder fails, returns error. No dumb text matching.
 * SPEC.md **ai-search-implementation**: Scores must be preserved and displayed.
 */
export async function semanticSearch(params: {
    readonly query: string;
    readonly workspaceRoot: string;
}): Promise<Result<ScoredCandidate[], string>> {
    const dbInit = await initDb(params.workspaceRoot);
    if (!dbInit.ok) { return err(dbInit.error); }

    const rowsResult = getAllRows(dbInit.value);
    if (!rowsResult.ok) { return err(rowsResult.error); }

    if (rowsResult.value.length === 0) { return ok([]); }

    const embResult = await embedOrFail({
        text: params.query,
        workspaceRoot: params.workspaceRoot
    });
    if (!embResult.ok) { return err(embResult.error); }

    const candidates = rowsResult.value.map(r => ({
        id: r.commandId,
        embedding: r.embedding
    }));

    const ranked = rankBySimilarity({
        query: embResult.value,
        candidates,
        topK: SEARCH_TOP_K,
        threshold: SEARCH_SIMILARITY_THRESHOLD
    });

    return ok(ranked);
}

/**
 * Gets all embedding rows for the CommandTreeProvider to read summaries.
 */
export function getAllEmbeddingRows(): Result<EmbeddingRow[], string> {
    const dbResult = getDb();
    if (!dbResult.ok) { return err(dbResult.error); }
    return getAllRows(dbResult.value);
}
