import * as assert from 'assert';
import { cosineSimilarity, rankBySimilarity } from '../../semantic/similarity';

/**
 * SPEC: ai-search-implementation
 *
 * UNIT TESTS for cosine similarity vector math.
 * Proves that vector proximity search actually works correctly.
 * Pure math - no VS Code, no I/O.
 */
suite('Cosine Similarity Unit Tests', function () {
    this.timeout(5000);

    suite('cosineSimilarity', () => {
        test('identical vectors have similarity 1.0', () => {
            const a = new Float32Array([1, 2, 3, 4, 5]);
            const b = new Float32Array([1, 2, 3, 4, 5]);
            const sim = cosineSimilarity(a, b);
            assert.ok(
                Math.abs(sim - 1.0) < 0.0001,
                `Identical vectors should have similarity ~1.0, got ${sim}`
            );
        });

        test('orthogonal vectors have similarity 0.0', () => {
            const a = new Float32Array([1, 0, 0]);
            const b = new Float32Array([0, 1, 0]);
            const sim = cosineSimilarity(a, b);
            assert.ok(
                Math.abs(sim) < 0.0001,
                `Orthogonal vectors should have similarity ~0.0, got ${sim}`
            );
        });

        test('opposite vectors have similarity -1.0', () => {
            const a = new Float32Array([1, 2, 3]);
            const b = new Float32Array([-1, -2, -3]);
            const sim = cosineSimilarity(a, b);
            assert.ok(
                Math.abs(sim - (-1.0)) < 0.0001,
                `Opposite vectors should have similarity ~-1.0, got ${sim}`
            );
        });

        test('similar vectors have high positive similarity', () => {
            const a = new Float32Array([1, 2, 3, 4, 5]);
            const b = new Float32Array([1.1, 2.1, 3.1, 4.1, 5.1]);
            const sim = cosineSimilarity(a, b);
            assert.ok(
                sim > 0.99,
                `Similar vectors should have high similarity, got ${sim}`
            );
        });

        test('dissimilar vectors have low similarity', () => {
            const a = new Float32Array([1, 0, 0, 0, 0]);
            const b = new Float32Array([0, 0, 0, 0, 1]);
            const sim = cosineSimilarity(a, b);
            assert.ok(
                Math.abs(sim) < 0.01,
                `Dissimilar vectors should have low similarity, got ${sim}`
            );
        });

        test('works with 384-dim vectors (MiniLM embedding size)', () => {
            const a = new Float32Array(384);
            const b = new Float32Array(384);
            for (let i = 0; i < 384; i++) {
                a[i] = Math.sin(i * 0.1);
                b[i] = Math.sin(i * 0.1 + 0.01);
            }
            const sim = cosineSimilarity(a, b);
            assert.ok(
                sim > 0.99,
                `Slightly shifted 384-dim vectors should be very similar, got ${sim}`
            );
        });

        test('zero vector returns 0.0', () => {
            const a = new Float32Array([0, 0, 0]);
            const b = new Float32Array([1, 2, 3]);
            const sim = cosineSimilarity(a, b);
            assert.strictEqual(sim, 0, 'Zero vector should return 0.0');
        });

        test('is commutative: sim(a,b) === sim(b,a)', () => {
            const a = new Float32Array([3, 7, 2, 9, 1]);
            const b = new Float32Array([5, 1, 8, 3, 6]);
            const simAB = cosineSimilarity(a, b);
            const simBA = cosineSimilarity(b, a);
            assert.ok(
                Math.abs(simAB - simBA) < 0.0001,
                `sim(a,b)=${simAB} should equal sim(b,a)=${simBA}`
            );
        });

        test('magnitude does not affect similarity', () => {
            const a = new Float32Array([1, 2, 3]);
            const b = new Float32Array([2, 4, 6]);
            const sim = cosineSimilarity(a, b);
            assert.ok(
                Math.abs(sim - 1.0) < 0.0001,
                `Scaled vectors should have similarity 1.0, got ${sim}`
            );
        });
    });

    suite('rankBySimilarity', () => {
        test('returns candidates ranked by descending similarity', () => {
            const query = new Float32Array([1, 0, 0]);
            const candidates = [
                { id: 'far', embedding: new Float32Array([0, 1, 0]) },
                { id: 'close', embedding: new Float32Array([0.9, 0.1, 0]) },
                { id: 'medium', embedding: new Float32Array([0.5, 0.5, 0]) },
            ];

            const results = rankBySimilarity({ query, candidates, topK: 3, threshold: 0 });

            assert.strictEqual(results.length, 3, 'Should return all 3 candidates');
            assert.strictEqual(results[0]?.id, 'close', 'Most similar should be first');
            assert.strictEqual(results[1]?.id, 'medium', 'Medium similar should be second');
            assert.strictEqual(results[2]?.id, 'far', 'Least similar should be last');
        });

        test('respects topK limit', () => {
            const query = new Float32Array([1, 0, 0]);
            const candidates = [
                { id: 'a', embedding: new Float32Array([1, 0, 0]) },
                { id: 'b', embedding: new Float32Array([0.9, 0.1, 0]) },
                { id: 'c', embedding: new Float32Array([0.5, 0.5, 0]) },
                { id: 'd', embedding: new Float32Array([0, 1, 0]) },
            ];

            const results = rankBySimilarity({ query, candidates, topK: 2, threshold: 0 });
            assert.strictEqual(results.length, 2, 'Should return only topK candidates');
            assert.strictEqual(results[0]?.id, 'a');
            assert.strictEqual(results[1]?.id, 'b');
        });

        test('respects similarity threshold', () => {
            const query = new Float32Array([1, 0, 0]);
            const candidates = [
                { id: 'high', embedding: new Float32Array([0.95, 0.05, 0]) },
                { id: 'low', embedding: new Float32Array([0, 1, 0]) },
            ];

            const results = rankBySimilarity({ query, candidates, topK: 10, threshold: 0.5 });
            assert.strictEqual(results.length, 1, 'Should filter out below-threshold candidates');
            assert.strictEqual(results[0]?.id, 'high');
        });

        test('returns empty array when no candidates meet threshold', () => {
            const query = new Float32Array([1, 0, 0]);
            const candidates = [
                { id: 'a', embedding: new Float32Array([0, 1, 0]) },
                { id: 'b', embedding: new Float32Array([0, 0, 1]) },
            ];

            const results = rankBySimilarity({ query, candidates, topK: 10, threshold: 0.9 });
            assert.strictEqual(results.length, 0, 'No candidates should meet high threshold');
        });

        test('returns empty array for empty candidates', () => {
            const query = new Float32Array([1, 0, 0]);
            const results = rankBySimilarity({ query, candidates: [], topK: 10, threshold: 0 });
            assert.strictEqual(results.length, 0);
        });

        test('result scores are in descending order', () => {
            const query = new Float32Array([1, 0, 0, 0]);
            const candidates = [
                { id: 'a', embedding: new Float32Array([0.1, 0.9, 0, 0]) },
                { id: 'b', embedding: new Float32Array([0.8, 0.2, 0, 0]) },
                { id: 'c', embedding: new Float32Array([0.5, 0.5, 0, 0]) },
            ];

            const results = rankBySimilarity({ query, candidates, topK: 10, threshold: 0 });

            for (let i = 1; i < results.length; i++) {
                const prev = results[i - 1];
                const curr = results[i];
                assert.ok(
                    prev !== undefined && curr !== undefined && prev.score >= curr.score,
                    `Score ${prev?.score} should be >= ${curr?.score}`
                );
            }
        });

        test('skips candidates with null embeddings', () => {
            const query = new Float32Array([1, 0, 0]);
            const candidates = [
                { id: 'has-embed', embedding: new Float32Array([0.9, 0.1, 0]) },
                { id: 'no-embed', embedding: null as unknown as Float32Array },
            ];

            const results = rankBySimilarity({ query, candidates, topK: 10, threshold: 0 });
            assert.strictEqual(results.length, 1, 'Should skip null embeddings');
            assert.strictEqual(results[0]?.id, 'has-embed');
        });
    });
});
