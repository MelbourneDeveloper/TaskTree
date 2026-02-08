/**
 * SPEC: database-schema, database-schema/tags-table, database-schema/command-tags-junction, database-schema/tag-operations
 * Embedding serialization and SQLite storage layer.
 * Uses node-sqlite3-wasm for WASM-based SQLite with BLOB embedding storage.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../models/Result';
import { ok, err } from '../models/Result';
import type { SummaryStoreData } from './store';

import type { Database as SqliteDatabase } from 'node-sqlite3-wasm';

const COMMAND_TABLE = 'commands';
const TAG_TABLE = 'tags';
const COMMAND_TAGS_TABLE = 'command_tags';

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
 * CRITICAL: Enables foreign key constraints on EVERY connection.
 */
export async function openDatabase(dbPath: string): Promise<Result<DbHandle, string>> {
    try {
        fs.mkdirSync(path.dirname(dbPath), { recursive: true });
        const mod = await import('node-sqlite3-wasm');
        const db = new mod.default.Database(dbPath);
        db.exec('PRAGMA foreign_keys = ON');
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
 * SPEC: database-schema, database-schema/tags-table, database-schema/command-tags-junction
 * Creates the commands, tags, and command_tags tables if they do not exist.
 * STRICT referential integrity enforced with CASCADE DELETE.
 */
export function initSchema(handle: DbHandle): Result<void, string> {
    try {
        handle.db.exec(`
            CREATE TABLE IF NOT EXISTS ${COMMAND_TABLE} (
                command_id TEXT PRIMARY KEY,
                content_hash TEXT NOT NULL,
                summary TEXT NOT NULL,
                embedding BLOB,
                last_updated TEXT NOT NULL
            )
        `);

        handle.db.exec(`
            CREATE TABLE IF NOT EXISTS ${TAG_TABLE} (
                tag_id TEXT PRIMARY KEY,
                tag_name TEXT NOT NULL UNIQUE,
                description TEXT
            )
        `);

        handle.db.exec(`
            CREATE TABLE IF NOT EXISTS ${COMMAND_TAGS_TABLE} (
                command_id TEXT NOT NULL,
                tag_id TEXT NOT NULL,
                display_order INTEGER NOT NULL DEFAULT 0,
                PRIMARY KEY (command_id, tag_id),
                FOREIGN KEY (command_id) REFERENCES ${COMMAND_TABLE}(command_id) ON DELETE CASCADE,
                FOREIGN KEY (tag_id) REFERENCES ${TAG_TABLE}(tag_id) ON DELETE CASCADE
            )
        `);
        return ok(undefined);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to init schema';
        return err(msg);
    }
}

/**
 * SPEC: database-schema/commands-table
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
            `INSERT OR REPLACE INTO ${COMMAND_TABLE}
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
 * SPEC: database-schema/commands-table
 * Gets a single record by command ID.
 */
export function getRow(params: {
    readonly handle: DbHandle;
    readonly commandId: string;
}): Result<EmbeddingRow | undefined, string> {
    try {
        const row = params.handle.db.get(
            `SELECT * FROM ${COMMAND_TABLE} WHERE command_id = ?`,
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
 * SPEC: database-schema/commands-table
 * Gets all records from the database.
 */
export function getAllRows(handle: DbHandle): Result<EmbeddingRow[], string> {
    try {
        const rows = handle.db.all(`SELECT * FROM ${COMMAND_TABLE}`);
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
                `INSERT OR IGNORE INTO ${COMMAND_TABLE}
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

/**
 * Cleans up orphaned records that violate referential integrity.
 * Deletes command_tags rows where command_id doesn't exist in commands table.
 * Should be run after enabling FK constraints on existing databases.
 */
export function cleanupOrphanedRecords(handle: DbHandle): Result<number, string> {
    try {
        const result = handle.db.run(
            `DELETE FROM ${COMMAND_TAGS_TABLE}
             WHERE command_id NOT IN (SELECT command_id FROM ${COMMAND_TABLE})`
        );
        const changes = result.changes ?? 0;
        return ok(changes);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to cleanup orphaned records';
        return err(msg);
    }
}

// ---------------------------------------------------------------------------
// SPEC: tagging - Junction table operations
// ---------------------------------------------------------------------------

/**
 * Ensures a command record exists before adding tags to it.
 * Inserts placeholder if needed to maintain referential integrity.
 */
export function ensureCommandExists(params: {
    readonly handle: DbHandle;
    readonly commandId: string;
}): Result<void, string> {
    try {
        const existing = params.handle.db.get(
            `SELECT command_id FROM ${COMMAND_TABLE} WHERE command_id = ?`,
            [params.commandId]
        );
        if (existing === null) {
            params.handle.db.run(
                `INSERT INTO ${COMMAND_TABLE}
                 (command_id, content_hash, summary, embedding, last_updated)
                 VALUES (?, '', '', NULL, ?)`,
                [params.commandId, new Date().toISOString()]
            );
        }
        return ok(undefined);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to ensure command exists';
        return err(msg);
    }
}

/**
 * SPEC: database-schema/tag-operations, tagging, tagging/management
 * Adds a tag to a command with optional display order.
 * Ensures BOTH tag and command exist before creating junction record.
 * STRICT referential integrity enforced.
 */
export function addTagToCommand(params: {
    readonly handle: DbHandle;
    readonly commandId: string;
    readonly tagName: string;
    readonly displayOrder?: number;
}): Result<void, string> {
    try {
        const cmdResult = ensureCommandExists({
            handle: params.handle,
            commandId: params.commandId
        });
        if (!cmdResult.ok) {
            return cmdResult;
        }
        const existing = params.handle.db.get(
            `SELECT tag_id FROM ${TAG_TABLE} WHERE tag_name = ?`,
            [params.tagName]
        );
        const tagId = existing !== null
            ? (existing as RawRow)['tag_id'] as string
            : crypto.randomUUID();
        if (existing === null) {
            params.handle.db.run(
                `INSERT INTO ${TAG_TABLE} (tag_id, tag_name, description) VALUES (?, ?, NULL)`,
                [tagId, params.tagName]
            );
        }
        const order = params.displayOrder ?? 0;
        params.handle.db.run(
            `INSERT OR IGNORE INTO ${COMMAND_TAGS_TABLE} (command_id, tag_id, display_order) VALUES (?, ?, ?)`,
            [params.commandId, tagId, order]
        );
        return ok(undefined);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to add tag to command';
        return err(msg);
    }
}

/**
 * SPEC: database-schema/tag-operations, tagging, tagging/management
 * Removes a tag from a command.
 */
export function removeTagFromCommand(params: {
    readonly handle: DbHandle;
    readonly commandId: string;
    readonly tagName: string;
}): Result<void, string> {
    try {
        params.handle.db.run(
            `DELETE FROM ${COMMAND_TAGS_TABLE}
             WHERE command_id = ?
             AND tag_id = (SELECT tag_id FROM ${TAG_TABLE} WHERE tag_name = ?)`,
            [params.commandId, params.tagName]
        );
        return ok(undefined);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to remove tag from command';
        return err(msg);
    }
}

/**
 * SPEC: database-schema/tag-operations, tagging/filter
 * Gets all command IDs for a given tag, ordered by display_order.
 */
export function getCommandIdsByTag(params: {
    readonly handle: DbHandle;
    readonly tagName: string;
}): Result<string[], string> {
    try {
        const rows = params.handle.db.all(
            `SELECT ct.command_id
             FROM ${COMMAND_TAGS_TABLE} ct
             JOIN ${TAG_TABLE} t ON ct.tag_id = t.tag_id
             WHERE t.tag_name = ?
             ORDER BY ct.display_order`,
            [params.tagName]
        );
        return ok(rows.map(r => (r as RawRow)['command_id'] as string));
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to get command IDs by tag';
        return err(msg);
    }
}

/**
 * SPEC: database-schema/tag-operations, tagging
 * Gets all tags for a given command.
 */
export function getTagsForCommand(params: {
    readonly handle: DbHandle;
    readonly commandId: string;
}): Result<string[], string> {
    try {
        const rows = params.handle.db.all(
            `SELECT t.tag_name
             FROM ${TAG_TABLE} t
             JOIN ${COMMAND_TAGS_TABLE} ct ON t.tag_id = ct.tag_id
             WHERE ct.command_id = ?`,
            [params.commandId]
        );
        return ok(rows.map(r => (r as RawRow)['tag_name'] as string));
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to get tags for command';
        return err(msg);
    }
}

/**
 * SPEC: database-schema/tag-operations, tagging/filter
 * Gets all distinct tag names from tags table.
 */
export function getAllTagNames(handle: DbHandle): Result<string[], string> {
    try {
        const rows = handle.db.all(
            `SELECT tag_name FROM ${TAG_TABLE} ORDER BY tag_name`
        );
        return ok(rows.map(r => (r as RawRow)['tag_name'] as string));
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to get all tag names';
        return err(msg);
    }
}

/**
 * SPEC: database-schema/tag-operations, quick-launch
 * Updates the display order for a tag assignment in the junction table.
 */
export function updateTagDisplayOrder(params: {
    readonly handle: DbHandle;
    readonly commandId: string;
    readonly tagId: string;
    readonly newOrder: number;
}): Result<void, string> {
    try {
        params.handle.db.run(
            `UPDATE ${COMMAND_TAGS_TABLE} SET display_order = ? WHERE command_id = ? AND tag_id = ?`,
            [params.newOrder, params.commandId, params.tagId]
        );
        return ok(undefined);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to update tag display order';
        return err(msg);
    }
}

/**
 * SPEC: quick-launch
 * Reorders command IDs for a tag by updating display_order for all junction records.
 * Used for drag-and-drop reordering in Quick Launch.
 */
export function reorderTagCommands(params: {
    readonly handle: DbHandle;
    readonly tagName: string;
    readonly orderedCommandIds: readonly string[];
}): Result<void, string> {
    try {
        const tagRow = params.handle.db.get(
            `SELECT tag_id FROM ${TAG_TABLE} WHERE tag_name = ?`,
            [params.tagName]
        );
        if (tagRow === null) {
            return err(`Tag "${params.tagName}" not found`);
        }
        const tagId = (tagRow as RawRow)['tag_id'] as string;
        params.orderedCommandIds.forEach((commandId, index) => {
            params.handle.db.run(
                `UPDATE ${COMMAND_TAGS_TABLE} SET display_order = ? WHERE command_id = ? AND tag_id = ?`,
                [index, commandId, tagId]
            );
        });
        return ok(undefined);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to reorder tag commands';
        return err(msg);
    }
}

