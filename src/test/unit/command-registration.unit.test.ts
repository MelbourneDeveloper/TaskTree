import * as assert from 'assert';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import type { TaskItem } from '../../models/TaskItem';
import { ok } from '../../models/TaskItem';
import { openDatabase, initSchema, getAllRows, registerCommand, getRow } from '../../semantic/db';
import type { DbHandle } from '../../semantic/db';
import type { FileSystemAdapter } from '../../semantic/adapters';
import { registerAllCommands } from '../../semantic/summaryPipeline';
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

function makeTask(id: string, command: string): TaskItem {
    return {
        id,
        label: id,
        type: 'npm',
        category: 'NPM Scripts',
        command,
        filePath: '/fake/package.json',
        tags: [],
    };
}

const FAKE_FS: FileSystemAdapter = {
    readFile: async () => ok('echo hello'),
    writeFile: async () => ok(undefined),
    exists: async () => false,
    delete: async () => ok(undefined),
};

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
        assert.ok(row.value !== undefined, 'Row should exist');
        assert.strictEqual(row.value.commandId, 'npm:build');
        assert.strictEqual(row.value.contentHash, 'abc123');
        assert.strictEqual(row.value.summary, '', 'Summary should be empty');
        assert.strictEqual(row.value.embedding, null, 'Embedding should be null');
        assert.strictEqual(row.value.securityWarning, null, 'Security warning should be null');
    });

    test('registerCommand preserves existing summary when updating hash', () => {
        const { upsertSummary } = require('../../semantic/db');
        upsertSummary({
            handle,
            commandId: 'npm:test',
            contentHash: 'old-hash',
            summary: 'Runs unit tests',
            securityWarning: null,
        });

        const result = registerCommand({
            handle,
            commandId: 'npm:test',
            contentHash: 'new-hash',
        });
        assert.ok(result.ok);

        const row = getRow({ handle, commandId: 'npm:test' });
        assert.ok(row.ok && row.value !== undefined);
        assert.strictEqual(row.value.contentHash, 'new-hash', 'Hash should be updated');
        assert.strictEqual(row.value.summary, 'Runs unit tests', 'Summary must be preserved');
    });

    test('registerAllCommands stores all tasks in DB', async () => {
        const tasks = [
            makeTask('npm:build', 'npm run build'),
            makeTask('npm:test', 'npm test'),
            makeTask('npm:lint', 'npm run lint'),
        ];

        const dbDir = path.join(tmpDir, '.commandtree');
        fs.mkdirSync(dbDir, { recursive: true });
        const dbPath = path.join(dbDir, 'commandtree.sqlite3');
        fs.copyFileSync(handle.path, dbPath);
        handle.db.close();

        const result = await registerAllCommands({
            tasks,
            workspaceRoot: tmpDir,
            fs: FAKE_FS,
        });

        assert.ok(result.ok, `registerAllCommands should succeed: ${result.ok ? '' : result.error}`);
        assert.strictEqual(result.value, 3, 'All 3 tasks should be registered');

        const reopened = await openDatabase(dbPath);
        assert.ok(reopened.ok);
        const rows = getAllRows(reopened.value);
        assert.ok(rows.ok);
        assert.strictEqual(rows.value.length, 3, 'DB should have 3 rows');

        const ids = rows.value.map(r => r.commandId).sort();
        assert.deepStrictEqual(ids, ['npm:build', 'npm:lint', 'npm:test']);

        const expectedHash = computeContentHash('echo hello');
        for (const row of rows.value) {
            assert.strictEqual(row.contentHash, expectedHash, `${row.commandId} hash should match`);
            assert.strictEqual(row.summary, '', `${row.commandId} summary should be empty`);
        }
        reopened.value.db.close();
    });
});
