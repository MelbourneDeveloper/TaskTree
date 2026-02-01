import * as vscode from 'vscode';
import * as path from 'path';
import type { TaskItem } from '../models/TaskItem';
import { generateTaskId, simplifyPath } from '../models/TaskItem';

interface PackageJson {
    scripts?: Record<string, string>;
}

/**
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
        try {
            const content = await readFile(file);
            const pkg = JSON.parse(content) as PackageJson;

            if (pkg.scripts !== undefined && typeof pkg.scripts === 'object') {
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
        } catch {
            // Skip malformed package.json
        }
    }

    return tasks;
}

async function readFile(uri: vscode.Uri): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(bytes);
}

function truncate(str: string, max: number): string {
    return str.length > max ? `${str.slice(0, max - 3)}...` : str;
}
