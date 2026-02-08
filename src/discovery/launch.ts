import * as vscode from 'vscode';
import type { TaskItem, MutableTaskItem } from '../models/TaskItem';
import { generateTaskId } from '../models/TaskItem';
import { readJsonFile } from '../utils/fileUtils';

interface LaunchConfig {
    name?: string;
    type?: string;
}

interface LaunchJson {
    configurations?: LaunchConfig[];
}

/**
 * SPEC: command-discovery/launch-configurations
 *
 * Discovers VS Code launch configurations.
 */
export async function discoverLaunchConfigs(
    workspaceRoot: string,
    excludePatterns: string[]
): Promise<TaskItem[]> {
    const exclude = `{${excludePatterns.join(',')}}`;
    const files = await vscode.workspace.findFiles('**/.vscode/launch.json', exclude);
    const tasks: TaskItem[] = [];

    for (const file of files) {
        const result = await readJsonFile<LaunchJson>(file);
        if (!result.ok) {
            continue; // Skip malformed launch.json
        }

        const launch = result.value;
        if (launch.configurations === undefined || !Array.isArray(launch.configurations)) {
            continue;
        }

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

    return tasks;
}
