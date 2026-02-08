import * as vscode from 'vscode';
import * as path from 'path';
import type { TaskItem } from '../models/TaskItem';
import { generateTaskId, simplifyPath } from '../models/TaskItem';
import { readFile, parseJson } from '../utils/fileUtils';

interface PackageJson {
    scripts?: Record<string, string>;
}

/**
 * SPEC: command-discovery/npm-scripts
 *
 * Discovers npm scripts from package.json files.
 */
export async function discoverNpmScripts(
    workspaceRoot: string,
    excludePatterns: string[]
): Promise<TaskItem[]> {
    const exclude = `{${excludePatterns.join(',')}}`;
    const files = await vscode.workspace.findFiles('**/package.json', exclude);
    const tasks: TaskItem[] = [];

    for (const file of files) {
        const contentResult = await readFile(file);
        if (!contentResult.ok) {
            continue; // Skip unreadable package.json
        }

        const pkgResult = parseJson<PackageJson>(contentResult.value);
        if (!pkgResult.ok) {
            continue; // Skip malformed package.json
        }

        const pkg = pkgResult.value;
        if (pkg.scripts === undefined || typeof pkg.scripts !== 'object') {
            continue;
        }

        const pkgDir = path.dirname(file.fsPath);
        const category = simplifyPath(file.fsPath, workspaceRoot);

        for (const [name, command] of Object.entries(pkg.scripts)) {
            if (typeof command !== 'string') {
                continue;
            }

            tasks.push({
                id: generateTaskId('npm', file.fsPath, name),
                label: name,
                type: 'npm',
                category,
                command: `npm run ${name}`,
                cwd: pkgDir,
                filePath: file.fsPath,
                tags: [],
                description: truncate(command, 60)
            });
        }
    }

    return tasks;
}

function truncate(str: string, max: number): string {
    return str.length > max ? `${str.slice(0, max - 3)}...` : str;
}
