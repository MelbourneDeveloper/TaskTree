/**
 * VS Code adapter implementations for production use.
 * These wrap VS Code APIs to match the adapter interfaces.
 */

import * as vscode from 'vscode';
import type { FileSystemAdapter, ConfigAdapter, LanguageModelAdapter, SummaryAdapterResult } from './adapters';
import type { Result } from '../models/Result';
import { ok, err } from '../models/Result';

/**
 * Creates a VS Code-based file system adapter for production use.
 */
export function createVSCodeFileSystem(): FileSystemAdapter {
    return {
        readFile: async (filePath: string): Promise<Result<string, string>> => {
            try {
                const uri = vscode.Uri.file(filePath);
                const bytes = await vscode.workspace.fs.readFile(uri);
                const content = new TextDecoder().decode(bytes);
                return ok(content);
            } catch (e) {
                const msg = e instanceof Error ? e.message : 'Read failed';
                return err(msg);
            }
        },

        writeFile: async (filePath: string, content: string): Promise<Result<void, string>> => {
            try {
                const uri = vscode.Uri.file(filePath);
                const bytes = new TextEncoder().encode(content);
                await vscode.workspace.fs.writeFile(uri, bytes);
                return ok(undefined);
            } catch (e) {
                const msg = e instanceof Error ? e.message : 'Write failed';
                return err(msg);
            }
        },

        exists: async (filePath: string): Promise<boolean> => {
            try {
                const uri = vscode.Uri.file(filePath);
                await vscode.workspace.fs.stat(uri);
                return true;
            } catch {
                return false;
            }
        },

        delete: async (filePath: string): Promise<Result<void, string>> => {
            try {
                const uri = vscode.Uri.file(filePath);
                await vscode.workspace.fs.delete(uri);
                return ok(undefined);
            } catch (e) {
                const msg = e instanceof Error ? e.message : 'Delete failed';
                return err(msg);
            }
        }
    };
}

/**
 * Creates a VS Code configuration adapter for production use.
 */
export function createVSCodeConfig(): ConfigAdapter {
    return {
        get: <T>(key: string, defaultValue: T): T => {
            return vscode.workspace.getConfiguration().get(key, defaultValue);
        }
    };
}

/**
 * Creates a Copilot language model adapter for production use.
 * Wraps the VS Code Language Model API for summarisation.
 */
export function createCopilotLM(): LanguageModelAdapter {
    return {
        summarise: async (params): Promise<Result<SummaryAdapterResult, string>> => {
            try {
                // Import summariser functions
                const { selectCopilotModel, summariseScript } = await import('./summariser.js');

                // Select model
                const modelResult = await selectCopilotModel();
                if (!modelResult.ok) {
                    return err(modelResult.error);
                }

                // Generate summary with structured tool output
                return await summariseScript({
                    model: modelResult.value,
                    label: params.label,
                    type: params.type,
                    command: params.command,
                    content: params.content
                });
            } catch (e) {
                const msg = e instanceof Error ? e.message : 'Summarisation failed';
                return err(msg);
            }
        }
    };
}
