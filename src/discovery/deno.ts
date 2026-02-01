import * as vscode from 'vscode';
import * as path from 'path';
import type { TaskItem, MutableTaskItem } from '../models/TaskItem';
import { generateTaskId, simplifyPath } from '../models/TaskItem';
import { readFile, parseJson } from '../utils/fileUtils';

interface DenoJson {
    tasks?: Record<string, string>;
}

/**
 * Discovers Deno tasks from deno.json and deno.jsonc files.
 * Only returns tasks if TypeScript/JavaScript source files exist (excluding node_modules).
 */
export async function discoverDenoTasks(
    workspaceRoot: string,
    excludePatterns: string[]
): Promise<TaskItem[]> {
    const exclude = `{${excludePatterns.join(',')}}`;

    // Check if any TS/JS source files exist (outside node_modules)
    const excludeWithNodeModules = `{${[...excludePatterns, '**/node_modules/**'].join(',')}}`;
    const [tsFiles, jsFiles] = await Promise.all([
        vscode.workspace.findFiles('**/*.ts', excludeWithNodeModules),
        vscode.workspace.findFiles('**/*.js', excludeWithNodeModules)
    ]);
    if (tsFiles.length === 0 && jsFiles.length === 0) {
        return []; // No source files outside node_modules, skip Deno tasks
    }

    const [jsonFiles, jsoncFiles] = await Promise.all([
        vscode.workspace.findFiles('**/deno.json', exclude),
        vscode.workspace.findFiles('**/deno.jsonc', exclude)
    ]);
    const allFiles = [...jsonFiles, ...jsoncFiles];
    const tasks: TaskItem[] = [];

    for (const file of allFiles) {
        const contentResult = await readFile(file);
        if (!contentResult.ok) {
            continue; // Skip unreadable files
        }

        // Remove JSONC comments
        const cleanJson = removeJsonComments(contentResult.value);
        const denoResult = parseJson<DenoJson>(cleanJson);
        if (!denoResult.ok) {
            continue; // Skip malformed deno.json
        }

        const deno = denoResult.value;
        if (deno.tasks === undefined || typeof deno.tasks !== 'object') {
            continue;
        }

        const denoDir = path.dirname(file.fsPath);
        const category = simplifyPath(file.fsPath, workspaceRoot);

        for (const [name, command] of Object.entries(deno.tasks)) {
            if (typeof command !== 'string') {
                continue;
            }

            const task: MutableTaskItem = {
                id: generateTaskId('deno', file.fsPath, name),
                label: name,
                type: 'deno',
                category,
                command: `deno task ${name}`,
                cwd: denoDir,
                filePath: file.fsPath,
                tags: [],
                description: truncate(command, 60)
            };
            tasks.push(task);
        }
    }

    return tasks;
}

/**
 * Removes JSON comments (// and /* *\/) from content.
 */
function removeJsonComments(content: string): string {
    let result = content.replace(/\/\/.*$/gm, '');
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');
    return result;
}

/**
 * Truncates a string to a maximum length.
 */
function truncate(str: string, max: number): string {
    return str.length > max ? `${str.slice(0, max - 3)}...` : str;
}
