import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import type { Result } from '../models/Result.js';
import { ok, err } from '../models/Result.js';

/**
 * Summary record for a single discovered command.
 */
export interface SummaryRecord {
    readonly commandId: string;
    readonly contentHash: string;
    readonly summary: string;
    readonly lastUpdated: string;
}

/**
 * Full summary store data structure.
 */
export interface SummaryStoreData {
    readonly records: Readonly<Record<string, SummaryRecord>>;
}

const STORE_FILENAME = 'commandtree-summaries.json';

/**
 * Computes a content hash for change detection.
 */
export function computeContentHash(content: string): string {
    return crypto
        .createHash('sha256')
        .update(content)
        .digest('hex')
        .substring(0, 16);
}

/**
 * Checks whether a record needs re-summarisation.
 */
export function needsUpdate(
    record: SummaryRecord | undefined,
    currentHash: string
): boolean {
    return record?.contentHash !== currentHash;
}

/**
 * Reads the summary store from disk.
 * NO VS CODE DEPENDENCY - uses Node.js fs for unit testing.
 */
export async function readSummaryStore(
    workspaceRoot: string
): Promise<Result<SummaryStoreData, string>> {
    const storePath = path.join(workspaceRoot, '.vscode', STORE_FILENAME);

    try {
        const content = await fs.readFile(storePath, 'utf-8');
        const parsed = JSON.parse(content) as SummaryStoreData;
        return ok(parsed);
    } catch {
        return ok({ records: {} });
    }
}

/**
 * Writes the summary store to disk.
 * NO VS CODE DEPENDENCY - uses Node.js fs for unit testing.
 */
export async function writeSummaryStore(
    workspaceRoot: string,
    data: SummaryStoreData
): Promise<Result<void, string>> {
    const storePath = path.join(workspaceRoot, '.vscode', STORE_FILENAME);
    const content = JSON.stringify(data, null, 2);

    try {
        const dir = path.dirname(storePath);
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(storePath, content, 'utf-8');
        return ok(undefined);
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Failed to write summary store';
        return err(message);
    }
}

/**
 * Creates a new store with an updated record.
 */
export function upsertRecord(
    store: SummaryStoreData,
    record: SummaryRecord
): SummaryStoreData {
    return {
        records: {
            ...store.records,
            [record.commandId]: record
        }
    };
}

/**
 * Looks up a record by command ID.
 */
export function getRecord(
    store: SummaryStoreData,
    commandId: string
): SummaryRecord | undefined {
    return store.records[commandId];
}

/**
 * Gets all records as an array.
 */
export function getAllRecords(store: SummaryStoreData): SummaryRecord[] {
    return Object.values(store.records);
}

/**
 * Reads the legacy JSON store for migration to SQLite.
 * Returns empty array if the file does not exist.
 * NO VS CODE DEPENDENCY - uses Node.js fs for unit testing.
 */
export async function readLegacyJsonStore(
    workspaceRoot: string
): Promise<SummaryRecord[]> {
    const storePath = path.join(workspaceRoot, '.vscode', STORE_FILENAME);

    try {
        const content = await fs.readFile(storePath, 'utf-8');
        const parsed = JSON.parse(content) as SummaryStoreData;
        return Object.values(parsed.records);
    } catch {
        return [];
    }
}

/**
 * Deletes the legacy JSON store after successful migration.
 * NO VS CODE DEPENDENCY - uses Node.js fs for unit testing.
 */
export async function deleteLegacyJsonStore(
    workspaceRoot: string
): Promise<Result<void, string>> {
    const storePath = path.join(workspaceRoot, '.vscode', STORE_FILENAME);

    try {
        await fs.unlink(storePath);
        return ok(undefined);
    } catch (e) {
        const msg = e instanceof Error ? e.message : 'Failed to delete legacy store';
        return err(msg);
    }
}

/**
 * Checks whether the legacy JSON store file exists.
 * NO VS CODE DEPENDENCY - uses Node.js fs for unit testing.
 */
export async function legacyStoreExists(
    workspaceRoot: string
): Promise<boolean> {
    const storePath = path.join(workspaceRoot, '.vscode', STORE_FILENAME);

    try {
        await fs.access(storePath);
        return true;
    } catch {
        return false;
    }
}
