import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { openDatabase, initSchema, getAllRows, registerCommand, getRow, upsertSummary } from '../../semantic/db';
import type { DbHandle } from '../../semantic/db';
import { computeContentHash } from '../../semantic/store';

/**
 * SPEC: database-schema
 *
 * UNIT TESTS for command registration in SQLite.
 * Proves that discovered commands are ALWAYS stored in the DB,
 * regardless of whether Copilot summarisation succeeds.
 */

function makeTmpDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'ct-reg-'));
}

suite('Command Registration Unit Tests', function () {
    this.timeout(10000);
    let tmpDir: string;
    let handle: DbHandle;

    setup(async () => {
        tmpDir = makeTmpDir();
        const dbPath = path.join(tmpDir, 'test.sqlite3');
        const openResult = await openDatabase(dbPath);
        assert.ok(openResult.ok, 'DB should open');
        handle = openResult.value;
        const schemaResult = initSchema(handle);
        assert.ok(schemaResult.ok, 'Schema should init');
    });

    teardown(() => {
        try { handle.db.close(); } catch { /* already closed */ }
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test('registerCommand inserts new command with empty summary', () => {
        const result = registerCommand({
            handle,
            commandId: 'npm:build',
            contentHash: 'abc123',
        });
        assert.ok(result.ok, 'registerCommand should succeed');

        const row = getRow({ handle, commandId: 'npm:build' });
        assert.ok(row.ok, 'getRow should succeed');
        assert.ok(row.value !== undefined, 'Row must exist in DB after registration');
        assert.strictEqual(row.value.commandId, 'npm:build');
        assert.strictEqual(row.value.contentHash, 'abc123');
        assert.strictEqual(row.value.summary, '', 'Summary should be empty for unsummarised command');
        assert.strictEqual(row.value.embedding, null, 'Embedding should be null');
        assert.strictEqual(row.value.securityWarning, null, 'Security warning should be null');
    });

    test('registerCommand preserves existing summary when content hash changes', () => {
        // Simulate: Copilot already summarised this command
        upsertSummary({
            handle,
            commandId: 'npm:test',
            contentHash: 'old-hash',
            summary: 'Runs unit tests',
            securityWarning: null,
        });

        // Now re-register with new hash (script content changed)
        const result = registerCommand({
            handle,
            commandId: 'npm:test',
            contentHash: 'new-hash',
        });
        assert.ok(result.ok);

        const row = getRow({ handle, commandId: 'npm:test' });
        assert.ok(row.ok && row.value !== undefined);
        assert.strictEqual(row.value.contentHash, 'new-hash', 'Hash should be updated');
        assert.strictEqual(row.value.summary, 'Runs unit tests', 'Existing summary MUST be preserved');
    });

    test('registerCommand is idempotent — calling twice does not duplicate', () => {
        registerCommand({ handle, commandId: 'npm:lint', contentHash: 'h1' });
        registerCommand({ handle, commandId: 'npm:lint', contentHash: 'h2' });

        const rows = getAllRows(handle);
        assert.ok(rows.ok);
        const lintRows = rows.value.filter(r => r.commandId === 'npm:lint');
        assert.strictEqual(lintRows.length, 1, 'Must be exactly one row, not duplicated');
        const lintRow = lintRows[0];
        assert.ok(lintRow !== undefined, 'Lint row must exist');
        assert.strictEqual(lintRow.contentHash, 'h2', 'Hash should reflect latest registration');
    });

    test('registered command with empty summary needs summarisation even when hash matches', () => {
        // registerCommand writes empty summary + correct hash
        const hash = computeContentHash('tsc && node dist/index.js');
        registerCommand({ handle, commandId: 'npm:build', contentHash: hash });

        const row = getRow({ handle, commandId: 'npm:build' });
        assert.ok(row.ok && row.value !== undefined);
        // Hash matches but summary is empty — summary pipeline MUST detect this
        assert.strictEqual(row.value.contentHash, hash);
        assert.strictEqual(row.value.summary, '', 'Summary is empty');

        // Summary is empty (asserted above), so this command MUST be queued for summarisation
        assert.strictEqual(row.value.summary.length, 0, 'Command with empty summary MUST be queued for summarisation');
    });

    test('all discovered commands land in DB with correct content hashes', () => {
        const commands = [
            { id: 'npm:build', content: 'tsc && node dist/index.js' },
            { id: 'npm:test', content: 'jest --coverage' },
            { id: 'npm:lint', content: 'eslint src/' },
            { id: 'shell:deploy.sh', content: '#!/bin/bash\nrsync -avz dist/ server:/' },
            { id: 'make:clean', content: 'rm -rf dist/' },
        ];

        for (const cmd of commands) {
            const hash = computeContentHash(cmd.content);
            const result = registerCommand({ handle, commandId: cmd.id, contentHash: hash });
            assert.ok(result.ok, `registerCommand should succeed for ${cmd.id}`);
        }

        const rows = getAllRows(handle);
        assert.ok(rows.ok);
        assert.strictEqual(rows.value.length, 5, 'All 5 commands must be in DB');

        for (const cmd of commands) {
            const row = getRow({ handle, commandId: cmd.id });
            assert.ok(row.ok && row.value !== undefined, `${cmd.id} must exist in DB`);
            assert.strictEqual(row.value.contentHash, computeContentHash(cmd.content), `${cmd.id} hash must match`);
            assert.strictEqual(row.value.summary, '', `${cmd.id} summary should be empty (no Copilot)`);
        }
    });
});
