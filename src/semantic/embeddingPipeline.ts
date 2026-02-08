/**
 * SPEC: ai-semantic-search
 *
 * Embedding pipeline: generates embeddings for commands and stores them in SQLite.
 * COMPLETELY DECOUPLED from Copilot summarisation.
 * Does NOT import summariser, summaryPipeline, or vscode LM APIs.
 */

import type { Result } from '../models/TaskItem';
import { ok, err } from '../models/TaskItem';
import { logger } from '../utils/logger';
import { initDb } from './lifecycle';
import { getOrCreateEmbedder } from './lifecycle';
import { getRowsMissingEmbedding, upsertEmbedding } from './db';
import type { EmbeddingRow } from './db';
import { embedText } from './embedder';

/**
 * Embeds text into a vector. Returns error on failure — NEVER null.
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
 * Processes a single row: embeds its summary and stores the embedding.
 */
async function processOneEmbedding(params: {
    readonly row: EmbeddingRow;
    readonly workspaceRoot: string;
}): Promise<Result<void, string>> {
    const dbInit = await initDb(params.workspaceRoot);
    if (!dbInit.ok) { return err(dbInit.error); }

    const embedding = await embedOrFail({
        text: params.row.summary,
        workspaceRoot: params.workspaceRoot
    });
    if (!embedding.ok) { return err(embedding.error); }

    return upsertEmbedding({
        handle: dbInit.value,
        commandId: params.row.commandId,
        embedding: embedding.value
    });
}

/**
 * Generates embeddings for all commands that have a summary but no embedding.
 * Reads summaries from the DB — does NOT call Copilot.
 */
export async function embedAllPending(params: {
    readonly workspaceRoot: string;
    readonly onProgress?: (done: number, total: number) => void;
}): Promise<Result<number, string>> {
    logger.info('[EMBED] embedAllPending START');

    const dbInit = await initDb(params.workspaceRoot);
    if (!dbInit.ok) {
        logger.error('[EMBED] initDb failed', { error: dbInit.error });
        return err(dbInit.error);
    }

    const pendingResult = getRowsMissingEmbedding(dbInit.value);
    if (!pendingResult.ok) { return err(pendingResult.error); }

    const pending = pendingResult.value;
    logger.info('[EMBED] rows missing embeddings', { count: pending.length });

    if (pending.length === 0) {
        logger.info('[EMBED] All embeddings up to date');
        return ok(0);
    }

    let succeeded = 0;
    let failed = 0;

    for (const row of pending) {
        const result = await processOneEmbedding({
            row,
            workspaceRoot: params.workspaceRoot
        });
        if (result.ok) {
            succeeded++;
        } else {
            failed++;
            logger.error('[EMBED] Embedding failed', { id: row.commandId, error: result.error });
        }
        params.onProgress?.(succeeded + failed, pending.length);
    }

    logger.info('[EMBED] complete', { succeeded, failed });

    if (succeeded === 0 && failed > 0) {
        return err(`All ${failed} embeddings failed`);
    }
    return ok(succeeded);
}
