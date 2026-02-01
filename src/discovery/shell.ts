import * as vscode from 'vscode';
import * as path from 'path';
import type { TaskItem, ParamDef, MutableTaskItem } from '../models/TaskItem';
import { generateTaskId, simplifyPath } from '../models/TaskItem';

/**
 * Discovers shell scripts (.sh files) in the workspace.
 */
export async function discoverShellScripts(
    workspaceRoot: string,
    excludePatterns: string[]
): Promise<TaskItem[]> {
    const exclude = `{${excludePatterns.join(',')}}`;
    const files = await vscode.workspace.findFiles('**/*.sh', exclude);
    const tasks: TaskItem[] = [];

    for (const file of files) {
        try {
            const content = await readFile(file);
            const name = path.basename(file.fsPath);
            const params = parseShellParams(content);
            const description = parseShellDescription(content);

            const task: MutableTaskItem = {
                id: generateTaskId('shell', file.fsPath, name),
                label: name,
                type: 'shell',
                category: simplifyPath(file.fsPath, workspaceRoot),
                command: file.fsPath,
                cwd: path.dirname(file.fsPath),
                filePath: file.fsPath,
                tags: []
            };
            if (params.length > 0) {
                task.params = params;
            }
            if (description !== undefined && description !== '') {
                task.description = description;
            }
            tasks.push(task);
        } catch {
            // Skip files we can't read
        }
    }

    return tasks;
}

/**
 * Parses shell script comments for parameter hints.
 * Supports: # @param name Description
 */
function parseShellParams(content: string): ParamDef[] {
    const params: ParamDef[] = [];
    const paramRegex = /^#\s*@param\s+(\w+)\s+(.*)$/gm;

    let match;
    while ((match = paramRegex.exec(content)) !== null) {
        const paramName = match[1];
        const descText = match[2];
        if (paramName === undefined || descText === undefined) {
            continue;
        }

        const defaultRegex = /\(default:\s*([^)]+)\)/i;
        const defaultMatch = defaultRegex.exec(descText);
        const defaultVal = defaultMatch?.[1]?.trim();
        const param: ParamDef = {
            name: paramName,
            description: descText.replace(/\(default:[^)]+\)/i, '').trim(),
            ...(defaultVal !== undefined && defaultVal !== '' ? { default: defaultVal } : {})
        };
        params.push(param);
    }

    return params;
}

/**
 * Parses the first comment line as description.
 */
function parseShellDescription(content: string): string | undefined {
    const lines = content.split('\n');
    for (const line of lines) {
        if (line.startsWith('#!')) {
            continue;
        }
        if (line.trim() === '') {
            continue;
        }
        if (line.startsWith('#')) {
            const desc = line.replace(/^#\s*/, '').trim();
            if (!desc.startsWith('@')) {
                return desc === '' ? undefined : desc;
            }
        }
        break;
    }
    return undefined;
}

async function readFile(uri: vscode.Uri): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(bytes);
}
