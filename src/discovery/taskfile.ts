import * as vscode from 'vscode';
import * as path from 'path';
import type { TaskItem, MutableTaskItem } from '../models/TaskItem';
import { generateTaskId, simplifyPath } from '../models/TaskItem';
import { readFile } from '../utils/fileUtils';

/**
 * Discovers tasks from Taskfile.yml (go-task).
 */
export async function discoverTaskfileTasks(
    workspaceRoot: string,
    excludePatterns: string[]
): Promise<TaskItem[]> {
    const exclude = `{${excludePatterns.join(',')}}`;
    // Taskfile supports: Taskfile.yml, Taskfile.yaml, taskfile.yml, taskfile.yaml
    const [yml1, yaml1, yml2, yaml2] = await Promise.all([
        vscode.workspace.findFiles('**/Taskfile.yml', exclude),
        vscode.workspace.findFiles('**/Taskfile.yaml', exclude),
        vscode.workspace.findFiles('**/taskfile.yml', exclude),
        vscode.workspace.findFiles('**/taskfile.yaml', exclude)
    ]);
    const allFiles = [...yml1, ...yaml1, ...yml2, ...yaml2];
    const tasks: TaskItem[] = [];

    for (const file of allFiles) {
        const result = await readFile(file);
        if (!result.ok) {
            continue; // Skip files we can't read
        }

        const content = result.value;
        const taskfileDir = path.dirname(file.fsPath);
        const category = simplifyPath(file.fsPath, workspaceRoot);
        const parsedTasks = parseTaskfileTasks(content);

        for (const parsedTask of parsedTasks) {
            const task: MutableTaskItem = {
                id: generateTaskId('taskfile', file.fsPath, parsedTask.name),
                label: parsedTask.name,
                type: 'taskfile',
                category,
                command: `task ${parsedTask.name}`,
                cwd: taskfileDir,
                filePath: file.fsPath,
                tags: []
            };
            if (parsedTask.description !== undefined) {
                task.description = parsedTask.description;
            }
            tasks.push(task);
        }
    }

    return tasks;
}

interface TaskfileTask {
    name: string;
    description?: string;
}

/**
 * Parses Taskfile.yml to extract task names and descriptions.
 * Uses simple YAML parsing without a full parser.
 */
function parseTaskfileTasks(content: string): TaskfileTask[] {
    const tasks: TaskfileTask[] = [];
    const lines = content.split('\n');

    let inTasks = false;
    let currentIndent = 0;
    let currentTask: string | undefined;
    let taskIndent = 0;

    for (const line of lines) {
        // Skip empty lines and comments
        if (line.trim() === '' || line.trim().startsWith('#')) {
            continue;
        }

        const indent = line.search(/\S/);
        const trimmed = line.trim();

        // Check if we're entering the tasks: section
        if (trimmed === 'tasks:') {
            inTasks = true;
            currentIndent = indent;
            continue;
        }

        // Check if we've left the tasks section (another top-level key)
        if (inTasks && indent <= currentIndent && !trimmed.startsWith('-')) {
            if (trimmed.endsWith(':') && !trimmed.includes(' ')) {
                inTasks = false;
                continue;
            }
        }

        if (!inTasks) {
            continue;
        }

        // Check for task definition (key ending with :)
        const taskMatch = /^([a-zA-Z_][a-zA-Z0-9_:-]*):(.*)$/.exec(trimmed);
        if (taskMatch !== null && indent > currentIndent) {
            const taskName = taskMatch[1];
            if (taskName !== undefined && taskName !== '') {
                // Save previous task if exists
                if (currentTask !== undefined) {
                    const existing = tasks.find(t => t.name === currentTask);
                    if (existing === undefined) {
                        tasks.push({ name: currentTask });
                    }
                }
                currentTask = taskName;
                taskIndent = indent;
            }
        }

        // Check for desc or description field
        if (currentTask !== undefined && indent > taskIndent) {
            const descMatch = /^(?:desc|description):\s*["']?(.+?)["']?\s*$/.exec(trimmed);
            if (descMatch !== null) {
                const description = descMatch[1];
                if (description !== undefined && description !== '') {
                    const existing = tasks.find(t => t.name === currentTask);
                    if (existing !== undefined) {
                        existing.description = description;
                    } else {
                        tasks.push({ name: currentTask, description });
                        currentTask = undefined;
                    }
                }
            }
        }
    }

    // Don't forget the last task
    if (currentTask !== undefined && !tasks.some(t => t.name === currentTask)) {
        tasks.push({ name: currentTask });
    }

    return tasks;
}
