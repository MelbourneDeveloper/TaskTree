/**
 * Pure vector math for semantic similarity search.
 * No VS Code dependencies — testable in isolation.
 */

export interface ScoredCandidate {
    readonly id: string;
    readonly score: number;
}

interface RankParams {
    readonly query: Float32Array;
    readonly candidates: ReadonlyArray<{ readonly id: string; readonly embedding: Float32Array | null }>;
    readonly topK: number;
    readonly threshold: number;
}

/**
 * Computes cosine similarity between two vectors.
 * Returns 0 for zero-magnitude vectors.
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
    let dot = 0;
    let magA = 0;
    let magB = 0;
    for (let i = 0; i < a.length; i++) {
        dot += (a[i] ?? 0) * (b[i] ?? 0);
        magA += (a[i] ?? 0) * (a[i] ?? 0);
        magB += (b[i] ?? 0) * (b[i] ?? 0);
    }
    const denom = Math.sqrt(magA) * Math.sqrt(magB);
    return denom === 0 ? 0 : dot / denom;
}

/**
 * Ranks candidates by cosine similarity to query, filtered and sorted.
 */
export function rankBySimilarity(params: RankParams): ScoredCandidate[] {
    const scored: ScoredCandidate[] = [];
    for (const c of params.candidates) {
        if (c.embedding === null) { continue; }
        const score = cosineSimilarity(params.query, c.embedding);
        if (score >= params.threshold) {
            scored.push({ id: c.id, score });
        }
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, params.topK);
}
