import * as vscode from 'vscode';
import * as path from 'path';
import type { TaskItem, MutableTaskItem } from '../models/TaskItem';
import { generateTaskId, simplifyPath } from '../models/TaskItem';
import { readFile } from '../utils/fileUtils';

const MAX_DESCRIPTION_LENGTH = 150;

/**
 * Discovers Markdown files (.md) in the workspace.
 */
export async function discoverMarkdownFiles(
    workspaceRoot: string,
    excludePatterns: string[]
): Promise<TaskItem[]> {
    const exclude = `{${excludePatterns.join(',')}}`;
    const files = await vscode.workspace.findFiles('**/*.md', exclude);
    const tasks: TaskItem[] = [];

    for (const file of files) {
        const result = await readFile(file);
        if (!result.ok) {
            continue;
        }

        const content = result.value;
        const name = path.basename(file.fsPath);
        const description = extractDescription(content);

        const task: MutableTaskItem = {
            id: generateTaskId('markdown', file.fsPath, name),
            label: name,
            type: 'markdown',
            category: simplifyPath(file.fsPath, workspaceRoot),
            command: file.fsPath,
            cwd: path.dirname(file.fsPath),
            filePath: file.fsPath,
            tags: []
        };

        if (description !== undefined && description !== '') {
            task.description = description;
        }

        tasks.push(task);
    }

    return tasks;
}

/**
 * Extracts a description from the markdown content.
 * Uses the first heading or first paragraph.
 */
function extractDescription(content: string): string | undefined {
    const lines = content.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed === '') {
            continue;
        }

        if (trimmed.startsWith('#')) {
            const heading = trimmed.replace(/^#+\s*/, '').trim();
            if (heading !== '') {
                return truncate(heading);
            }
            continue;
        }

        if (!trimmed.startsWith('```') && !trimmed.startsWith('---')) {
            return truncate(trimmed);
        }
    }

    return undefined;
}

function truncate(text: string): string {
    if (text.length <= MAX_DESCRIPTION_LENGTH) {
        return text;
    }
    return `${text.substring(0, MAX_DESCRIPTION_LENGTH)}...`;
}
