import * as vscode from 'vscode';
import * as path from 'path';
import type { TaskItem } from '../models/TaskItem';
import { generateTaskId, simplifyPath } from '../models/TaskItem';

/**
 * Discovers make targets from Makefiles.
 */
export async function discoverMakeTargets(
    workspaceRoot: string,
    excludePatterns: string[]
): Promise<TaskItem[]> {
    const exclude = `{${excludePatterns.join(',')}}`;
    // Look for Makefile, makefile, GNUmakefile
    const files = await vscode.workspace.findFiles(
        '**/[Mm]akefile',
        exclude
    );
    const gnuFiles = await vscode.workspace.findFiles(
        '**/GNUmakefile',
        exclude
    );
    const allFiles = [...files, ...gnuFiles];
    const tasks: TaskItem[] = [];

    for (const file of allFiles) {
        try {
            const content = await readFile(file);
            const targets = parseMakeTargets(content);
            const makeDir = path.dirname(file.fsPath);
            const category = simplifyPath(file.fsPath, workspaceRoot);

            for (const target of targets) {
                // Skip internal targets (start with .)
                if (target.startsWith('.')) {
                    continue;
                }

                tasks.push({
                    id: generateTaskId('make', file.fsPath, target),
                    label: target,
                    type: 'make',
                    category,
                    command: `make ${target}`,
                    cwd: makeDir,
                    filePath: file.fsPath,
                    tags: []
                });
            }
        } catch {
            // Skip files we can't read
        }
    }

    return tasks;
}

/**
 * Parses Makefile to extract target names.
 */
function parseMakeTargets(content: string): string[] {
    const targets: string[] = [];
    // Match lines like "target:" or "target: dependencies"
    // But not variable assignments like "VAR = value" or "VAR := value"
    const targetRegex = /^([a-zA-Z_][a-zA-Z0-9_-]*)\s*:/gm;

    let match;
    while ((match = targetRegex.exec(content)) !== null) {
        const target = match[1];
        if (target === undefined || target === '') {
            continue;
        }
        // Add target if not already present
        if (!targets.includes(target)) {
            targets.push(target);
        }
    }

    return targets;
}

async function readFile(uri: vscode.Uri): Promise<string> {
    const bytes = await vscode.workspace.fs.readFile(uri);
    return new TextDecoder().decode(bytes);
}
