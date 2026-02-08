/**
 * SPEC: ai-semantic-search
 *
 * Semantic search facade.
 * Re-exports the two INDEPENDENT pipelines and provides search.
 *
 * - Summary pipeline (summaryPipeline.ts) generates Copilot summaries.
 * - Embedding pipeline (embeddingPipeline.ts) generates vector embeddings.
 * - They share the SQLite DB but do NOT import each other.
 */

import type { Result } from '../models/TaskItem';
import { ok, err } from '../models/TaskItem';
import { initDb, getDb, getOrCreateEmbedder, disposeSemantic } from './lifecycle';
import { getAllRows } from './db';
import type { EmbeddingRow } from './db';
import { embedText } from './embedder';
import { rankBySimilarity, type ScoredCandidate } from './similarity';

export { summariseAllTasks, registerAllCommands } from './summaryPipeline';
export { embedAllPending } from './embeddingPipeline';

const SEARCH_TOP_K = 20;
const SEARCH_SIMILARITY_THRESHOLD = 0.3;

/**
 * Checks if the user has enabled AI summaries.
 */
export function isAiEnabled(enabled: boolean): boolean {
    return enabled;
}

/**
 * Initialises the semantic search subsystem.
 */
export async function initSemanticStore(workspaceRoot: string): Promise<Result<void, string>> {
    const result = await initDb(workspaceRoot);
    if (!result.ok) { return err(result.error); }
    return ok(undefined);
}

/**
 * Disposes all semantic search resources.
 */
export async function disposeSemanticStore(): Promise<void> {
    await disposeSemantic();
}

/**
 * Performs semantic search using cosine similarity on stored embeddings.
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

    const embedderResult = await getOrCreateEmbedder({
        workspaceRoot: params.workspaceRoot
    });
    if (!embedderResult.ok) { return err(embedderResult.error); }

    const embResult = await embedText({
        handle: embedderResult.value,
        text: params.query
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
