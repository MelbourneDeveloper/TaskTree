/**
 * Text embedding via @huggingface/transformers (all-MiniLM-L6-v2).
 * Uses dynamic import() for ESM compatibility from CJS extension.
 */

import type { Result } from '../models/TaskItem';
import { ok, err } from '../models/TaskItem';
import { logger } from '../utils/logger';

interface Pipeline {
    (text: string, options: { pooling: string; normalize: boolean }): Promise<{ data: Float32Array }>;
    dispose: () => Promise<void>;
}

export interface EmbedderHandle {
    readonly pipeline: Pipeline;
}

/**
 * Creates an embedder by loading the MiniLM model.
 * Downloads ~23MB model on first use.
 */
export async function createEmbedder(params: {
    readonly modelCacheDir: string;
    readonly onProgress?: (progress: unknown) => void;
}): Promise<Result<EmbedderHandle, string>> {
    try {
        const mod = await import('@huggingface/transformers');
        mod.env.cacheDir = params.modelCacheDir;

        const opts = params.onProgress !== undefined
            ? { progress_callback: params.onProgress }
            : {};
        const pipe = await mod.pipeline(
            'feature-extraction',
            'Xenova/all-MiniLM-L6-v2',
            opts
        );

        logger.info('Embedder model loaded', { cacheDir: params.modelCacheDir });
        return ok({ pipeline: pipe as unknown as Pipeline });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to load embedding model';
        return err(msg);
    }
}

/**
 * Disposes the embedder and frees model memory.
 */
export async function disposeEmbedder(handle: EmbedderHandle): Promise<void> {
    try {
        await handle.pipeline.dispose();
    } catch {
        // Best-effort cleanup
    }
}

/**
 * Embeds a single text string into a 384-dim vector.
 */
export async function embedText(params: {
    readonly handle: EmbedderHandle;
    readonly text: string;
}): Promise<Result<Float32Array, string>> {
    try {
        const output = await params.handle.pipeline(
            params.text,
            { pooling: 'mean', normalize: true }
        );
        return ok(new Float32Array(output.data));
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Embedding failed';
        return err(msg);
    }
}

/**
 * Embeds multiple texts in sequence.
 */
export async function embedBatch(params: {
    readonly handle: EmbedderHandle;
    readonly texts: readonly string[];
}): Promise<Result<Float32Array[], string>> {
    const results: Float32Array[] = [];
    for (const text of params.texts) {
        const result = await embedText({ handle: params.handle, text });
        if (!result.ok) {
            return result;
        }
        results.push(result.value);
    }
    return ok(results);
}
