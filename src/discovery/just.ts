import * as vscode from 'vscode';
import * as path from 'path';
import type { TaskItem, ParamDef, MutableTaskItem } from '../models/TaskItem';
import { generateTaskId, simplifyPath } from '../models/TaskItem';
import { readFile } from '../utils/fileUtils';

/**
 * Discovers Just recipes from justfile.
 */
export async function discoverJustRecipes(
    workspaceRoot: string,
    excludePatterns: string[]
): Promise<TaskItem[]> {
    const exclude = `{${excludePatterns.join(',')}}`;
    // Just supports: justfile, Justfile, .justfile
    const [justfiles, Justfiles, dotJustfiles] = await Promise.all([
        vscode.workspace.findFiles('**/justfile', exclude),
        vscode.workspace.findFiles('**/Justfile', exclude),
        vscode.workspace.findFiles('**/.justfile', exclude)
    ]);
    const allFiles = [...justfiles, ...Justfiles, ...dotJustfiles];
    const tasks: TaskItem[] = [];

    for (const file of allFiles) {
        const result = await readFile(file);
        if (!result.ok) {
            continue; // Skip files we can't read
        }

        const content = result.value;
        const justDir = path.dirname(file.fsPath);
        const category = simplifyPath(file.fsPath, workspaceRoot);
        const recipes = parseJustRecipes(content);

        for (const recipe of recipes) {
            const task: MutableTaskItem = {
                id: generateTaskId('just', file.fsPath, recipe.name),
                label: recipe.name,
                type: 'just',
                category,
                command: `just ${recipe.name}`,
                cwd: justDir,
                filePath: file.fsPath,
                tags: []
            };
            if (recipe.params.length > 0) {
                task.params = recipe.params;
            }
            if (recipe.description !== undefined) {
                task.description = recipe.description;
            }
            tasks.push(task);
        }
    }

    return tasks;
}

interface JustRecipe {
    name: string;
    params: ParamDef[];
    description?: string;
}

/**
 * Parses justfile to extract recipes with parameters and descriptions.
 */
function parseJustRecipes(content: string): JustRecipe[] {
    const recipes: JustRecipe[] = [];
    const lines = content.split('\n');
    let pendingComment: string | undefined;

    for (const line of lines) {
        const trimmed = line.trim();

        // Track comments for recipe descriptions
        if (trimmed.startsWith('#')) {
            pendingComment = trimmed.slice(1).trim();
            continue;
        }

        // Match recipe definition: name param1 param2:
        // Or with defaults: name param1="default":
        const recipeMatch = /^([a-zA-Z_][a-zA-Z0-9_-]*)\s*([^:]*):/.exec(trimmed);
        if (recipeMatch !== null) {
            const name = recipeMatch[1];
            const paramsStr = recipeMatch[2];
            if (name === undefined) {
                pendingComment = undefined;
                continue;
            }

            // Skip private recipes (start with _)
            if (name.startsWith('_')) {
                pendingComment = undefined;
                continue;
            }

            const params = parseJustParams(paramsStr ?? '');

            recipes.push({
                name,
                params,
                ...(pendingComment !== undefined && pendingComment !== '' ? { description: pendingComment } : {})
            });

            pendingComment = undefined;
        } else if (trimmed !== '') {
            // Reset comment if line isn't empty and isn't a comment
            pendingComment = undefined;
        }
    }

    return recipes;
}

/**
 * Parses Just recipe parameters.
 */
function parseJustParams(paramsStr: string): ParamDef[] {
    const params: ParamDef[] = [];
    if (paramsStr.trim() === '') {
        return params;
    }

    // Split by whitespace, but respect quoted strings
    const paramParts = paramsStr.trim().split(/\s+/);

    for (const part of paramParts) {
        // Match param="default" or param='default' or just param
        const withDefaultMatch = /^(\w+)\s*=\s*["']?([^"']*)["']?$/.exec(part);
        if (withDefaultMatch !== null) {
            const paramName = withDefaultMatch[1];
            const defaultVal = withDefaultMatch[2];
            if (paramName !== undefined) {
                params.push({
                    name: paramName,
                    ...(defaultVal !== undefined && defaultVal !== '' ? { default: defaultVal } : {})
                });
            }
        } else if (/^\w+$/.test(part)) {
            // Simple parameter name
            params.push({ name: part });
        }
    }

    return params;
}
