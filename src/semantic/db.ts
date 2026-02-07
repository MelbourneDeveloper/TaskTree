/**
 * Embedding serialization and SQLite storage layer.
 * Uses node-sqlite3-wasm for WASM-based SQLite with BLOB embedding storage.
 */

import type { Result } from '../models/TaskItem';
import { ok, err } from '../models/TaskItem';
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
        const mod = await import('node-sqlite3-wasm');
        const db = new mod.Database(dbPath);
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
 * Creates the embeddings table if it does not exist.
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
