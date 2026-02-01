import * as vscode from 'vscode';
import * as path from 'path';
import type { TaskItem } from '../models/TaskItem';
import { generateTaskId, simplifyPath } from '../models/TaskItem';

/**
 * Standard Maven goals/phases.
 */
const STANDARD_MAVEN_GOALS = [
    { name: 'clean', description: 'Remove build artifacts' },
    { name: 'compile', description: 'Compile the source code' },
    { name: 'test', description: 'Run tests' },
    { name: 'package', description: 'Package compiled code' },
    { name: 'install', description: 'Install package locally' },
    { name: 'deploy', description: 'Deploy to remote repository' },
    { name: 'verify', description: 'Run integration tests' },
    { name: 'clean install', description: 'Clean and install' },
    { name: 'clean package', description: 'Clean and package' }
];

/**
 * Discovers Maven goals from pom.xml files.
 * Only returns tasks if Java source files (.java) exist in the workspace.
 */
export async function discoverMavenGoals(
    workspaceRoot: string,
    excludePatterns: string[]
): Promise<TaskItem[]> {
    const exclude = `{${excludePatterns.join(',')}}`;

    // Check if any Java source files exist before processing
    const javaFiles = await vscode.workspace.findFiles('**/*.java', exclude);
    if (javaFiles.length === 0) {
        return []; // No Java source code, skip Maven goals
    }

    const files = await vscode.workspace.findFiles('**/pom.xml', exclude);
    const tasks: TaskItem[] = [];

    for (const file of files) {
        const mavenDir = path.dirname(file.fsPath);
        const category = simplifyPath(file.fsPath, workspaceRoot);

        // Add standard Maven goals
        for (const goal of STANDARD_MAVEN_GOALS) {
            tasks.push({
                id: generateTaskId('maven', file.fsPath, goal.name),
                label: goal.name,
                type: 'maven',
                category,
                command: `mvn ${goal.name}`,
                cwd: mavenDir,
                filePath: file.fsPath,
                tags: [],
                description: goal.description
            });
        }
    }

    return tasks;
}
