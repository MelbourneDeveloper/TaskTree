import * as vscode from 'vscode';
import * as path from 'path';
import type { TaskItem } from '../models/TaskItem';
import { generateTaskId, simplifyPath } from '../models/TaskItem';
import { readFile } from '../utils/fileUtils';

/**
 * Discovers Gradle tasks from build.gradle and build.gradle.kts files.
 */
export async function discoverGradleTasks(
    workspaceRoot: string,
    excludePatterns: string[]
): Promise<TaskItem[]> {
    const exclude = `{${excludePatterns.join(',')}}`;
    const [groovyFiles, kotlinFiles] = await Promise.all([
        vscode.workspace.findFiles('**/build.gradle', exclude),
        vscode.workspace.findFiles('**/build.gradle.kts', exclude)
    ]);
    const allFiles = [...groovyFiles, ...kotlinFiles];
    const tasks: TaskItem[] = [];

    for (const file of allFiles) {
        const result = await readFile(file);
        if (!result.ok) {
            continue; // Skip files we can't read
        }

        const content = result.value;
        const gradleDir = path.dirname(file.fsPath);
        const category = simplifyPath(file.fsPath, workspaceRoot);
        const parsedTasks = parseGradleTasks(content);

        // Add standard Gradle tasks that are always available
        const standardTasks = ['build', 'clean', 'test', 'assemble', 'check'];
        for (const taskName of standardTasks) {
            if (!parsedTasks.includes(taskName)) {
                parsedTasks.push(taskName);
            }
        }

        for (const taskName of parsedTasks) {
            tasks.push({
                id: generateTaskId('gradle', file.fsPath, taskName),
                label: taskName,
                type: 'gradle',
                category,
                command: `./gradlew ${taskName}`,
                cwd: gradleDir,
                filePath: file.fsPath,
                tags: []
            });
        }
    }

    return tasks;
}

/**
 * Parses Gradle file to extract task names.
 */
function parseGradleTasks(content: string): string[] {
    const tasks: string[] = [];

    // Match task definitions: task taskName { ... } or task('taskName') { ... }
    const taskDefRegex = /task\s*\(?['"]?(\w+)['"]?\)?/g;
    let match;
    while ((match = taskDefRegex.exec(content)) !== null) {
        const task = match[1];
        if (task !== undefined && task !== '' && !tasks.includes(task)) {
            tasks.push(task);
        }
    }

    // Match Kotlin DSL: tasks.register("taskName") or tasks.create("taskName")
    const kotlinTaskRegex = /tasks\.(register|create)\s*\(\s*["'](\w+)["']/g;
    while ((match = kotlinTaskRegex.exec(content)) !== null) {
        const task = match[2];
        if (task !== undefined && task !== '' && !tasks.includes(task)) {
            tasks.push(task);
        }
    }

    return tasks;
}
