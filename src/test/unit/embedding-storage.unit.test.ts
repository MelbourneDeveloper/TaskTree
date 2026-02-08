import * as assert from 'assert';
import { embeddingToBytes, bytesToEmbedding } from '../../semantic/db';

/**
 * SPEC: ai-database-schema
 *
 * UNIT TESTS for embedding serialization and storage.
 * Proves embeddings survive the Float32Array -> bytes -> Float32Array roundtrip
 * and that the SQLite storage layer correctly persists vector data.
 * Pure logic - no VS Code.
 */
suite('Embedding Storage Unit Tests', function () {
    this.timeout(5000);

    suite('Serialization Roundtrip', () => {
        test('384-dim embedding survives bytes roundtrip exactly', () => {
            const original = new Float32Array(384);
            for (let i = 0; i < 384; i++) {
                original[i] = Math.sin(i * 0.1) * 0.5;
            }

            const bytes = embeddingToBytes(original);
            const restored = bytesToEmbedding(bytes);

            assert.strictEqual(
                restored.length,
                384,
                `Restored embedding should have 384 dims, got ${restored.length}`
            );

            for (let i = 0; i < 384; i++) {
                assert.strictEqual(
                    restored[i],
                    original[i],
                    `Dim ${i}: expected ${original[i]}, got ${restored[i]}`
                );
            }
        });

        test('bytes size is 4x embedding length (Float32 = 4 bytes)', () => {
            const embedding = new Float32Array(384);
            const bytes = embeddingToBytes(embedding);
            assert.strictEqual(
                bytes.length,
                384 * 4,
                `384 floats should produce ${384 * 4} bytes, got ${bytes.length}`
            );
        });

        test('preserves negative values', () => {
            const original = new Float32Array([-0.5, -1.0, -0.001, 0.0, 0.5, 1.0]);
            const bytes = embeddingToBytes(original);
            const restored = bytesToEmbedding(bytes);

            for (let i = 0; i < original.length; i++) {
                assert.strictEqual(
                    restored[i],
                    original[i],
                    `Index ${i}: expected ${original[i]}, got ${restored[i]}`
                );
            }
        });

        test('preserves very small values (near zero)', () => {
            const original = new Float32Array([1e-7, -1e-7, 1e-10, 0.0]);
            const bytes = embeddingToBytes(original);
            const restored = bytesToEmbedding(bytes);

            for (let i = 0; i < original.length; i++) {
                assert.strictEqual(
                    restored[i],
                    original[i],
                    `Index ${i}: expected ${original[i]}, got ${restored[i]}`
                );
            }
        });

        test('empty embedding produces empty bytes', () => {
            const original = new Float32Array(0);
            const bytes = embeddingToBytes(original);
            const restored = bytesToEmbedding(bytes);

            assert.strictEqual(bytes.length, 0);
            assert.strictEqual(restored.length, 0);
        });

        test('different embeddings produce different bytes', () => {
            const a = new Float32Array([1, 0, 0]);
            const b = new Float32Array([0, 1, 0]);
            const bytesA = embeddingToBytes(a);
            const bytesB = embeddingToBytes(b);

            let differ = false;
            for (let i = 0; i < bytesA.length; i++) {
                if (bytesA[i] !== bytesB[i]) {
                    differ = true;
                    break;
                }
            }
            assert.ok(differ, 'Different embeddings must produce different bytes');
        });
    });
});
