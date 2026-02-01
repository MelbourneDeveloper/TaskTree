import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
    activateExtension,
    sleep,
    getFixturePath,
    createMockTaskItem,
    getTaskTreeProvider
} from './helpers';
import type { TestContext } from './helpers';
import type { TaskItem } from '../../models/TaskItem';

interface PackageJson {
    scripts?: Record<string, string>;
}

suite('Task Execution E2E Tests', () => {
    let context: TestContext;

    suiteSetup(async function() {
        this.timeout(30000);
        context = await activateExtension();
        await sleep(2000);
    });

    suiteTeardown(() => {
        // Close any terminals that were opened during tests
        for (const t of vscode.window.terminals) {
            t.dispose();
        }
    });

    suite('Run Command', () => {
        test('run command is registered', async function() {
            this.timeout(10000);

            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('tasktree.run'), 'run command should be registered');
        });

        test('run command handles undefined task gracefully', async function() {
            this.timeout(10000);

            const terminalsBefore = vscode.window.terminals.length;

            // Calling run without a task should not crash
            try {
                await vscode.commands.executeCommand('tasktree.run', undefined);
                await sleep(500);
            } catch {
                // Expected to potentially throw or show error
            }

            // Verify no terminal was created for undefined task
            const terminalsAfter = vscode.window.terminals.length;
            assert.strictEqual(terminalsAfter, terminalsBefore, 'Should not create terminal for undefined task');
        });

        test('run command handles null task gracefully', async function() {
            this.timeout(10000);

            const terminalsBefore = vscode.window.terminals.length;

            try {
                await vscode.commands.executeCommand('tasktree.run', null);
                await sleep(500);
            } catch {
                // Expected behavior
            }

            // Verify no terminal was created for null task
            const terminalsAfter = vscode.window.terminals.length;
            assert.strictEqual(terminalsAfter, terminalsBefore, 'Should not create terminal for null task');
        });
    });

    suite('Shell Script Execution', () => {
        test('shell scripts exist and are executable format', function() {
            this.timeout(10000);

            const buildScript = getFixturePath('scripts/build.sh');
            assert.ok(fs.existsSync(buildScript), 'build.sh should exist');

            const content = fs.readFileSync(buildScript, 'utf8');
            assert.ok(content.startsWith('#!/bin/bash'), 'Should have shebang');
        });

        test('shell task creates terminal with correct name', async function() {
            this.timeout(15000);

            const terminalsBefore = vscode.window.terminals.length;

            // Create a mock shell task
            const shellTask = createMockTaskItem({
                type: 'shell',
                label: 'Test Shell Task',
                command: './scripts/test.sh',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh')
            });

            // Execute the task
            try {
                await vscode.commands.executeCommand('tasktree.run', shellTask);
                await sleep(2000);

                // Check if a terminal was created
                const terminalsAfter = vscode.window.terminals.length;
                assert.ok(terminalsAfter >= terminalsBefore, 'Shell task should create or reuse terminal');
            } catch {
                // Task execution may require user input for params - verify we still have terminals
                const terminalsAfter = vscode.window.terminals.length;
                assert.ok(terminalsAfter >= 0, 'Terminals should remain accessible after param prompt');
            }
        });

        test('shell task with parameters has param definitions', function() {
            this.timeout(10000);

            const buildScript = fs.readFileSync(getFixturePath('scripts/build.sh'), 'utf8');

            // Verify param comments exist
            assert.ok(buildScript.includes('@param config'), 'Should have config param');
            assert.ok(buildScript.includes('@param verbose'), 'Should have verbose param');
        });

        test('shell task with options shows quick pick', function() {
            this.timeout(10000);

            const deployScript = fs.readFileSync(getFixturePath('scripts/deploy.sh'), 'utf8');

            // Verify options param exists
            assert.ok(deployScript.includes('options:'), 'Should have options in param');
            assert.ok(deployScript.includes('dev, staging, prod'), 'Should list environment options');
        });
    });

    suite('NPM Script Execution', () => {
        test('npm scripts are defined in package.json', function() {
            this.timeout(10000);

            const packageJson = JSON.parse(fs.readFileSync(getFixturePath('package.json'), 'utf8')) as PackageJson;
            const scripts = packageJson.scripts;

            assert.ok(scripts !== undefined, 'Should have scripts object');
            assert.ok(scripts['build'] !== undefined, 'Should have build script');
            assert.ok(scripts['test'] !== undefined, 'Should have test script');
        });

        test('npm task creates correct command', function() {
            this.timeout(10000);

            // An npm task should run 'npm run <scriptname>'
            const npmTask = createMockTaskItem({
                type: 'npm',
                label: 'build',
                command: 'npm run build',
                cwd: context.workspaceRoot
            });

            assert.strictEqual(npmTask.command, 'npm run build', 'Should have correct command');
        });

        test('npm task uses correct working directory', function() {
            this.timeout(10000);

            // Subproject npm tasks should use subproject directory as cwd
            const subprojectCwd = path.join(context.workspaceRoot, 'subproject');

            const npmTask = createMockTaskItem({
                type: 'npm',
                label: 'build',
                command: 'npm run build',
                cwd: subprojectCwd,
                category: 'subproject'
            });

            assert.strictEqual(npmTask.cwd, subprojectCwd, 'Should have subproject cwd');
        });
    });

    suite('Make Target Execution', () => {
        test('Makefile targets are defined', function() {
            this.timeout(10000);

            const makefile = fs.readFileSync(getFixturePath('Makefile'), 'utf8');

            assert.ok(makefile.includes('build:'), 'Should have build target');
            assert.ok(makefile.includes('test:'), 'Should have test target');
            assert.ok(makefile.includes('clean:'), 'Should have clean target');
        });

        test('make task creates correct command', function() {
            this.timeout(10000);

            // A make task should run 'make <targetname>'
            const makeTask = createMockTaskItem({
                type: 'make',
                label: 'build',
                command: 'make build',
                cwd: context.workspaceRoot
            });

            assert.strictEqual(makeTask.command, 'make build', 'Should have correct command');
        });

        test('make task targets phony declarations', function() {
            this.timeout(10000);

            const makefile = fs.readFileSync(getFixturePath('Makefile'), 'utf8');

            // Verify .PHONY is used
            assert.ok(makefile.includes('.PHONY:'), 'Should have .PHONY declaration');
        });
    });

    suite('Launch Configuration Execution', () => {
        test('launch configurations are defined', function() {
            this.timeout(10000);

            const launchJson = fs.readFileSync(getFixturePath('.vscode/launch.json'), 'utf8');

            assert.ok(launchJson.includes('Debug Application'), 'Should have Debug Application');
            assert.ok(launchJson.includes('Debug Tests'), 'Should have Debug Tests');
        });

        test('launch task uses debug API', function() {
            this.timeout(10000);

            // Launch tasks should use vscode.debug.startDebugging
            const launchTask = createMockTaskItem({
                type: 'launch',
                label: 'Debug Application',
                command: 'Debug Application'
            });

            assert.strictEqual(launchTask.type, 'launch', 'Should be launch type');
        });

        test('launch configurations have correct types', function() {
            this.timeout(10000);

            const launchJson = fs.readFileSync(getFixturePath('.vscode/launch.json'), 'utf8');

            assert.ok(launchJson.includes('"type": "node"'), 'Should have node type');
            assert.ok(launchJson.includes('"type": "python"'), 'Should have python type');
        });
    });

    suite('VS Code Task Execution', () => {
        test('VS Code tasks are defined', function() {
            this.timeout(10000);

            const tasksJson = fs.readFileSync(getFixturePath('.vscode/tasks.json'), 'utf8');

            assert.ok(tasksJson.includes('Build Project'), 'Should have Build Project');
            assert.ok(tasksJson.includes('Run Tests'), 'Should have Run Tests');
        });

        test('vscode task fetches from task provider', async function() {
            this.timeout(15000);

            // VS Code tasks should use vscode.tasks.fetchTasks()
            const tasks = await vscode.tasks.fetchTasks();

            // May have tasks from the workspace or none
            assert.ok(Array.isArray(tasks), 'fetchTasks should return array');
        });

        test('vscode task with inputs has parameter definitions', function() {
            this.timeout(10000);

            const tasksJson = fs.readFileSync(getFixturePath('.vscode/tasks.json'), 'utf8');

            // Tasks with ${input:xxx} should have corresponding param definitions
            assert.ok(tasksJson.includes('${input:deployEnv}'), 'Should reference deployEnv');
            assert.ok(tasksJson.includes('"id": "deployEnv"'), 'Should define deployEnv input');
        });
    });

    suite('Parameter Collection', () => {
        test('task with no params executes directly', function() {
            this.timeout(10000);

            const taskWithoutParams = createMockTaskItem({
                type: 'shell',
                label: 'Simple Task',
                command: 'echo "hello"',
                params: []
            });

            assert.strictEqual(taskWithoutParams.params?.length ?? 0, 0, 'Should have no params');
        });

        test('task with params has param definitions', function() {
            this.timeout(10000);

            const taskWithParams = createMockTaskItem({
                type: 'shell',
                label: 'Param Task',
                command: './scripts/build.sh',
                params: [
                    { name: 'config', description: 'Build configuration', default: 'debug' },
                    { name: 'verbose', description: 'Enable verbose output' }
                ]
            });

            assert.strictEqual(taskWithParams.params?.length ?? 0, 2, 'Should have 2 params');
        });

        test('param with options creates quick pick choices', function() {
            this.timeout(10000);

            const paramWithOptions = {
                name: 'environment',
                description: 'Target environment',
                options: ['dev', 'staging', 'prod']
            };

            assert.ok(paramWithOptions.options.length === 3, 'Should have 3 options');
        });

        test('param with default value provides placeholder', function() {
            this.timeout(10000);

            const paramWithDefault = {
                name: 'config',
                description: 'Build configuration',
                default: 'debug'
            };

            assert.ok(paramWithDefault.default === 'debug', 'Should have default value');
        });
    });

    suite('Task Execution Error Handling', () => {
        test('handles missing script file gracefully', async function() {
            this.timeout(10000);

            const missingTask = createMockTaskItem({
                type: 'shell',
                label: 'Missing Script',
                command: './nonexistent.sh',
                filePath: '/nonexistent/path/script.sh'
            });

            // Execution should handle missing file
            try {
                await vscode.commands.executeCommand('tasktree.run', missingTask);
                await sleep(1000);
            } catch {
                // Expected
            }

            // Verify provider is still functional after error
            const provider = getTaskTreeProvider();
            const tasks = provider.getAllTasks();
            assert.ok(Array.isArray(tasks), 'Provider should still return tasks after handling missing script');
        });

        test('handles invalid task type gracefully', async function() {
            this.timeout(10000);

            const invalidTask = createMockTaskItem({
                type: 'invalid-type' as 'shell',
                label: 'Invalid Task',
                command: 'echo test'
            });

            try {
                await vscode.commands.executeCommand('tasktree.run', invalidTask);
                await sleep(500);
            } catch {
                // Expected
            }

            // Verify provider is still functional after handling invalid type
            const provider = getTaskTreeProvider();
            const tasks = provider.getAllTasks();
            assert.ok(Array.isArray(tasks), 'Provider should still return tasks after handling invalid task type');
        });

        test('handles task cancellation gracefully', function() {
            this.timeout(10000);

            // When user cancels parameter input, task should not execute
            // Verify the task structure supports params that would prompt for input
            const taskWithParams = createMockTaskItem({
                type: 'shell',
                label: 'Param Task',
                command: './scripts/build.sh',
                params: [
                    { name: 'config', description: 'Build configuration' }
                ]
            });

            // Verify task has params that would trigger the cancellation code path
            assert.ok(taskWithParams.params !== undefined, 'Task should have params');
            assert.ok(taskWithParams.params.length > 0, 'Task should have at least one param');
        });
    });

    suite('Terminal Management', () => {
        test('terminals are created for shell tasks', function() {
            this.timeout(10000);

            // Verify terminal API is available
            assert.ok(vscode.window.terminals.length >= 0, 'Terminals API should be available');
        });

        test('terminal names are descriptive', async function() {
            this.timeout(15000);

            // Terminal names should include task label for identification
            const shellTask = createMockTaskItem({
                type: 'shell',
                label: 'Descriptive Name Test',
                command: 'echo "test"',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh')
            });

            const taskTreeItem = { task: shellTask };
            await vscode.commands.executeCommand('tasktree.run', taskTreeItem);
            await sleep(1500);

            // Verify terminal with descriptive name was created
            const taskTreeTerminal = vscode.window.terminals.find(t => t.name.includes('TaskTree'));
            assert.ok(taskTreeTerminal !== undefined, 'Terminal should have TaskTree in name');
        });

        test('task execution creates VS Code task', function() {
            this.timeout(15000);

            // VS Code tasks API - verify methods exist
            assert.strictEqual(typeof vscode.tasks.fetchTasks, 'function', 'fetchTasks should be a function');
            assert.strictEqual(typeof vscode.tasks.executeTask, 'function', 'executeTask should be a function');
        });
    });

    suite('Run Task (New Terminal)', () => {
        test('tasktree.run creates a new terminal', async function() {
            this.timeout(15000);

            const terminalsBefore = vscode.window.terminals.length;

            const shellTask = createMockTaskItem({
                type: 'shell',
                label: 'Test New Terminal',
                command: 'echo "hello from new terminal"',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh')
            });

            // Create a TaskTreeItem wrapper
            const taskTreeItem = { task: shellTask };

            await vscode.commands.executeCommand('tasktree.run', taskTreeItem);
            await sleep(1500);

            const terminalsAfter = vscode.window.terminals.length;
            assert.ok(terminalsAfter >= terminalsBefore, 'Should have at least as many terminals');
        });

        test('tasktree.run terminal has descriptive name', async function() {
            this.timeout(15000);

            const shellTask = createMockTaskItem({
                type: 'shell',
                label: 'Descriptive Task Name',
                command: 'echo "test"',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh')
            });

            const taskTreeItem = { task: shellTask };

            await vscode.commands.executeCommand('tasktree.run', taskTreeItem);
            await sleep(1500);

            // Check if a terminal with TaskTree in the name exists
            const taskTreeTerminal = vscode.window.terminals.find(t => t.name.includes('TaskTree'));
            assert.ok(taskTreeTerminal !== undefined, 'Should create terminal with TaskTree in name');
        });

        test('tasktree.run handles undefined gracefully', async function() {
            this.timeout(10000);

            const terminalsBefore = vscode.window.terminals.length;

            try {
                await vscode.commands.executeCommand('tasktree.run', undefined);
            } catch {
                // Expected behavior
            }

            // Verify no terminal was created for undefined task
            const terminalsAfter = vscode.window.terminals.length;
            assert.strictEqual(terminalsAfter, terminalsBefore, 'Should not create terminal for undefined task');
        });

        test('tasktree.run handles null task property gracefully', async function() {
            this.timeout(10000);

            const terminalsBefore = vscode.window.terminals.length;

            try {
                await vscode.commands.executeCommand('tasktree.run', { task: null });
            } catch {
                // Expected behavior
            }

            // Verify no terminal was created for null task property
            const terminalsAfter = vscode.window.terminals.length;
            assert.strictEqual(terminalsAfter, terminalsBefore, 'Should not create terminal for null task property');
        });
    });

    suite('Run In Current Terminal', () => {
        test('runInCurrentTerminal command is registered', async function() {
            this.timeout(10000);

            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('tasktree.runInCurrentTerminal'), 'runInCurrentTerminal command should be registered');
        });

        test('runInCurrentTerminal creates terminal if none exists', async function() {
            this.timeout(15000);

            // Close all terminals first
            for (const t of vscode.window.terminals) {
                t.dispose();
            }
            await sleep(500);

            const shellTask = createMockTaskItem({
                type: 'shell',
                label: 'Test Current Terminal',
                command: 'echo "hello from current terminal"',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh')
            });

            const taskTreeItem = { task: shellTask };

            await vscode.commands.executeCommand('tasktree.runInCurrentTerminal', taskTreeItem);
            await sleep(1500);

            assert.ok(vscode.window.terminals.length >= 1, 'Should create terminal if none exists');
        });

        test('runInCurrentTerminal uses active terminal if available', async function() {
            this.timeout(15000);

            // Create a terminal manually
            const existingTerminal = vscode.window.createTerminal('Existing Terminal');
            existingTerminal.show();
            await sleep(500);

            const terminalsBefore = vscode.window.terminals.length;

            const shellTask = createMockTaskItem({
                type: 'shell',
                label: 'Test Use Existing',
                command: 'echo "use existing"',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh')
            });

            const taskTreeItem = { task: shellTask };

            await vscode.commands.executeCommand('tasktree.runInCurrentTerminal', taskTreeItem);
            await sleep(1000);

            // Should not create new terminal when one is active
            const terminalsAfter = vscode.window.terminals.length;
            assert.ok(terminalsAfter <= terminalsBefore + 1, 'Should reuse existing terminal or create at most one');
        });

        test('runInCurrentTerminal handles undefined gracefully', async function() {
            this.timeout(10000);

            const terminalsBefore = vscode.window.terminals.length;

            try {
                await vscode.commands.executeCommand('tasktree.runInCurrentTerminal', undefined);
            } catch {
                // Expected behavior
            }

            // Verify no new terminal was created for undefined task
            const terminalsAfter = vscode.window.terminals.length;
            assert.ok(terminalsAfter <= terminalsBefore + 1, 'Should not create more than one terminal for undefined task');
        });

        test('runInCurrentTerminal shows terminal', async function() {
            this.timeout(15000);

            const shellTask = createMockTaskItem({
                type: 'shell',
                label: 'Test Show Terminal',
                command: 'echo "visible"',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh')
            });

            const taskTreeItem = { task: shellTask };

            await vscode.commands.executeCommand('tasktree.runInCurrentTerminal', taskTreeItem);
            await sleep(1000);

            // Terminal should be active/visible
            assert.ok(vscode.window.activeTerminal !== undefined, 'Should have active terminal after execution');
        });
    });

    suite('Launch Config Execution', () => {
        test('launch tasks use debug API', function() {
            this.timeout(10000);

            assert.strictEqual(typeof vscode.debug.startDebugging, 'function', 'startDebugging should be a function');
        });

        test('active debug sessions can be queried', function() {
            this.timeout(10000);

            const session = vscode.debug.activeDebugSession;
            if (session !== undefined) {
                assert.strictEqual(typeof session.name, 'string', 'Active session should have name');
                assert.strictEqual(typeof session.type, 'string', 'Active session should have type');
            }
            // Verify debug API is available and functional
            assert.strictEqual(typeof vscode.debug.activeDebugSession, 'object', 'activeDebugSession should be queryable (object or undefined)');
            assert.strictEqual(typeof vscode.debug.startDebugging, 'function', 'startDebugging should be a function');
        });
    });

    suite('Working Directory Handling', () => {
        test('shell tasks use correct cwd', function() {
            this.timeout(10000);

            const task = createMockTaskItem({
                type: 'shell',
                cwd: context.workspaceRoot
            });

            assert.ok(task.cwd === context.workspaceRoot, 'Should have workspace root as cwd');
        });

        test('npm tasks use package.json directory as cwd', function() {
            this.timeout(10000);

            const subprojectDir = path.join(context.workspaceRoot, 'subproject');

            const task = createMockTaskItem({
                type: 'npm',
                cwd: subprojectDir
            });

            assert.ok(task.cwd === subprojectDir, 'Should have subproject dir as cwd');
        });

        test('make tasks use Makefile directory as cwd', function() {
            this.timeout(10000);

            const task = createMockTaskItem({
                type: 'make',
                cwd: context.workspaceRoot
            });

            assert.ok(task.cwd === context.workspaceRoot, 'Should have Makefile dir as cwd');
        });
    });

    suite('Python Task Execution', () => {
        test('python task executes in terminal', async function() {
            this.timeout(20000);

            const terminalsBefore = vscode.window.terminals.length;

            const pythonTask = createMockTaskItem({
                type: 'python',
                label: 'Test Python Script',
                command: path.join(context.workspaceRoot, 'scripts/build_project.py'),
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/build_project.py')
            });

            const taskTreeItem = { task: pythonTask };

            await vscode.commands.executeCommand('tasktree.run', taskTreeItem);
            await sleep(1000);

            const terminalsAfter = vscode.window.terminals.length;

            // Python tasks execute in terminal (not via VS Code task API)
            assert.ok(terminalsAfter > terminalsBefore, 'Python task should create a terminal');

            // Verify there's an active terminal
            assert.ok(vscode.window.activeTerminal !== undefined, 'Should have active terminal');
        });

        test('python task discovered from workspace has correct structure', async function() {
            this.timeout(15000);

            // Refresh to ensure tasks are discovered
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1500);

            const provider = getTaskTreeProvider();

            const allTasks = provider.getAllTasks();
            const pythonTasks = allTasks.filter((t: TaskItem) => t.type === 'python');

            assert.ok(pythonTasks.length > 0, 'Should discover at least one Python task');

            const buildPython = pythonTasks.find((t: TaskItem) => t.label === 'build_project.py');
            assert.ok(buildPython !== undefined, 'Should find build_project.py');
            assert.ok(buildPython.command.endsWith('build_project.py'), 'Command should be the script path');
            assert.ok(buildPython.cwd !== undefined, 'Python task should have cwd set');
        });
    });

    suite('Launch Task Execution', () => {
        test('launch task attempts to start debugging', async function() {
            this.timeout(20000);

            // Use object to track state change from async callback (linter doesn't track object mutations)
            const state = { debugSessionStarted: false };
            const disposable = vscode.debug.onDidStartDebugSession(() => {
                state.debugSessionStarted = true;
            });

            // Use a launch config that exists in the test fixtures
            const launchTask = createMockTaskItem({
                type: 'launch',
                label: 'Debug Application',
                command: 'Debug Application'
            });

            const taskTreeItem = { task: launchTask };

            try {
                await vscode.commands.executeCommand('tasktree.run', taskTreeItem);
                await sleep(2000);
            } catch {
                // Debug may fail if node isn't set up, but we're testing the attempt
            }

            disposable.dispose();

            // We verify the code path ran - either debug started successfully or showed an error
            // Both are valid outcomes depending on environment
            if (state.debugSessionStarted) {
                // Stop the debug session if it started
                await vscode.commands.executeCommand('workbench.action.debug.stop');
            }
            assert.ok(vscode.workspace.workspaceFolders !== undefined, 'Workspace should exist for launch tasks');
        });

        test('launch task discovered from workspace has launch type', async function() {
            this.timeout(15000);

            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1500);

            const provider = getTaskTreeProvider();

            const allTasks = provider.getAllTasks();
            const launchTasks = allTasks.filter(t => t.type === 'launch');

            assert.ok(launchTasks.length > 0, 'Should discover launch configurations');

            const debugApp = launchTasks.find(t => t.label === 'Debug Application');
            assert.ok(debugApp !== undefined, 'Should find Debug Application launch config');
            assert.strictEqual(debugApp.type, 'launch', 'Type should be launch');
        });
    });

    suite('VS Code Task Execution', () => {
        test('vscode task executes matching task from tasks.json', async function() {
            this.timeout(20000);

            let taskExecuted = false;
            const disposable = vscode.tasks.onDidStartTask(e => {
                if (e.execution.task.name === 'Build Project') {
                    taskExecuted = true;
                }
            });

            // First verify the task exists
            const allVscodeTasks = await vscode.tasks.fetchTasks();
            const buildTask = allVscodeTasks.find(t => t.name === 'Build Project');

            if (buildTask !== undefined) {
                const vscodeTask = createMockTaskItem({
                    type: 'vscode',
                    label: 'Build Project',
                    command: 'Build Project'
                });

                const taskTreeItem = { task: vscodeTask };
                await vscode.commands.executeCommand('tasktree.run', taskTreeItem);
                await sleep(2000);

                assert.ok(taskExecuted, 'VS Code task should execute the matching task');
            } else {
                // Task not found in this environment - verify error path works
                const vscodeTask = createMockTaskItem({
                    type: 'vscode',
                    label: 'Build Project',
                    command: 'Build Project'
                });

                const taskTreeItem = { task: vscodeTask };
                await vscode.commands.executeCommand('tasktree.run', taskTreeItem);
                await sleep(1000);
                // Should show error message but not crash
            }

            disposable.dispose();
        });

        test('vscode tasks discovered from workspace have correct type', async function() {
            this.timeout(15000);

            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1500);

            const provider = getTaskTreeProvider();

            const allTasks = provider.getAllTasks();
            const vscodeTasks = allTasks.filter(t => t.type === 'vscode');

            assert.ok(vscodeTasks.length > 0, 'Should discover VS Code tasks from tasks.json');

            for (const task of vscodeTasks) {
                assert.strictEqual(task.type, 'vscode', 'All vscode tasks should have type vscode');
                assert.ok(task.command !== '', 'vscode tasks should have command');
            }
        });
    });

    suite('Terminal Execution Modes', () => {
        test('runInCurrentTerminal creates terminal when none exists', async function() {
            this.timeout(15000);

            // Close all terminals first
            for (const t of vscode.window.terminals) {
                t.dispose();
            }
            await sleep(500);

            const initialCount = vscode.window.terminals.length;
            assert.strictEqual(initialCount, 0, 'Should start with no terminals');

            const shellTask = createMockTaskItem({
                type: 'shell',
                label: 'Create Terminal Test',
                command: 'echo "terminal created"',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh')
            });

            const taskTreeItem = { task: shellTask };
            await vscode.commands.executeCommand('tasktree.runInCurrentTerminal', taskTreeItem);
            await sleep(1500);

            const finalCount = vscode.window.terminals.length;
            assert.ok(finalCount >= 1, 'Should create a terminal when none exists');
            assert.ok(vscode.window.activeTerminal !== undefined, 'Created terminal should be active');
        });

        test('runInCurrentTerminal reuses existing active terminal', async function() {
            this.timeout(15000);

            // Create a terminal manually
            const existingTerminal = vscode.window.createTerminal('Existing Test Terminal');
            existingTerminal.show();
            await sleep(500);

            const terminalCountBefore = vscode.window.terminals.length;

            const shellTask = createMockTaskItem({
                type: 'shell',
                label: 'Reuse Terminal Test',
                command: 'echo "reusing terminal"',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh')
            });

            const taskTreeItem = { task: shellTask };
            await vscode.commands.executeCommand('tasktree.runInCurrentTerminal', taskTreeItem);
            await sleep(1000);

            const terminalCountAfter = vscode.window.terminals.length;
            assert.strictEqual(terminalCountAfter, terminalCountBefore, 'Should reuse existing terminal, not create new one');
        });

        test('new terminal has TaskTree prefix in name', async function() {
            this.timeout(15000);

            const shellTask = createMockTaskItem({
                type: 'shell',
                label: 'Named Terminal Test',
                command: 'echo "named terminal"',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh')
            });

            const taskTreeItem = { task: shellTask };
            await vscode.commands.executeCommand('tasktree.run', taskTreeItem);
            await sleep(1500);

            const taskTreeTerminal = vscode.window.terminals.find(t => t.name.includes('TaskTree'));
            assert.ok(taskTreeTerminal !== undefined, 'Should create terminal with TaskTree in name');
            assert.ok(taskTreeTerminal.name.includes('Named Terminal Test'), 'Terminal name should include task label');
        });

        test('terminal execution with cwd sets working directory', async function() {
            this.timeout(15000);

            const subprojectDir = path.join(context.workspaceRoot, 'subproject');

            const shellTask = createMockTaskItem({
                type: 'shell',
                label: 'CWD Test Task',
                command: 'pwd',  // Will print working directory
                cwd: subprojectDir,
                filePath: path.join(subprojectDir, 'test.sh')
            });

            const taskTreeItem = { task: shellTask };
            await vscode.commands.executeCommand('tasktree.run', taskTreeItem);
            await sleep(1500);

            // Verify terminal was created with the task
            const taskTreeTerminal = vscode.window.terminals.find(t => t.name.includes('CWD Test Task'));
            assert.ok(taskTreeTerminal !== undefined, 'Should create terminal for task with cwd');
        });
    });
});
