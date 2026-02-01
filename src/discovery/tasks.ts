import * as vscode from 'vscode';
import type { TaskItem, ParamDef, MutableTaskItem } from '../models/TaskItem';
import { generateTaskId } from '../models/TaskItem';

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
 * Discovers VS Code tasks from tasks.json.
 */
export async function discoverVsCodeTasks(
    workspaceRoot: string
): Promise<TaskItem[]> {
    const files = await vscode.workspace.findFiles('**/.vscode/tasks.json', '**/test-fixtures/**');
    const tasks: TaskItem[] = [];

    for (const file of files) {
        try {
            const content = await readFile(file);
            const cleanJson = removeJsonComments(content);
            const tasksConfig = JSON.parse(cleanJson) as TasksJsonConfig;

            const inputs = parseInputs(tasksConfig.inputs);

            if (tasksConfig.tasks !== undefined && Array.isArray(tasksConfig.tasks)) {
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
        } catch {
            // Skip malformed tasks.json
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

/**
 * Removes single-line and multi-line comments from JSONC.
 */
function removeJsonComments(content: string): string {
    let result = content.replace(/\/\/.*$/gm, '');
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');
    return result;
}

async function readFile(uri: vscode.Uri): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(bytes);
}
