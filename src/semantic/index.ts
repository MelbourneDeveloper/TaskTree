import * as vscode from 'vscode';
import type { TaskItem, Result } from '../models/TaskItem';
import { ok, err } from '../models/TaskItem';
import { logger } from '../utils/logger';
import { readFile } from '../utils/fileUtils';
import {
    readSummaryStore,
    writeSummaryStore,
    computeContentHash,
    needsUpdate,
    getRecord,
    upsertRecord,
    getAllRecords
} from './store';
import type { SummaryStoreData, SummaryRecord } from './store';
import { selectCopilotModel, summariseScript, rankByRelevance } from './summariser';

interface PendingTask {
    readonly task: TaskItem;
    readonly content: string;
    readonly hash: string;
}

/**
 * Checks if the user has enabled AI summaries.
 */
export function isAiEnabled(): boolean {
    return vscode.workspace
        .getConfiguration('commandtree')
        .get<boolean>('enableAiSummaries', false);
}

/**
 * Reads script content for a task, returning the file content.
 */
async function readTaskContent(task: TaskItem): Promise<string> {
    const uri = vscode.Uri.file(task.filePath);
    const result = await readFile(uri);
    return result.ok ? result.value : task.command;
}

/**
 * Finds tasks that need new or updated summaries.
 */
async function findTasksToSummarise(
    tasks: readonly TaskItem[],
    store: SummaryStoreData
): Promise<PendingTask[]> {
    const pending: PendingTask[] = [];
    for (const task of tasks) {
        const content = await readTaskContent(task);
        const hash = computeContentHash(content);
        if (needsUpdate(getRecord(store, task.id), hash)) {
            pending.push({ task, content, hash });
        }
    }
    return pending;
}

/**
 * Summarises a single task and upserts the result into the store.
 */
async function summariseOne(
    model: vscode.LanguageModelChat,
    pending: PendingTask,
    store: SummaryStoreData
): Promise<SummaryStoreData> {
    const result = await summariseScript({
        model,
        label: pending.task.label,
        type: pending.task.type,
        command: pending.task.command,
        content: pending.content
    });

    if (!result.ok) {
        logger.warn('Skipping task summary', { id: pending.task.id, error: result.error });
        return store;
    }

    const record: SummaryRecord = {
        commandId: pending.task.id,
        contentHash: pending.hash,
        summary: result.value,
        lastUpdated: new Date().toISOString()
    };
    return upsertRecord(store, record);
}

/**
 * Processes all pending tasks through the LLM, reporting progress.
 */
async function processPending(params: {
    readonly model: vscode.LanguageModelChat;
    readonly pending: readonly PendingTask[];
    readonly store: SummaryStoreData;
    readonly onProgress?: ((done: number, total: number) => void) | undefined;
}): Promise<SummaryStoreData> {
    let store = params.store;
    let done = 0;
    for (const item of params.pending) {
        store = await summariseOne(params.model, item, store);
        done++;
        params.onProgress?.(done, params.pending.length);
    }
    return store;
}

/**
 * Summarises all tasks that are new or have changed.
 */
export async function summariseAllTasks(params: {
    readonly tasks: readonly TaskItem[];
    readonly workspaceRoot: string;
    readonly onProgress?: (done: number, total: number) => void;
}): Promise<Result<SummaryStoreData, string>> {
    const modelResult = await selectCopilotModel();
    if (!modelResult.ok) { return modelResult; }

    const storeResult = await readSummaryStore(params.workspaceRoot);
    if (!storeResult.ok) { return storeResult; }

    const pending = await findTasksToSummarise(params.tasks, storeResult.value);
    if (pending.length === 0) {
        logger.info('All summaries up to date');
        return ok(storeResult.value);
    }

    logger.info('Summarising tasks', { count: pending.length });
    const store = await processPending({
        model: modelResult.value, pending, store: storeResult.value, onProgress: params.onProgress
    });

    const writeResult = await writeSummaryStore(params.workspaceRoot, store);
    if (!writeResult.ok) { return err(writeResult.error); }
    return ok(store);
}

/**
 * Performs semantic search using LLM-based relevance ranking.
 */
export async function semanticSearch(params: {
    readonly query: string;
    readonly workspaceRoot: string;
}): Promise<Result<string[], string>> {
    const storeResult = await readSummaryStore(params.workspaceRoot);
    if (!storeResult.ok) {
        return storeResult;
    }

    const records = getAllRecords(storeResult.value);
    if (records.length === 0) {
        return ok([]);
    }

    const modelResult = await selectCopilotModel();
    if (!modelResult.ok) {
        return fallbackTextSearch(records, params.query);
    }

    const candidates = records.map(r => ({ id: r.commandId, summary: r.summary }));
    return await rankByRelevance({ model: modelResult.value, query: params.query, candidates });
}

/**
 * Simple text search fallback on summaries when LLM is unavailable.
 */
function fallbackTextSearch(
    records: readonly SummaryRecord[],
    query: string
): Result<string[], string> {
    const lower = query.toLowerCase();
    const matched = records
        .filter(r => r.summary.toLowerCase().includes(lower))
        .map(r => r.commandId);
    return ok(matched);
}
