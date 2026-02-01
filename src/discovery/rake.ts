import * as vscode from 'vscode';
import * as path from 'path';
import type { TaskItem, MutableTaskItem } from '../models/TaskItem';
import { generateTaskId, simplifyPath } from '../models/TaskItem';
import { readFile } from '../utils/fileUtils';

/**
 * Discovers Rake tasks from Rakefile.
 */
export async function discoverRakeTasks(
    workspaceRoot: string,
    excludePatterns: string[]
): Promise<TaskItem[]> {
    const exclude = `{${excludePatterns.join(',')}}`;
    // Rake supports: Rakefile, rakefile, Rakefile.rb, rakefile.rb
    const [rakefiles, lcRakefiles, rbRakefiles, lcRbRakefiles] = await Promise.all([
        vscode.workspace.findFiles('**/Rakefile', exclude),
        vscode.workspace.findFiles('**/rakefile', exclude),
        vscode.workspace.findFiles('**/Rakefile.rb', exclude),
        vscode.workspace.findFiles('**/rakefile.rb', exclude)
    ]);
    const allFiles = [...rakefiles, ...lcRakefiles, ...rbRakefiles, ...lcRbRakefiles];
    const tasks: TaskItem[] = [];

    for (const file of allFiles) {
        const result = await readFile(file);
        if (!result.ok) {
            continue; // Skip files we can't read
        }

        const content = result.value;
        const rakeDir = path.dirname(file.fsPath);
        const category = simplifyPath(file.fsPath, workspaceRoot);
        const rakeTasks = parseRakeTasks(content);

        for (const rakeTask of rakeTasks) {
            const task: MutableTaskItem = {
                id: generateTaskId('rake', file.fsPath, rakeTask.name),
                label: rakeTask.name,
                type: 'rake',
                category,
                command: `rake ${rakeTask.name}`,
                cwd: rakeDir,
                filePath: file.fsPath,
                tags: []
            };
            if (rakeTask.description !== undefined) {
                task.description = rakeTask.description;
            }
            tasks.push(task);
        }
    }

    return tasks;
}

interface RakeTask {
    name: string;
    description?: string;
}

/**
 * Parses Rakefile to extract task names and descriptions.
 */
function parseRakeTasks(content: string): RakeTask[] {
    const tasks: RakeTask[] = [];
    const lines = content.split('\n');
    let pendingDesc: string | undefined;

    for (const line of lines) {
        const trimmed = line.trim();

        // Match desc "description" or desc 'description'
        const descMatch = /^desc\s+["'](.+)["']/.exec(trimmed);
        if (descMatch !== null) {
            pendingDesc = descMatch[1];
            continue;
        }

        // Match task :name or task :name => [...] or task "name"
        const taskMatch = /^task\s+[:"']?(\w+)[:"']?/.exec(trimmed);
        if (taskMatch !== null) {
            const name = taskMatch[1];
            if (name !== undefined && name !== '') {
                tasks.push({
                    name,
                    ...(pendingDesc !== undefined && pendingDesc !== '' ? { description: pendingDesc } : {})
                });
            }
            pendingDesc = undefined;
        }
    }

    return tasks;
}
