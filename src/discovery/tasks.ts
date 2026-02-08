import * as vscode from 'vscode';
import type { TaskItem, ParamDef, MutableTaskItem } from '../models/TaskItem';
import { generateTaskId } from '../models/TaskItem';
import { readJsonFile } from '../utils/fileUtils';

interface TaskInput {
    id: string;
    description?: string;
    default?: string;
    options?: string[];
}

interface VscodeTaskDef {
    label?: string;
    type?: string;
    script?: string;
    detail?: string;
}

interface TasksJsonConfig {
    tasks?: VscodeTaskDef[];
    inputs?: TaskInput[];
}

/**
 * SPEC: command-discovery/vscode-tasks
 *
 * Discovers VS Code tasks from tasks.json.
 */
export async function discoverVsCodeTasks(
    workspaceRoot: string,
    excludePatterns: string[]
): Promise<TaskItem[]> {
    const exclude = `{${excludePatterns.join(',')}}`;
    const files = await vscode.workspace.findFiles('**/.vscode/tasks.json', exclude);
    const tasks: TaskItem[] = [];

    for (const file of files) {
        const result = await readJsonFile<TasksJsonConfig>(file);
        if (!result.ok) {
            continue; // Skip malformed tasks.json
        }

        const tasksConfig = result.value;
        const inputs = parseInputs(tasksConfig.inputs);

        if (tasksConfig.tasks === undefined || !Array.isArray(tasksConfig.tasks)) {
            continue;
        }

        for (const task of tasksConfig.tasks) {
            let label = task.label;
            if (label === undefined && task.type === 'npm' && task.script !== undefined) {
                label = `npm: ${task.script}`;
            }
            if (label === undefined) {
                continue;
            }

            const taskParams = findTaskInputs(task, inputs);

            const taskItem: MutableTaskItem = {
                id: generateTaskId('vscode', file.fsPath, label),
                label,
                type: 'vscode',
                category: 'VS Code Tasks',
                command: label,
                cwd: workspaceRoot,
                filePath: file.fsPath,
                tags: []
            };
            if (taskParams.length > 0) {
                taskItem.params = taskParams;
            }
            if (task.detail !== undefined && typeof task.detail === 'string' && task.detail !== '') {
                taskItem.description = task.detail;
            }
            tasks.push(taskItem);
        }
    }

    return tasks;
}

/**
 * Parses input definitions from tasks.json.
 */
function parseInputs(inputs: TaskInput[] | undefined): Map<string, ParamDef> {
    const map = new Map<string, ParamDef>();
    if (!Array.isArray(inputs)) {
        return map;
    }

    for (const input of inputs) {
        const param: ParamDef = {
            name: input.id,
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.default !== undefined ? { default: input.default } : {}),
            ...(input.options !== undefined ? { options: input.options } : {})
        };
        map.set(input.id, param);
    }

    return map;
}

/**
 * Finds input references in a task definition.
 */
function findTaskInputs(task: VscodeTaskDef, inputs: Map<string, ParamDef>): ParamDef[] {
    const params: ParamDef[] = [];
    const taskStr = JSON.stringify(task);

    const inputRegex = /\$\{input:(\w+)\}/g;
    let match;
    while ((match = inputRegex.exec(taskStr)) !== null) {
        const inputId = match[1];
        if (inputId === undefined) {
            continue;
        }
        const param = inputs.get(inputId);
        if (param !== undefined && !params.some(p => p.name === param.name)) {
            params.push(param);
        }
    }

    return params;
}

