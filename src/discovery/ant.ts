import * as vscode from 'vscode';
import * as path from 'path';
import type { TaskItem } from '../models/TaskItem';
import { generateTaskId, simplifyPath } from '../models/TaskItem';
import { readFile } from '../utils/fileUtils';

/**
 * Discovers Ant targets from build.xml files.
 * Only returns tasks if Java source files (.java) exist in the workspace.
 */
export async function discoverAntTargets(
    workspaceRoot: string,
    excludePatterns: string[]
): Promise<TaskItem[]> {
    const exclude = `{${excludePatterns.join(',')}}`;

    // Check if any Java source files exist before processing
    const javaFiles = await vscode.workspace.findFiles('**/*.java', exclude);
    if (javaFiles.length === 0) {
        return []; // No Java source code, skip Ant targets
    }

    const files = await vscode.workspace.findFiles('**/build.xml', exclude);
    const tasks: TaskItem[] = [];

    for (const file of files) {
        const result = await readFile(file);
        if (!result.ok) {
            continue; // Skip files we can't read
        }

        const content = result.value;
        const antDir = path.dirname(file.fsPath);
        const category = simplifyPath(file.fsPath, workspaceRoot);
        const targets = parseAntTargets(content);

        for (const target of targets) {
            tasks.push({
                id: generateTaskId('ant', file.fsPath, target.name),
                label: target.name,
                type: 'ant',
                category,
                command: `ant ${target.name}`,
                cwd: antDir,
                filePath: file.fsPath,
                tags: [],
                ...(target.description !== undefined ? { description: target.description } : {})
            });
        }
    }

    return tasks;
}

interface AntTarget {
    name: string;
    description?: string;
}

/**
 * Parses build.xml to extract target names and descriptions.
 */
function parseAntTargets(content: string): AntTarget[] {
    const targets: AntTarget[] = [];

    // Match <target name="..." description="..."> patterns
    const targetRegex = /<target\s+[^>]*name\s*=\s*["']([^"']+)["'][^>]*(?:description\s*=\s*["']([^"']+)["'])?[^>]*>/g;
    let match;
    while ((match = targetRegex.exec(content)) !== null) {
        const name = match[1];
        const description = match[2];
        if (name !== undefined && name !== '' && !targets.some(t => t.name === name)) {
            targets.push({
                name,
                ...(description !== undefined && description !== '' ? { description } : {})
            });
        }
    }

    // Also match targets where description comes before name
    const altRegex = /<target\s+[^>]*description\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']([^"']+)["'][^>]*>/g;
    while ((match = altRegex.exec(content)) !== null) {
        const description = match[1];
        const name = match[2];
        if (name !== undefined && name !== '' && !targets.some(t => t.name === name)) {
            targets.push({
                name,
                ...(description !== undefined && description !== '' ? { description } : {})
            });
        }
    }

    return targets;
}
