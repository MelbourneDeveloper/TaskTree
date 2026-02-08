/**
 * SPEC: ai-semantic-search
 *
 * Adapter interfaces for decoupling semantic providers from VS Code.
 * Allows unit testing without VS Code instance.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Result } from '../models/Result.js';

/**
 * File system operations abstraction.
 * Implementations: VSCodeFileSystem (production), NodeFileSystem (unit tests)
 */
export interface FileSystemAdapter {
    readFile: (path: string) => Promise<Result<string, string>>;
    writeFile: (path: string, content: string) => Promise<Result<void, string>>;
    exists: (path: string) => Promise<boolean>;
    delete: (path: string) => Promise<Result<void, string>>;
}

/**
 * Configuration reading abstraction.
 * Implementations: VSCodeConfig (production), MockConfig (unit tests)
 */
export interface ConfigAdapter {
    get: <T>(key: string, defaultValue: T) => T;
}

export interface SummaryAdapterResult {
    readonly summary: string;
    readonly securityWarning: string;
}

/**
 * Language Model API abstraction for summarisation.
 * Implementations: CopilotLM (production), MockLM (unit tests)
 */
export interface LanguageModelAdapter {
    summarise: (params: {
        readonly label: string;
        readonly type: string;
        readonly command: string;
        readonly content: string;
    }) => Promise<Result<SummaryAdapterResult, string>>;
}

/**
 * Creates a Node.js fs-based file system adapter (for unit tests).
 */
export function createNodeFileSystem(): FileSystemAdapter {
    const fsPromises = fs.promises;

    return {
        readFile: async (filePath: string): Promise<Result<string, string>> => {
            try {
                const content = await fsPromises.readFile(filePath, 'utf-8');
                const { ok } = await import('../models/Result.js');
                return ok(content);
            } catch (e) {
                const { err } = await import('../models/Result.js');
                const msg = e instanceof Error ? e.message : 'Read failed';
                return err(msg);
            }
        },

        writeFile: async (filePath: string, content: string): Promise<Result<void, string>> => {
            try {
                const dir = path.dirname(filePath);
                await fsPromises.mkdir(dir, { recursive: true });
                await fsPromises.writeFile(filePath, content, 'utf-8');
                const { ok } = await import('../models/Result.js');
                return ok(undefined);
            } catch (e) {
                const { err } = await import('../models/Result.js');
                const msg = e instanceof Error ? e.message : 'Write failed';
                return err(msg);
            }
        },

        exists: async (filePath: string): Promise<boolean> => {
            try {
                await fsPromises.access(filePath);
                return true;
            } catch {
                return false;
            }
        },

        delete: async (filePath: string): Promise<Result<void, string>> => {
            try {
                await fsPromises.unlink(filePath);
                const { ok } = await import('../models/Result.js');
                return ok(undefined);
            } catch (e) {
                const { err } = await import('../models/Result.js');
                const msg = e instanceof Error ? e.message : 'Delete failed';
                return err(msg);
            }
        }
    };
}
