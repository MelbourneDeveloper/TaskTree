/**
 * Embedding serialization and SQLite storage layer.
 * Uses node-sqlite3-wasm for WASM-based SQLite with BLOB embedding storage.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../models/Result';
import { ok, err } from '../models/Result';
import type { SummaryStoreData } from './store';

import type { Database as SqliteDatabase } from 'node-sqlite3-wasm';

export interface EmbeddingRow {
    readonly commandId: string;
    readonly contentHash: string;
    readonly summary: string;
    readonly embedding: Float32Array | null;
    readonly lastUpdated: string;
}

export interface DbHandle {
    readonly db: SqliteDatabase;
    readonly path: string;
}

/**
 * Serializes a Float32Array embedding to a Uint8Array for storage.
 */
export function embeddingToBytes(embedding: Float32Array): Uint8Array {
    const buffer = new ArrayBuffer(embedding.length * 4);
    const view = new Float32Array(buffer);
    view.set(embedding);
    return new Uint8Array(buffer);
}

/**
 * Deserializes a Uint8Array back to a Float32Array embedding.
 */
export function bytesToEmbedding(bytes: Uint8Array): Float32Array {
    const buffer = new ArrayBuffer(bytes.length);
    const view = new Uint8Array(buffer);
    view.set(bytes);
    return new Float32Array(buffer);
}

/**
 * Opens a SQLite database at the given path.
 */
export async function openDatabase(dbPath: string): Promise<Result<DbHandle, string>> {
    try {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        const mod = await import('node-sqlite3-wasm');
        const db = new mod.default.Database(dbPath);
        return ok({ db, path: dbPath });
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to open database';
        return err(msg);
    }
}

/**
 * Closes a database connection.
 */
export function closeDatabase(handle: DbHandle): Result<void, string> {
    try {
        handle.db.close();
        return ok(undefined);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to close database';
        return err(msg);
    }
}

/**
 * Creates the embeddings and tags tables if they do not exist.
 */
export function initSchema(handle: DbHandle): Result<void, string> {
    try {
        handle.db.exec(`
            CREATE TABLE IF NOT EXISTS embeddings (
                command_id TEXT PRIMARY KEY,
                content_hash TEXT NOT NULL,
                summary TEXT NOT NULL,
                embedding BLOB,
                last_updated TEXT NOT NULL
            )
        `);
        handle.db.exec(`
            CREATE TABLE IF NOT EXISTS tags (
                tag_name TEXT NOT NULL,
                pattern TEXT NOT NULL,
                sort_order INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (tag_name, pattern)
            )
        `);
        return ok(undefined);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to init schema';
        return err(msg);
    }
}

/**
 * Upserts a single embedding record.
 */
export function upsertRow(params: {
    readonly handle: DbHandle;
    readonly row: EmbeddingRow;
}): Result<void, string> {
    try {
        const blob = params.row.embedding !== null
            ? embeddingToBytes(params.row.embedding)
            : null;
        params.handle.db.run(
            `INSERT OR REPLACE INTO embeddings
             (command_id, content_hash, summary, embedding, last_updated)
             VALUES (?, ?, ?, ?, ?)`,
            [
                params.row.commandId,
                params.row.contentHash,
                params.row.summary,
                blob,
                params.row.lastUpdated
            ]
        );
        return ok(undefined);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to upsert row';
        return err(msg);
    }
}

/**
 * Gets a single record by command ID.
 */
export function getRow(params: {
    readonly handle: DbHandle;
    readonly commandId: string;
}): Result<EmbeddingRow | undefined, string> {
    try {
        const row = params.handle.db.get(
            'SELECT * FROM embeddings WHERE command_id = ?',
            [params.commandId]
        );
        if (row === null) {
            return ok(undefined);
        }
        return ok(rowToEmbeddingRow(row as RawRow));
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to get row';
        return err(msg);
    }
}

/**
 * Gets all records from the database.
 */
export function getAllRows(handle: DbHandle): Result<EmbeddingRow[], string> {
    try {
        const rows = handle.db.all('SELECT * FROM embeddings');
        return ok(rows.map(r => rowToEmbeddingRow(r as RawRow)));
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to get all rows';
        return err(msg);
    }
}

type RawRow = Record<string, number | bigint | string | Uint8Array | null>;

/**
 * Converts a raw SQLite row to a typed EmbeddingRow.
 */
function rowToEmbeddingRow(row: RawRow): EmbeddingRow {
    const blob = row['embedding'];
    const embedding = blob instanceof Uint8Array
        ? bytesToEmbedding(blob)
        : null;
    return {
        commandId: row['command_id'] as string,
        contentHash: row['content_hash'] as string,
        summary: row['summary'] as string,
        embedding,
        lastUpdated: row['last_updated'] as string,
    };
}

/**
 * Imports records from the legacy JSON summary store into SQLite.
 * Embedding column is NULL for imported records.
 */
export function importFromJsonStore(params: {
    readonly handle: DbHandle;
    readonly jsonData: SummaryStoreData;
}): Result<number, string> {
    try {
        const records = Object.values(params.jsonData.records);
        for (const record of records) {
            params.handle.db.run(
                `INSERT OR IGNORE INTO embeddings
                 (command_id, content_hash, summary, embedding, last_updated)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    record.commandId,
                    record.contentHash,
                    record.summary,
                    null,
                    record.lastUpdated
                ]
            );
        }
        return ok(records.length);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to import from JSON';
        return err(msg);
    }
}

// ---------------------------------------------------------------------------
// Tag storage
// ---------------------------------------------------------------------------

export interface TagRow {
    readonly tagName: string;
    readonly pattern: string;
    readonly sortOrder: number;
}

/**
 * Gets all tag rows ordered by tag name then sort order.
 */
export function getAllTagRows(handle: DbHandle): Result<TagRow[], string> {
    try {
        const rows = handle.db.all(
            'SELECT tag_name, pattern, sort_order FROM tags ORDER BY tag_name, sort_order'
        );
        return ok(rows.map(r => ({
            tagName: (r as RawRow)['tag_name'] as string,
            pattern: (r as RawRow)['pattern'] as string,
            sortOrder: Number((r as RawRow)['sort_order']),
        })));
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to get tag rows';
        return err(msg);
    }
}

/**
 * Gets ordered patterns for a single tag.
 */
export function getTagPatterns(params: {
    readonly handle: DbHandle;
    readonly tagName: string;
}): Result<string[], string> {
    try {
        const rows = params.handle.db.all(
            'SELECT pattern FROM tags WHERE tag_name = ? ORDER BY sort_order',
            [params.tagName]
        );
        return ok(rows.map(r => (r as RawRow)['pattern'] as string));
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to get tag patterns';
        return err(msg);
    }
}

/**
 * Gets all distinct tag names.
 */
export function getTagNames(handle: DbHandle): Result<string[], string> {
    try {
        const rows = handle.db.all(
            'SELECT DISTINCT tag_name FROM tags ORDER BY tag_name'
        );
        return ok(rows.map(r => (r as RawRow)['tag_name'] as string));
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to get tag names';
        return err(msg);
    }
}

/**
 * Adds a pattern to a tag. Appends at the end (max sort_order + 1).
 */
export function addPatternToTag(params: {
    readonly handle: DbHandle;
    readonly tagName: string;
    readonly pattern: string;
}): Result<void, string> {
    try {
        const maxRow = params.handle.db.get(
            'SELECT MAX(sort_order) as max_order FROM tags WHERE tag_name = ?',
            [params.tagName]
        );
        const nextOrder = maxRow !== null
            ? Number((maxRow as RawRow)['max_order'] ?? -1) + 1
            : 0;
        params.handle.db.run(
            'INSERT OR IGNORE INTO tags (tag_name, pattern, sort_order) VALUES (?, ?, ?)',
            [params.tagName, params.pattern, nextOrder]
        );
        return ok(undefined);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to add pattern to tag';
        return err(msg);
    }
}

/**
 * Removes a pattern from a tag.
 */
export function removePatternFromTag(params: {
    readonly handle: DbHandle;
    readonly tagName: string;
    readonly pattern: string;
}): Result<void, string> {
    try {
        params.handle.db.run(
            'DELETE FROM tags WHERE tag_name = ? AND pattern = ?',
            [params.tagName, params.pattern]
        );
        return ok(undefined);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to remove pattern from tag';
        return err(msg);
    }
}

/**
 * Replaces all patterns for a tag (used for reordering).
 */
export function replaceTagPatterns(params: {
    readonly handle: DbHandle;
    readonly tagName: string;
    readonly patterns: readonly string[];
}): Result<void, string> {
    try {
        params.handle.db.run(
            'DELETE FROM tags WHERE tag_name = ?',
            [params.tagName]
        );
        for (let i = 0; i < params.patterns.length; i++) {
            const pattern = params.patterns[i];
            if (pattern === undefined) { continue; }
            params.handle.db.run(
                'INSERT INTO tags (tag_name, pattern, sort_order) VALUES (?, ?, ?)',
                [params.tagName, pattern, i]
            );
        }
        return ok(undefined);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to replace tag patterns';
        return err(msg);
    }
}

/**
 * Imports tag definitions from a parsed JSON config into SQLite.
 * Replaces all existing tags.
 */
export function importTagsFromConfig(params: {
    readonly handle: DbHandle;
    readonly tags: Record<string, Array<string | Record<string, string | undefined>>>;
}): Result<number, string> {
    try {
        params.handle.db.run('DELETE FROM tags');
        let count = 0;
        for (const [tagName, patterns] of Object.entries(params.tags)) {
            for (let i = 0; i < patterns.length; i++) {
                const raw = patterns[i];
                const pattern = typeof raw === 'string' ? raw : JSON.stringify(raw);
                params.handle.db.run(
                    'INSERT INTO tags (tag_name, pattern, sort_order) VALUES (?, ?, ?)',
                    [tagName, pattern, i]
                );
                count++;
            }
        }
        return ok(count);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to import tags from config';
        return err(msg);
    }
}
