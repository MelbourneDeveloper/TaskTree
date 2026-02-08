import * as vscode from 'vscode';
import type { TaskItem } from '../models/TaskItem';
import { discoverShellScripts } from './shell';
import { discoverNpmScripts } from './npm';
import { discoverMakeTargets } from './make';
import { discoverLaunchConfigs } from './launch';
import { discoverVsCodeTasks } from './tasks';
import { discoverPythonScripts } from './python';
import { discoverPowerShellScripts } from './powershell';
import { discoverGradleTasks } from './gradle';
import { discoverCargoTasks } from './cargo';
import { discoverMavenGoals } from './maven';
import { discoverAntTargets } from './ant';
import { discoverJustRecipes } from './just';
import { discoverTaskfileTasks } from './taskfile';
import { discoverDenoTasks } from './deno';
import { discoverRakeTasks } from './rake';
import { discoverComposerScripts } from './composer';
import { discoverDockerComposeServices } from './docker';
import { discoverDotnetProjects } from './dotnet';
import { discoverMarkdownFiles } from './markdown';
import { logger } from '../utils/logger';

export interface DiscoveryResult {
    shell: TaskItem[];
    npm: TaskItem[];
    make: TaskItem[];
    launch: TaskItem[];
    vscode: TaskItem[];
    python: TaskItem[];
    powershell: TaskItem[];
    gradle: TaskItem[];
    cargo: TaskItem[];
    maven: TaskItem[];
    ant: TaskItem[];
    just: TaskItem[];
    taskfile: TaskItem[];
    deno: TaskItem[];
    rake: TaskItem[];
    composer: TaskItem[];
    docker: TaskItem[];
    dotnet: TaskItem[];
    markdown: TaskItem[];
}

/**
 * Discovers all tasks from all sources.
 */
export async function discoverAllTasks(
    workspaceRoot: string,
    excludePatterns: string[]
): Promise<DiscoveryResult> {
    logger.info('Discovery started', { workspaceRoot, excludePatterns });

    // Run all discoveries in parallel
    const [
        shell, npm, make, launch, vscodeTasks, python,
        powershell, gradle, cargo, maven, ant, just,
        taskfile, deno, rake, composer, docker, dotnet, markdown
    ] = await Promise.all([
        discoverShellScripts(workspaceRoot, excludePatterns),
        discoverNpmScripts(workspaceRoot, excludePatterns),
        discoverMakeTargets(workspaceRoot, excludePatterns),
        discoverLaunchConfigs(workspaceRoot, excludePatterns),
        discoverVsCodeTasks(workspaceRoot, excludePatterns),
        discoverPythonScripts(workspaceRoot, excludePatterns),
        discoverPowerShellScripts(workspaceRoot, excludePatterns),
        discoverGradleTasks(workspaceRoot, excludePatterns),
        discoverCargoTasks(workspaceRoot, excludePatterns),
        discoverMavenGoals(workspaceRoot, excludePatterns),
        discoverAntTargets(workspaceRoot, excludePatterns),
        discoverJustRecipes(workspaceRoot, excludePatterns),
        discoverTaskfileTasks(workspaceRoot, excludePatterns),
        discoverDenoTasks(workspaceRoot, excludePatterns),
        discoverRakeTasks(workspaceRoot, excludePatterns),
        discoverComposerScripts(workspaceRoot, excludePatterns),
        discoverDockerComposeServices(workspaceRoot, excludePatterns),
        discoverDotnetProjects(workspaceRoot, excludePatterns),
        discoverMarkdownFiles(workspaceRoot, excludePatterns)
    ]);

    const result = {
        shell,
        npm,
        make,
        launch,
        vscode: vscodeTasks,
        python,
        powershell,
        gradle,
        cargo,
        maven,
        ant,
        just,
        taskfile,
        deno,
        rake,
        composer,
        docker,
        dotnet,
        markdown
    };

    const totalCount = shell.length + npm.length + make.length + launch.length +
        vscodeTasks.length + python.length + powershell.length + gradle.length +
        cargo.length + maven.length + ant.length + just.length + taskfile.length +
        deno.length + rake.length + composer.length + docker.length + dotnet.length +
        markdown.length;

    logger.info('Discovery complete', {
        totalCount,
        shell: shell.length,
        npm: npm.length,
        make: make.length,
        launch: launch.length,
        vscode: vscodeTasks.length,
        python: python.length,
        dotnet: dotnet.length,
        shellTaskIds: shell.map(t => t.id)
    });

    return result;
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
        ...result.vscode,
        ...result.python,
        ...result.powershell,
        ...result.gradle,
        ...result.cargo,
        ...result.maven,
        ...result.ant,
        ...result.just,
        ...result.taskfile,
        ...result.deno,
        ...result.rake,
        ...result.composer,
        ...result.docker,
        ...result.dotnet,
        ...result.markdown
    ];
}

/**
 * Gets the default exclude patterns from configuration.
 */
export function getExcludePatterns(): string[] {
    const config = vscode.workspace.getConfiguration('commandtree');
    return config.get<string[]>('excludePatterns') ?? [
        '**/node_modules/**',
        '**/bin/**',
        '**/obj/**',
        '**/.git/**'
    ];
}
