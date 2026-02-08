/**
 * Text embedding via @huggingface/transformers (all-MiniLM-L6-v2).
 * Uses WASM backend (onnxruntime-web) to avoid shipping 208MB native binaries.
 */

import type { Result } from '../models/Result';
import { ok, err } from '../models/Result';

// const ORT_SYMBOL = Symbol.for('onnxruntime');

interface Pipeline {
    (text: string, options: { pooling: string; normalize: boolean }): Promise<{ data: Float32Array }>;
    dispose: () => Promise<void>;
}

export interface EmbedderHandle {
    readonly pipeline: Pipeline;
}

// --- Embedding disabled: injectWasmBackend and createEmbedder commented out ---
// /** Injects WASM runtime so transformers.js skips the native onnxruntime-node binary. */
// async function injectWasmBackend(): Promise<void> {
//     if (ORT_SYMBOL in globalThis) { return; }
//     const ort = await import('onnxruntime-web');
//     (globalThis as Record<symbol, unknown>)[ORT_SYMBOL] = ort;
// }

/**
 * Creates an embedder by loading the MiniLM model.
 * DISABLED — embedding functionality is turned off.
 */
export async function createEmbedder(_params: {
    readonly modelCacheDir: string;
    readonly onProgress?: (progress: unknown) => void;
}): Promise<Result<EmbedderHandle, string>> {
    await Promise.resolve();
    return err('Embedding is disabled');
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
