import * as vscode from 'vscode';
import type { TaskItem } from '../models/TaskItem';
import { discoverShellScripts } from './shell';
import { discoverNpmScripts } from './npm';
import { discoverMakeTargets } from './make';
import { discoverLaunchConfigs } from './launch';
import { discoverVsCodeTasks } from './tasks';

export interface DiscoveryResult {
    shell: TaskItem[];
    npm: TaskItem[];
    make: TaskItem[];
    launch: TaskItem[];
    vscode: TaskItem[];
}

/**
 * Discovers all tasks from all sources.
 */
export async function discoverAllTasks(
    workspaceRoot: string,
    excludePatterns: string[]
): Promise<DiscoveryResult> {
    // Run all discoveries in parallel
    const [shell, npm, make, launch, vscodeTasks] = await Promise.all([
        discoverShellScripts(workspaceRoot, excludePatterns),
        discoverNpmScripts(workspaceRoot, excludePatterns),
        discoverMakeTargets(workspaceRoot, excludePatterns),
        discoverLaunchConfigs(workspaceRoot, excludePatterns),
        discoverVsCodeTasks(workspaceRoot, excludePatterns)
    ]);

    return {
        shell,
        npm,
        make,
        launch,
        vscode: vscodeTasks
    };
}

/**
 * Gets all tasks as a flat array.
 */
export function flattenTasks(result: DiscoveryResult): TaskItem[] {
    return [
        ...result.shell,
        ...result.npm,
        ...result.make,
        ...result.launch,
        ...result.vscode
    ];
}

/**
 * Gets the default exclude patterns from configuration.
 */
export function getExcludePatterns(): string[] {
    const config = vscode.workspace.getConfiguration('tasktree');
    return config.get<string[]>('excludePatterns') ?? [
        '**/node_modules/**',
        '**/bin/**',
        '**/obj/**',
        '**/.git/**',
        '**/test-fixtures/**'
    ];
}
