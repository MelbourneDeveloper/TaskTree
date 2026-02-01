import * as vscode from 'vscode';
import type { TaskItem, MutableTaskItem } from '../models/TaskItem';
import { generateTaskId } from '../models/TaskItem';

interface LaunchConfig {
    name?: string;
    type?: string;
}

interface LaunchJson {
    configurations?: LaunchConfig[];
}

/**
 * Discovers VS Code launch configurations.
 */
export async function discoverLaunchConfigs(
    workspaceRoot: string
): Promise<TaskItem[]> {
    const files = await vscode.workspace.findFiles('**/.vscode/launch.json', '**/test-fixtures/**');
    const tasks: TaskItem[] = [];

    for (const file of files) {
        try {
            const content = await readFile(file);
            // Remove comments from JSON (VS Code allows JSONC)
            const cleanJson = removeJsonComments(content);
            const launch = JSON.parse(cleanJson) as LaunchJson;

            if (launch.configurations !== undefined && Array.isArray(launch.configurations)) {
                for (const config of launch.configurations) {
                    if (config.name === undefined) {
                        continue;
                    }

                    const task: MutableTaskItem = {
                        id: generateTaskId('launch', file.fsPath, config.name),
                        label: config.name,
                        type: 'launch',
                        category: 'VS Code Launch',
                        command: config.name, // Used to identify the config
                        cwd: workspaceRoot,
                        filePath: file.fsPath,
                        tags: []
                    };
                    if (config.type !== undefined) {
                        task.description = config.type;
                    }
                    tasks.push(task);
                }
            }
        } catch {
            // Skip malformed launch.json
        }
    }

    return tasks;
}

/**
 * Removes single-line and multi-line comments from JSONC.
 */
function removeJsonComments(content: string): string {
    // Remove single-line comments
    let result = content.replace(/\/\/.*$/gm, '');
    // Remove multi-line comments
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');
    return result;
}

async function readFile(uri: vscode.Uri): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(bytes);
}
