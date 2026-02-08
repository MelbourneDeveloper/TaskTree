import * as assert from 'assert';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createEmbedder, embedText, disposeEmbedder } from '../../semantic/embedder.js';
import { openDatabase, closeDatabase, initSchema, upsertRow, getAllRows } from '../../semantic/db.js';
import { rankBySimilarity, cosineSimilarity } from '../../semantic/similarity.js';

/**
 * SPEC: ai-embedding-generation, database-schema, ai-search-implementation
 *
 * EMBEDDING PROVIDER TESTS — NO MOCKS, REAL MODEL ONLY
 * Tests the REAL HuggingFace all-MiniLM-L6-v2 model + SQLite storage + cosine similarity search.
 * No VS Code dependencies — pure embedding provider testing.
 *
 * This test proves:
 * 1. The embedding model produces real 384-dim vectors
 * 2. Vectors are correctly serialized to SQLite BLOBs
 * 3. Vector search finds semantically similar commands
 * 4. The search code works end-to-end
 */
// Embedding functionality disabled — skip until re-enabled
suite.skip('Embedding Provider Tests (REAL MODEL)', function () {
    this.timeout(60000); // HuggingFace model download can be slow on first run

    const testDbPath = path.join(os.tmpdir(), `commandtree-test-${Date.now()}.sqlite3`);
    const modelCacheDir = path.join(os.tmpdir(), 'commandtree-test-models');

    suiteTeardown(() => {
        // Clean up test database
        if (fs.existsSync(testDbPath)) {
            fs.unlinkSync(testDbPath);
        }
    });

    test('REAL embedding pipeline: embed → store → search → find semantically similar', async () => {
        // Step 1: Create REAL embedder with HuggingFace model
        const embedderResult = await createEmbedder({ modelCacheDir });
        assert.ok(embedderResult.ok, `Failed to create embedder: ${embedderResult.ok ? '' : embedderResult.error}`);
        const embedder = embedderResult.value;

        // Step 2: Open database and initialize schema
        const dbResult = await openDatabase(testDbPath);
        assert.ok(dbResult.ok, `Failed to open database: ${dbResult.ok ? '' : dbResult.error}`);
        const db = dbResult.value;

        const schemaResult = initSchema(db);
        assert.ok(schemaResult.ok, `Failed to init schema: ${schemaResult.ok ? '' : schemaResult.error}`);

        // Step 3: Create REAL embeddings for test commands
        const testCommands = [
            { id: 'build', summary: 'Build and compile the TypeScript project' },
            { id: 'test', summary: 'Run the test suite with Mocha' },
            { id: 'install', summary: 'Install NPM dependencies from package.json' },
            { id: 'clean', summary: 'Delete build artifacts and generated files' },
            { id: 'watch', summary: 'Watch files and rebuild on changes' },
        ];

        const embeddings: Array<{ id: string; embedding: Float32Array }> = [];

        for (const cmd of testCommands) {
            const embeddingResult = await embedText({ handle: embedder, text: cmd.summary });
            assert.ok(embeddingResult.ok, `Failed to embed "${cmd.summary}": ${embeddingResult.ok ? '' : embeddingResult.error}`);

            const embedding = embeddingResult.value;
            assert.strictEqual(embedding.length, 384, `Expected 384 dimensions, got ${embedding.length}`);

            // Verify embedding is normalized (unit vector)
            let magnitude = 0;
            for (const value of embedding) {
                magnitude += value * value;
            }
            const norm = Math.sqrt(magnitude);
            assert.ok(Math.abs(norm - 1.0) < 0.01, `Embedding should be normalized, got magnitude ${norm}`);

            embeddings.push({ id: cmd.id, embedding });

            // Step 4: Store in SQLite
            const row = {
                commandId: cmd.id,
                contentHash: `hash-${cmd.id}`,
                summary: cmd.summary,
                securityWarning: null,
                embedding,
                lastUpdated: new Date().toISOString(),
            };
            const upsertResult = upsertRow({ handle: db, row });
            assert.ok(upsertResult.ok, `Failed to upsert row: ${upsertResult.ok ? '' : upsertResult.error}`);
        }

        // Step 5: Verify data was written to database
        const allRowsResult = getAllRows(db);
        assert.ok(allRowsResult.ok, `Failed to get all rows: ${allRowsResult.ok ? '' : allRowsResult.error}`);
        const allRows = allRowsResult.value;
        assert.strictEqual(allRows.length, testCommands.length, `Expected ${testCommands.length} rows, got ${allRows.length}`);

        // Verify all embeddings are non-null and correct size
        for (const row of allRows) {
            assert.ok(row.embedding !== null, `Row ${row.commandId} has null embedding`);
            assert.strictEqual(row.embedding.length, 384, `Row ${row.commandId} embedding has wrong size: ${row.embedding.length}`);
        }

        // Step 6: Create query embedding for "compile code"
        const queryResult = await embedText({ handle: embedder, text: 'compile code' });
        assert.ok(queryResult.ok, `Failed to embed query: ${queryResult.ok ? '' : queryResult.error}`);
        const queryEmbedding = queryResult.value;

        // Step 7: Use REAL search code to find semantically similar commands
        const candidates = allRows.map(row => ({
            id: row.commandId,
            embedding: row.embedding,
        }));

        const results = rankBySimilarity({
            query: queryEmbedding,
            candidates,
            topK: 3,
            threshold: 0.0,
        });

        // Step 8: Verify semantic search works correctly
        assert.ok(results.length > 0, 'Search should return results');

        // "compile code" should be most similar to "build" (compile and build are semantically similar)
        const topResult = results[0];
        assert.ok(topResult !== undefined, 'Should have at least one result');
        assert.strictEqual(topResult.id, 'build', `Expected "build" to be most similar to "compile code", got "${topResult.id}"`);

        // Score should be reasonably high (>0.4 for semantically related terms with all-MiniLM-L6-v2)
        assert.ok(topResult.score > 0.4, `Expected similarity score > 0.4, got ${topResult.score}`);

        // "test" and "install" should be less similar than "build"
        const buildScore = topResult.score;
        const otherResults = results.slice(1);
        for (const result of otherResults) {
            assert.ok(result.score < buildScore, `"${result.id}" should have lower score than "build"`);
        }

        // Step 9: Clean up
        await disposeEmbedder(embedder);
        const closeResult = closeDatabase(db);
        assert.ok(closeResult.ok, `Failed to close database: ${closeResult.ok ? '' : closeResult.error}`);
    });

    test('embedding proximity: semantically similar texts have high similarity', async () => {
        const embedderResult = await createEmbedder({ modelCacheDir });
        assert.ok(embedderResult.ok);
        const embedder = embedderResult.value;

        // Embed two semantically similar texts
        const text1Result = await embedText({ handle: embedder, text: 'run unit tests' });
        const text2Result = await embedText({ handle: embedder, text: 'execute test suite' });

        assert.ok(text1Result.ok);
        assert.ok(text2Result.ok);

        const embedding1 = text1Result.value;
        const embedding2 = text2Result.value;

        // Use the REAL similarity function
        const similarity = cosineSimilarity(embedding1, embedding2);

        // Semantically similar texts should have high similarity (> 0.6 for all-MiniLM-L6-v2)
        assert.ok(similarity > 0.6, `Expected similarity > 0.6 for similar texts, got ${similarity}`);

        // Clean up
        await disposeEmbedder(embedder);
    });

    test('embedding proximity: semantically different texts have low similarity', async () => {
        const embedderResult = await createEmbedder({ modelCacheDir });
        assert.ok(embedderResult.ok);
        const embedder = embedderResult.value;

        // Embed two completely unrelated texts
        const text1Result = await embedText({ handle: embedder, text: 'compile TypeScript source code' });
        const text2Result = await embedText({ handle: embedder, text: 'clean up temporary files' });

        assert.ok(text1Result.ok);
        assert.ok(text2Result.ok);

        const embedding1 = text1Result.value;
        const embedding2 = text2Result.value;

        const similarity = cosineSimilarity(embedding1, embedding2);

        // Semantically different texts should have lower similarity (< 0.6)
        assert.ok(similarity < 0.6, `Expected similarity < 0.6 for different texts, got ${similarity}`);

        await disposeEmbedder(embedder);
    });
});
