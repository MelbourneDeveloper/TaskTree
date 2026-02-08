import * as vscode from 'vscode';
import type { Result } from '../models/TaskItem';
import { ok, err } from '../models/TaskItem';

/**
 * Reads a file and returns its content as a string.
 * Returns Err on failure instead of throwing.
 */
export async function readFile(uri: vscode.Uri): Promise<Result<string, string>> {
    try {
        const bytes = await vscode.workspace.fs.readFile(uri);
        return ok(new TextDecoder().decode(bytes));
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Unknown error reading file';
        return err(message);
    }
}

/**
 * Parses JSON safely, returning a Result instead of throwing.
 */
export function parseJson<T>(content: string): Result<T, string> {
    try {
        return ok(JSON.parse(content) as T);
    } catch (e) {
        const message = e instanceof Error ? e.message : 'Invalid JSON';
        return err(message);
    }
}

/**
 * Removes single-line and multi-line comments from JSONC.
 * Uses a character-by-character state machine (no regex).
 */
export function removeJsonComments(content: string): string {
    const out: string[] = [];
    let i = 0;
    let inString = false;

    while (i < content.length) {
        const ch = content[i];
        const next = content[i + 1];

        if (inString) {
            out.push(ch ?? '');
            if (ch === '\\') {
                out.push(next ?? '');
                i += 2;
                continue;
            }
            if (ch === '"') {
                inString = false;
            }
            i++;
            continue;
        }

        if (ch === '"') {
            inString = true;
            out.push(ch);
            i++;
            continue;
        }

        if (ch === '/' && next === '/') {
            i = skipUntilNewline(content, i);
            continue;
        }

        if (ch === '/' && next === '*') {
            i = skipUntilBlockEnd(content, i);
            continue;
        }

        out.push(ch ?? '');
        i++;
    }

    return out.join('');
}

function skipUntilNewline(content: string, start: number): number {
    let i = start + 2;
    while (i < content.length && content[i] !== '\n') {
        i++;
    }
    return i;
}

function skipUntilBlockEnd(content: string, start: number): number {
    let i = start + 2;
    while (i < content.length) {
        if (content[i] === '*' && content[i + 1] === '/') {
            return i + 2;
        }
        i++;
    }
    return i;
}

/**
 * Reads and parses a JSON file, handling JSONC comments.
 * Returns Err on read or parse failure.
 */
export async function readJsonFile<T>(uri: vscode.Uri): Promise<Result<T, string>> {
    const contentResult = await readFile(uri);
    if (!contentResult.ok) {
        return contentResult;
    }

    const cleanJson = removeJsonComments(contentResult.value);
    return parseJson<T>(cleanJson);
}
