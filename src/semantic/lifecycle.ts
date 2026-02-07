/**
 * Singleton lifecycle management for the semantic search subsystem.
 * Manages database and embedder handles via cached promises
 * to avoid race conditions on module-level state.
 */

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

async function doInitDb(workspaceRoot: string): Promise<Result<DbHandle, string>> {
    const dbPath = path.join(workspaceRoot, COMMANDTREE_DIR, DB_FILENAME);
    const openResult = await openDatabase(dbPath);
    if (!openResult.ok) {
        dbPromise = null;
        return openResult;
    }

    const opened = openResult.value;
    const schemaResult = initSchema(opened);
    if (!schemaResult.ok) {
        closeDatabase(opened);
        dbPromise = null;
        return err(schemaResult.error);
    }

    dbHandle = opened;
    logger.info('SQLite database initialised', { path: dbPath });
    return ok(opened);
}

/**
 * Initialises the SQLite database singleton.
 */
export async function initDb(workspaceRoot: string): Promise<Result<DbHandle, string>> {
    if (dbHandle !== null) {
        return ok(dbHandle);
    }
    dbPromise ??= doInitDb(workspaceRoot);
    return dbPromise;
}

/**
 * Returns the current database handle.
 */
export function getDb(): Result<DbHandle, string> {
    return dbHandle !== null
        ? ok(dbHandle)
        : err('Database not initialised. Call initDb first.');
}

async function doCreateEmbedder(params: {
    readonly workspaceRoot: string;
    readonly onProgress?: (progress: unknown) => void;
}): Promise<Result<EmbedderHandle, string>> {
    const modelDir = path.join(params.workspaceRoot, COMMANDTREE_DIR, MODEL_DIR);
    const embedderParams = params.onProgress !== undefined
        ? { modelCacheDir: modelDir, onProgress: params.onProgress }
        : { modelCacheDir: modelDir };
    const result = await createEmbedder(embedderParams);

    if (result.ok) {
        embedderHandle = result.value;
    } else {
        embedderPromise = null;
    }
    return result;
}

/**
 * Gets or creates the embedder singleton.
 */
export function getOrCreateEmbedder(params: {
    readonly workspaceRoot: string;
    readonly onProgress?: (progress: unknown) => void;
}): Promise<Result<EmbedderHandle, string>> {
    if (embedderHandle !== null) {
        return Promise.resolve(ok(embedderHandle));
    }
    if (embedderPromise === null) {
        embedderPromise = doCreateEmbedder(params);
    }
    return embedderPromise;
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
