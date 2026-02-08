/**
 * SPEC: database-schema
 * Singleton lifecycle management for the semantic search subsystem.
 * Manages database and embedder handles via cached promises
 * to avoid race conditions on module-level state.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../models/TaskItem';
import { ok, err } from '../models/TaskItem';
import { logger } from '../utils/logger';
import type { DbHandle } from './db';
import { openDatabase, initSchema, closeDatabase } from './db';
import type { EmbedderHandle } from './embedder';
import { createEmbedder, disposeEmbedder } from './embedder';

const COMMANDTREE_DIR = '.commandtree';
const DB_FILENAME = 'commandtree.sqlite3';
const MODEL_DIR = 'models';

let dbPromise: Promise<Result<DbHandle, string>> | null = null;
let dbHandle: DbHandle | null = null;
let embedderPromise: Promise<Result<EmbedderHandle, string>> | null = null;
let embedderHandle: EmbedderHandle | null = null;

function ensureDirectory(dir: string): Result<void, string> {
    try {
        fs.mkdirSync(dir, { recursive: true });
        return ok(undefined);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to create directory';
        return err(msg);
    }
}

async function doInitDb(workspaceRoot: string): Promise<Result<DbHandle, string>> {
    const dbDir = path.join(workspaceRoot, COMMANDTREE_DIR);
    const dirResult = ensureDirectory(dbDir);
    if (!dirResult.ok) { return err(dirResult.error); }
    const dbPath = path.join(dbDir, DB_FILENAME);
    const openResult = await openDatabase(dbPath);
    if (!openResult.ok) { return openResult; }

    const opened = openResult.value;
    const schemaResult = initSchema(opened);
    if (!schemaResult.ok) {
        closeDatabase(opened);
        return err(schemaResult.error);
    }

    logger.info('SQLite database initialised', { path: dbPath });
    return ok(opened);
}

function applyDbResult(result: Result<DbHandle, string>): Result<DbHandle, string> {
    if (result.ok) { dbHandle = result.value; } else { dbPromise = null; }
    return result;
}

/**
 * Initialises the SQLite database singleton.
 * Re-creates if the DB file was deleted externally.
 */
export async function initDb(workspaceRoot: string): Promise<Result<DbHandle, string>> {
    if (dbHandle !== null && fs.existsSync(dbHandle.path)) {
        return ok(dbHandle);
    }
    resetStaleHandle();
    dbPromise ??= doInitDb(workspaceRoot).then(applyDbResult);
    return await dbPromise;
}

/**
 * Returns the current database handle.
 * Invalidates a stale handle if the DB file was deleted.
 */
export function getDb(): Result<DbHandle, string> {
    if (dbHandle !== null && fs.existsSync(dbHandle.path)) {
        return ok(dbHandle);
    }
    resetStaleHandle();
    return err('Database not initialised. Call initDb first.');
}

function resetStaleHandle(): void {
    if (dbHandle !== null) {
        closeDatabase(dbHandle);
        dbHandle = null;
        dbPromise = null;
    }
}

async function doCreateEmbedder(params: {
    readonly workspaceRoot: string;
    readonly onProgress?: (progress: unknown) => void;
}): Promise<Result<EmbedderHandle, string>> {
    const modelDir = path.join(params.workspaceRoot, COMMANDTREE_DIR, MODEL_DIR);
    const dirResult = ensureDirectory(modelDir);
    if (!dirResult.ok) { return err(dirResult.error); }
    const embedderParams = params.onProgress !== undefined
        ? { modelCacheDir: modelDir, onProgress: params.onProgress }
        : { modelCacheDir: modelDir };
    return await createEmbedder(embedderParams);
}

function applyEmbedderResult(result: Result<EmbedderHandle, string>): Result<EmbedderHandle, string> {
    if (result.ok) { embedderHandle = result.value; } else { embedderPromise = null; }
    return result;
}

/**
 * Gets or creates the embedder singleton.
 */
export async function getOrCreateEmbedder(params: {
    readonly workspaceRoot: string;
    readonly onProgress?: (progress: unknown) => void;
}): Promise<Result<EmbedderHandle, string>> {
    if (embedderHandle !== null) {
        return ok(embedderHandle);
    }
    embedderPromise ??= doCreateEmbedder(params).then(applyEmbedderResult);
    return await embedderPromise;
}

/**
 * Disposes all semantic search resources.
 */
export async function disposeSemantic(): Promise<void> {
    const currentEmbedder = embedderHandle;
    embedderHandle = null;
    embedderPromise = null;
    if (currentEmbedder !== null) {
        await disposeEmbedder(currentEmbedder);
    }

    const currentDb = dbHandle;
    dbHandle = null;
    dbPromise = null;
    if (currentDb !== null) {
        closeDatabase(currentDb);
    }
    logger.info('Semantic search resources disposed');
}
