import * as vscode from 'vscode';
import * as path from 'path';
import type { TaskItem, ParamDef, MutableTaskItem } from '../models/TaskItem';
import { generateTaskId, simplifyPath } from '../models/TaskItem';
import { readFile } from '../utils/fileUtils';

interface ProjectInfo {
    isTestProject: boolean;
    isExecutable: boolean;
}

const TEST_SDK_PACKAGE = 'Microsoft.NET.Test.Sdk';
const TEST_FRAMEWORKS = ['xunit', 'nunit', 'mstest'];
const EXECUTABLE_OUTPUT_TYPES = ['Exe', 'WinExe'];

/**
 * Discovers .NET projects (.csproj, .fsproj) and their available commands.
 */
export async function discoverDotnetProjects(
    workspaceRoot: string,
    excludePatterns: string[]
): Promise<TaskItem[]> {
    const exclude = `{${excludePatterns.join(',')}}`;
    const [csprojFiles, fsprojFiles] = await Promise.all([
        vscode.workspace.findFiles('**/*.csproj', exclude),
        vscode.workspace.findFiles('**/*.fsproj', exclude)
    ]);
    const allFiles = [...csprojFiles, ...fsprojFiles];
    const tasks: TaskItem[] = [];

    for (const file of allFiles) {
        const result = await readFile(file);
        if (!result.ok) {
            continue;
        }

        const content = result.value;
        const projectInfo = analyzeProject(content);
        const projectDir = path.dirname(file.fsPath);
        const category = simplifyPath(file.fsPath, workspaceRoot);
        const projectName = path.basename(file.fsPath, path.extname(file.fsPath));

        tasks.push(...createProjectTasks(
            file.fsPath,
            projectDir,
            category,
            projectName,
            projectInfo
        ));
    }

    return tasks;
}

function analyzeProject(content: string): ProjectInfo {
    const isTestProject = content.includes(TEST_SDK_PACKAGE) ||
        TEST_FRAMEWORKS.some(fw => content.includes(fw));

    const outputTypeMatch = /<OutputType>(.*?)<\/OutputType>/i.exec(content);
    const outputType = outputTypeMatch?.[1]?.trim();
    const isExecutable = outputType !== undefined &&
        EXECUTABLE_OUTPUT_TYPES.includes(outputType);

    return { isTestProject, isExecutable };
}

function createProjectTasks(
    filePath: string,
    projectDir: string,
    category: string,
    projectName: string,
    info: ProjectInfo
): TaskItem[] {
    const tasks: TaskItem[] = [];

    tasks.push({
        id: generateTaskId('dotnet', filePath, 'build'),
        label: `${projectName}: build`,
        type: 'dotnet',
        category,
        command: 'dotnet build',
        cwd: projectDir,
        filePath,
        tags: [],
        description: 'Build the project'
    });

    if (info.isTestProject) {
        const testTask: MutableTaskItem = {
            id: generateTaskId('dotnet', filePath, 'test'),
            label: `${projectName}: test`,
            type: 'dotnet',
            category,
            command: 'dotnet test',
            cwd: projectDir,
            filePath,
            tags: [],
            description: 'Run all tests',
            params: createTestParams()
        };
        tasks.push(testTask);
    } else if (info.isExecutable) {
        const runTask: MutableTaskItem = {
            id: generateTaskId('dotnet', filePath, 'run'),
            label: `${projectName}: run`,
            type: 'dotnet',
            category,
            command: 'dotnet run',
            cwd: projectDir,
            filePath,
            tags: [],
            description: 'Run the application',
            params: createRunParams()
        };
        tasks.push(runTask);
    }

    tasks.push({
        id: generateTaskId('dotnet', filePath, 'clean'),
        label: `${projectName}: clean`,
        type: 'dotnet',
        category,
        command: 'dotnet clean',
        cwd: projectDir,
        filePath,
        tags: [],
        description: 'Clean build outputs'
    });

    return tasks;
}

function createRunParams(): ParamDef[] {
    return [{
        name: 'args',
        description: 'Runtime arguments (optional, space-separated)',
        default: '',
        format: 'dashdash-args'
    }];
}

function createTestParams(): ParamDef[] {
    return [{
        name: 'filter',
        description: 'Test filter expression (optional, e.g., FullyQualifiedName~MyTest)',
        default: '',
        format: 'flag',
        flag: '--filter'
    }];
}
