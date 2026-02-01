import * as vscode from 'vscode';
import * as path from 'path';
import type { TaskItem, MutableTaskItem } from '../models/TaskItem';
import { generateTaskId, simplifyPath } from '../models/TaskItem';
import { readFile, parseJson } from '../utils/fileUtils';

interface ComposerJson {
    scripts?: Record<string, string | string[]>;
    'scripts-descriptions'?: Record<string, string>;
}

/**
 * Discovers Composer scripts from composer.json files.
 */
export async function discoverComposerScripts(
    workspaceRoot: string,
    excludePatterns: string[]
): Promise<TaskItem[]> {
    const exclude = `{${excludePatterns.join(',')}}`;
    const files = await vscode.workspace.findFiles('**/composer.json', exclude);
    const tasks: TaskItem[] = [];

    for (const file of files) {
        const contentResult = await readFile(file);
        if (!contentResult.ok) {
            continue; // Skip unreadable composer.json
        }

        const composerResult = parseJson<ComposerJson>(contentResult.value);
        if (!composerResult.ok) {
            continue; // Skip malformed composer.json
        }

        const composer = composerResult.value;
        if (composer.scripts === undefined || typeof composer.scripts !== 'object') {
            continue;
        }

        const composerDir = path.dirname(file.fsPath);
        const category = simplifyPath(file.fsPath, workspaceRoot);
        const descriptions = composer['scripts-descriptions'] ?? {};

        for (const [name, command] of Object.entries(composer.scripts)) {
            // Skip lifecycle hooks (pre-*, post-*)
            if (name.startsWith('pre-') || name.startsWith('post-')) {
                continue;
            }

            const description = descriptions[name] ?? getCommandPreview(command);

            const task: MutableTaskItem = {
                id: generateTaskId('composer', file.fsPath, name),
                label: name,
                type: 'composer',
                category,
                command: `composer run-script ${name}`,
                cwd: composerDir,
                filePath: file.fsPath,
                tags: []
            };
            if (description !== undefined && description !== '') {
                task.description = description;
            }
            tasks.push(task);
        }
    }

    return tasks;
}

/**
 * Gets a preview of the command for description.
 */
function getCommandPreview(command: string | string[]): string {
    if (Array.isArray(command)) {
        const preview = command.join(' && ');
        return truncate(preview, 60);
    }
    return truncate(command, 60);
}

/**
 * Truncates a string to a maximum length.
 */
function truncate(str: string, max: number): string {
    return str.length > max ? `${str.slice(0, max - 3)}...` : str;
}
