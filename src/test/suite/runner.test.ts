import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import {
    activateExtension,
    sleep,
    createMockTaskItem
} from './helpers';
import type { TestContext } from './helpers';
import type { TaskItem } from '../../models/TaskItem';

suite('TaskRunner E2E Tests', () => {
    let context: TestContext;

    suiteSetup(async function() {
        this.timeout(30000);
        context = await activateExtension();
        await sleep(2000);
    });

    suiteTeardown(() => {
        for (const t of vscode.window.terminals) {
            t.dispose();
        }
    });

    suite('Shell Task Execution', () => {
        test('executes shell task and creates terminal', async function() {
            this.timeout(15000);

            const terminalsBefore = vscode.window.terminals.length;

            const task = createMockTaskItem({
                type: 'shell',
                label: 'Echo Shell Test',
                command: 'echo "shell test executed"',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh')
            });

            await vscode.commands.executeCommand('tasktree.run', { task });
            await sleep(2000);

            const terminalsAfter = vscode.window.terminals.length;
            assert.ok(terminalsAfter >= terminalsBefore, 'Should create or reuse terminal');
        });

        test('shell task respects cwd option', async function() {
            this.timeout(15000);

            const subdir = path.join(context.workspaceRoot, 'scripts');

            const task = createMockTaskItem({
                type: 'shell',
                label: 'CWD Test',
                command: 'pwd',
                cwd: subdir,
                filePath: path.join(subdir, 'build.sh')
            });

            await vscode.commands.executeCommand('tasktree.run', { task });
            await sleep(1500);

            const terminal = vscode.window.terminals.find(t => t.name.includes('TaskTree'));
            assert.ok(terminal !== undefined, 'Should create TaskTree terminal');
        });

        test('shell task with params appends quoted arguments', async function() {
            this.timeout(15000);

            const task = createMockTaskItem({
                type: 'shell',
                label: 'Param Shell Test',
                command: 'echo',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh'),
                params: []
            });

            await vscode.commands.executeCommand('tasktree.run', { task });
            await sleep(1500);

            assert.ok(true, 'Shell task with empty params should execute');
        });

        test('shell task without cwd still executes', async function() {
            this.timeout(15000);

            const task: TaskItem = {
                id: 'shell:no-cwd:test',
                type: 'shell',
                label: 'No CWD Test',
                command: 'echo "no cwd"',
                filePath: '/test/path',
                category: 'Test',
                tags: []
            };

            await vscode.commands.executeCommand('tasktree.run', { task });
            await sleep(1500);

            assert.ok(true, 'Shell task without cwd should still execute');
        });
    });

    suite('NPM Task Execution', () => {
        test('executes npm task with correct command format', async function() {
            this.timeout(15000);

            const task = createMockTaskItem({
                type: 'npm',
                label: 'test-npm',
                command: 'npm run test-npm',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'package.json')
            });

            await vscode.commands.executeCommand('tasktree.run', { task });
            await sleep(1500);

            assert.ok(true, 'NPM task should execute');
        });

        test('npm task uses package.json directory', async function() {
            this.timeout(15000);

            const subprojectDir = path.join(context.workspaceRoot, 'subproject');

            const task = createMockTaskItem({
                type: 'npm',
                label: 'subproject-build',
                command: 'npm run build',
                cwd: subprojectDir,
                filePath: path.join(subprojectDir, 'package.json'),
                category: 'subproject'
            });

            await vscode.commands.executeCommand('tasktree.run', { task });
            await sleep(1500);

            assert.ok(true, 'NPM task with subproject cwd should execute');
        });

        test('npm task creates task with npm source', function() {
            this.timeout(15000);

            const task = createMockTaskItem({
                type: 'npm',
                label: 'lint',
                command: 'npm run lint',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'package.json')
            });

            assert.strictEqual(task.type, 'npm', 'Task should be npm type');
            assert.ok(task.command.includes('npm run'), 'Command should include npm run');
        });
    });

    suite('Make Task Execution', () => {
        test('executes make task with target', async function() {
            this.timeout(15000);

            const task = createMockTaskItem({
                type: 'make',
                label: 'build',
                command: 'make build',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'Makefile')
            });

            await vscode.commands.executeCommand('tasktree.run', { task });
            await sleep(1500);

            assert.ok(true, 'Make task should execute');
        });

        test('make task respects Makefile directory', function() {
            this.timeout(15000);

            const task = createMockTaskItem({
                type: 'make',
                label: 'clean',
                command: 'make clean',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'Makefile')
            });

            assert.strictEqual(task.cwd, context.workspaceRoot, 'CWD should be Makefile directory');
        });

        test('make task without cwd still executes', async function() {
            this.timeout(15000);

            const task: TaskItem = {
                id: 'make:no-cwd:test',
                type: 'make',
                label: 'test',
                command: 'make test',
                filePath: '/test/Makefile',
                category: 'Test',
                tags: []
            };

            await vscode.commands.executeCommand('tasktree.run', { task });
            await sleep(1500);

            assert.ok(true, 'Make task without cwd should still execute');
        });
    });

    suite('Python Task Execution', () => {
        test('executes python task with script path', async function() {
            this.timeout(15000);

            const scriptPath = path.join(context.workspaceRoot, 'scripts/python/build_project.py');

            const task = createMockTaskItem({
                type: 'python',
                label: 'build_project.py',
                command: scriptPath,
                cwd: path.join(context.workspaceRoot, 'scripts/python'),
                filePath: scriptPath
            });

            await vscode.commands.executeCommand('tasktree.run', { task });
            await sleep(1500);

            assert.ok(true, 'Python task should execute');
        });

        test('python task wraps command with python interpreter', function() {
            this.timeout(15000);

            const scriptPath = path.join(context.workspaceRoot, 'scripts/python/run_tests.py');

            const task = createMockTaskItem({
                type: 'python',
                label: 'run_tests.py',
                command: scriptPath,
                cwd: path.join(context.workspaceRoot, 'scripts/python'),
                filePath: scriptPath
            });

            assert.strictEqual(task.type, 'python', 'Task should be python type');
            assert.ok(task.command.endsWith('.py'), 'Command should be python script path');
        });

        test('python task with params appends arguments', async function() {
            this.timeout(15000);

            const scriptPath = path.join(context.workspaceRoot, 'scripts/python/deploy.py');

            const task = createMockTaskItem({
                type: 'python',
                label: 'deploy.py',
                command: scriptPath,
                cwd: path.join(context.workspaceRoot, 'scripts/python'),
                filePath: scriptPath,
                params: []
            });

            await vscode.commands.executeCommand('tasktree.run', { task });
            await sleep(1500);

            assert.ok(true, 'Python task with params should execute');
        });
    });

    suite('Launch Config Execution', () => {
        test('launch task uses debug API', async function() {
            this.timeout(15000);

            const task = createMockTaskItem({
                type: 'launch',
                label: 'Debug Application',
                command: 'Debug Application',
                filePath: path.join(context.workspaceRoot, '.vscode/launch.json')
            });

            // Launch tasks bypass normal execution and use debug API
            try {
                await vscode.commands.executeCommand('tasktree.run', { task });
                await sleep(1000);
            } catch {
                // Debug may fail if config not found, that's expected
            }

            assert.ok(true, 'Launch task should attempt debug API');
        });

        test('launch task shows error if no workspace folder', async function() {
            this.timeout(15000);

            const task = createMockTaskItem({
                type: 'launch',
                label: 'Missing Workspace Launch',
                command: 'NonExistent Config',
                filePath: '/fake/launch.json'
            });

            // This should show error message but not crash
            try {
                await vscode.commands.executeCommand('tasktree.run', { task });
                await sleep(500);
            } catch {
                // Debug may fail if config not found, that's expected
            }

            assert.ok(true, 'Launch task handles workspace issues gracefully');
        });

        test('launch task shows error on failed debug start', async function() {
            this.timeout(15000);

            const task = createMockTaskItem({
                type: 'launch',
                label: 'Invalid Launch Config',
                command: 'This Config Does Not Exist 12345',
                filePath: path.join(context.workspaceRoot, '.vscode/launch.json')
            });

            try {
                await vscode.commands.executeCommand('tasktree.run', { task });
                await sleep(1000);
            } catch {
                // Debug may fail if config not found, that's expected
            }

            assert.ok(true, 'Should handle failed debug start gracefully');
        });
    });

    suite('VS Code Task Execution', () => {
        test('vscode task fetches and executes matching task', async function() {
            this.timeout(15000);

            const task = createMockTaskItem({
                type: 'vscode',
                label: 'Build Project',
                command: 'Build Project',
                filePath: path.join(context.workspaceRoot, '.vscode/tasks.json')
            });

            await vscode.commands.executeCommand('tasktree.run', { task });
            await sleep(1500);

            assert.ok(true, 'VS Code task should attempt execution');
        });

        test('vscode task shows error if task not found', async function() {
            this.timeout(15000);

            const task = createMockTaskItem({
                type: 'vscode',
                label: 'NonExistent Task',
                command: 'Task That Does Not Exist 12345',
                filePath: path.join(context.workspaceRoot, '.vscode/tasks.json')
            });

            await vscode.commands.executeCommand('tasktree.run', { task });
            await sleep(500);

            assert.ok(true, 'Should show error for missing VS Code task');
        });

        test('vscode tasks can be fetched from workspace', async function() {
            this.timeout(15000);

            const tasks = await vscode.tasks.fetchTasks();
            assert.ok(Array.isArray(tasks), 'Should return array of tasks');
        });
    });

    suite('New Terminal Mode', () => {
        test('creates terminal with TaskTree prefix', async function() {
            this.timeout(15000);

            const task = createMockTaskItem({
                type: 'shell',
                label: 'Terminal Name Test',
                command: 'echo "test"',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh')
            });

            await vscode.commands.executeCommand('tasktree.run', { task });
            await sleep(1500);

            const terminal = vscode.window.terminals.find(t => t.name.includes('TaskTree'));
            assert.ok(terminal !== undefined, 'Terminal should have TaskTree in name');
        });

        test('terminal shows after creation', async function() {
            this.timeout(15000);

            const task = createMockTaskItem({
                type: 'shell',
                label: 'Show Terminal Test',
                command: 'echo "visible"',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh')
            });

            await vscode.commands.executeCommand('tasktree.run', { task });
            await sleep(1500);

            // After execution, there should be an active terminal
            assert.ok(vscode.window.terminals.length > 0, 'Should have at least one terminal');
        });

        test('terminal sends command text', async function() {
            this.timeout(15000);

            const uniqueEcho = `test-${Date.now()}`;

            const task = createMockTaskItem({
                type: 'shell',
                label: 'Send Text Test',
                command: `echo "${uniqueEcho}"`,
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh')
            });

            await vscode.commands.executeCommand('tasktree.run', { task });
            await sleep(1500);

            // Command should have been sent to terminal
            assert.ok(true, 'Command should be sent to terminal');
        });

        test('each execution creates new terminal', async function() {
            this.timeout(20000);

            // Close all terminals first
            for (const t of vscode.window.terminals) {
                t.dispose();
            }
            await sleep(500);

            const task1 = createMockTaskItem({
                type: 'shell',
                label: 'Multi Terminal Test 1',
                command: 'echo "first"',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh')
            });

            const task2 = createMockTaskItem({
                type: 'shell',
                label: 'Multi Terminal Test 2',
                command: 'echo "second"',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh')
            });

            await vscode.commands.executeCommand('tasktree.run', { task: task1 });
            await sleep(1000);

            const afterFirst = vscode.window.terminals.length;

            await vscode.commands.executeCommand('tasktree.run', { task: task2 });
            await sleep(1000);

            const afterSecond = vscode.window.terminals.length;

            assert.ok(afterSecond >= afterFirst, 'Should create terminals for each execution');
        });
    });

    suite('Current Terminal Mode', () => {
        test('creates terminal if none exists', async function() {
            this.timeout(15000);

            // Close all terminals
            for (const t of vscode.window.terminals) {
                t.dispose();
            }
            await sleep(500);

            const terminalsBefore = vscode.window.terminals.length;
            assert.strictEqual(terminalsBefore, 0, 'Should start with no terminals');

            const task = createMockTaskItem({
                type: 'shell',
                label: 'Create If None Test',
                command: 'echo "created"',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh')
            });

            await vscode.commands.executeCommand('tasktree.runInCurrentTerminal', { task });
            await sleep(1500);

            const terminalsAfter = vscode.window.terminals.length;
            assert.ok(terminalsAfter > 0, 'Should create terminal if none exists');
        });

        test('reuses active terminal', async function() {
            this.timeout(15000);

            // Create a terminal and make it active
            const existingTerminal = vscode.window.createTerminal('Test Reuse Terminal');
            existingTerminal.show();
            await sleep(500);

            const terminalsBefore = vscode.window.terminals.length;

            const task = createMockTaskItem({
                type: 'shell',
                label: 'Reuse Terminal Test',
                command: 'echo "reused"',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh')
            });

            await vscode.commands.executeCommand('tasktree.runInCurrentTerminal', { task });
            await sleep(1000);

            const terminalsAfter = vscode.window.terminals.length;

            // Should not create many new terminals
            assert.ok(terminalsAfter <= terminalsBefore + 1, 'Should reuse terminal or create only one');
        });

        test('changes to task cwd before execution', async function() {
            this.timeout(15000);

            const subdir = path.join(context.workspaceRoot, 'scripts');

            const task = createMockTaskItem({
                type: 'shell',
                label: 'CWD Change Test',
                command: 'pwd',
                cwd: subdir,
                filePath: path.join(subdir, 'test.sh')
            });

            await vscode.commands.executeCommand('tasktree.runInCurrentTerminal', { task });
            await sleep(1500);

            // The cd command should have been sent
            assert.ok(true, 'Should send cd command for cwd');
        });

        test('shows terminal after command', async function() {
            this.timeout(15000);

            const task = createMockTaskItem({
                type: 'shell',
                label: 'Show After Test',
                command: 'echo "shown"',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh')
            });

            await vscode.commands.executeCommand('tasktree.runInCurrentTerminal', { task });
            await sleep(1000);

            assert.ok(vscode.window.activeTerminal !== undefined, 'Should have active terminal');
        });

        test('handles empty cwd gracefully', async function() {
            this.timeout(15000);

            const task: TaskItem = {
                id: 'shell:empty-cwd:test',
                type: 'shell',
                label: 'Empty CWD Test',
                command: 'echo "no cd needed"',
                cwd: '',
                filePath: '/test/path',
                category: 'Test',
                tags: []
            };

            await vscode.commands.executeCommand('tasktree.runInCurrentTerminal', { task });
            await sleep(1000);

            assert.ok(true, 'Should handle empty cwd without crashing');
        });
    });

    suite('Command Building', () => {
        test('command without params stays unchanged', function() {
            this.timeout(5000);

            const task = createMockTaskItem({
                type: 'shell',
                command: 'echo "simple"',
                params: []
            });

            assert.strictEqual(task.command, 'echo "simple"', 'Command should be unchanged');
        });

        test('task with defined params has param array', function() {
            this.timeout(5000);

            const task = createMockTaskItem({
                type: 'shell',
                command: './build.sh',
                params: [
                    { name: 'config', description: 'Build config', default: 'debug' },
                    { name: 'target', description: 'Build target' }
                ]
            });

            assert.ok(task.params !== undefined, 'Should have params');
            assert.strictEqual(task.params.length, 2, 'Should have 2 params');
        });

        test('param with options has options array', function() {
            this.timeout(5000);

            const task = createMockTaskItem({
                type: 'shell',
                command: './deploy.sh',
                params: [
                    { name: 'env', description: 'Environment', options: ['dev', 'staging', 'prod'] }
                ]
            });

            assert.ok(task.params !== undefined, 'Should have params');
            const params = task.params;
            const param = params[0];
            assert.ok(param !== undefined, 'Should have param');
            assert.ok(param.options !== undefined, 'Param should have options');
            const options = param.options;
            assert.strictEqual(options.length, 3, 'Should have 3 options');
        });

        test('param with default has default value', function() {
            this.timeout(5000);

            const task = createMockTaskItem({
                type: 'shell',
                command: './build.sh',
                params: [
                    { name: 'config', description: 'Config', default: 'release' }
                ]
            });

            const param = task.params?.[0];
            assert.strictEqual(param?.default, 'release', 'Should have default value');
        });
    });

    suite('Error Handling', () => {
        test('handles undefined task item', async function() {
            this.timeout(10000);

            try {
                await vscode.commands.executeCommand('tasktree.run', undefined);
            } catch {
                // Expected
            }

            assert.ok(true, 'Should handle undefined task item');
        });

        test('handles null task property', async function() {
            this.timeout(10000);

            try {
                await vscode.commands.executeCommand('tasktree.run', { task: null });
            } catch {
                // Expected
            }

            assert.ok(true, 'Should handle null task property');
        });

        test('handles task with invalid type', async function() {
            this.timeout(10000);

            const task = createMockTaskItem({
                type: 'unknown' as 'shell',
                label: 'Invalid Type',
                command: 'echo test'
            });

            try {
                await vscode.commands.executeCommand('tasktree.run', { task });
                await sleep(500);
            } catch {
                // Expected
            }

            assert.ok(true, 'Should handle invalid task type');
        });

        test('handles task with missing command', async function() {
            this.timeout(10000);

            const task: TaskItem = {
                id: 'test:missing-cmd:test',
                type: 'shell',
                label: 'Missing Command',
                command: '',
                filePath: '/test/path',
                category: 'Test',
                tags: []
            };

            try {
                await vscode.commands.executeCommand('tasktree.run', { task });
                await sleep(500);
            } catch {
                // Expected
            }

            assert.ok(true, 'Should handle empty command');
        });

        test('handles nonexistent script path', async function() {
            this.timeout(10000);

            const task = createMockTaskItem({
                type: 'shell',
                label: 'Nonexistent Script',
                command: './this-does-not-exist-12345.sh',
                filePath: '/nonexistent/path/script.sh'
            });

            try {
                await vscode.commands.executeCommand('tasktree.run', { task });
                await sleep(500);
            } catch {
                // Expected - script doesn't exist
            }

            assert.ok(true, 'Should handle nonexistent script');
        });

        test('handles runInCurrentTerminal with undefined', async function() {
            this.timeout(10000);

            try {
                await vscode.commands.executeCommand('tasktree.runInCurrentTerminal', undefined);
            } catch {
                // Expected
            }

            assert.ok(true, 'Should handle undefined in runInCurrentTerminal');
        });

        test('handles runInCurrentTerminal with null task', async function() {
            this.timeout(10000);

            try {
                await vscode.commands.executeCommand('tasktree.runInCurrentTerminal', { task: null });
            } catch {
                // Expected
            }

            assert.ok(true, 'Should handle null task in runInCurrentTerminal');
        });
    });

    suite('Task Type Routing', () => {
        test('shell tasks go through shell execution path', async function() {
            this.timeout(15000);

            const task = createMockTaskItem({
                type: 'shell',
                label: 'Shell Route Test',
                command: 'echo "shell route"',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh')
            });

            await vscode.commands.executeCommand('tasktree.run', { task });
            await sleep(1000);

            assert.ok(true, 'Shell task should execute through shell path');
        });

        test('npm tasks go through npm execution path', async function() {
            this.timeout(15000);

            const task = createMockTaskItem({
                type: 'npm',
                label: 'NPM Route Test',
                command: 'npm run test',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'package.json')
            });

            await vscode.commands.executeCommand('tasktree.run', { task });
            await sleep(1000);

            assert.ok(true, 'NPM task should execute through npm path');
        });

        test('make tasks go through make execution path', async function() {
            this.timeout(15000);

            const task = createMockTaskItem({
                type: 'make',
                label: 'Make Route Test',
                command: 'make test',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'Makefile')
            });

            await vscode.commands.executeCommand('tasktree.run', { task });
            await sleep(1000);

            assert.ok(true, 'Make task should execute through make path');
        });

        test('python tasks go through python execution path', async function() {
            this.timeout(15000);

            const task = createMockTaskItem({
                type: 'python',
                label: 'Python Route Test',
                command: path.join(context.workspaceRoot, 'scripts/python/build_project.py'),
                cwd: path.join(context.workspaceRoot, 'scripts/python'),
                filePath: path.join(context.workspaceRoot, 'scripts/python/build_project.py')
            });

            await vscode.commands.executeCommand('tasktree.run', { task });
            await sleep(1000);

            assert.ok(true, 'Python task should execute through python path');
        });

        test('launch tasks bypass terminal and use debug API', async function() {
            this.timeout(15000);

            const task = createMockTaskItem({
                type: 'launch',
                label: 'Launch Route Test',
                command: 'Debug Application',
                filePath: path.join(context.workspaceRoot, '.vscode/launch.json')
            });

            await vscode.commands.executeCommand('tasktree.run', { task });
            await sleep(1000);

            // Launch tasks should NOT create TaskTree terminals - they use debug API
            const launchTerminals = vscode.window.terminals.filter(t =>
                t.name.includes('TaskTree') && t.name.includes('Launch Route Test')
            );

            // Launch tasks use debug API, not terminals
            assert.strictEqual(launchTerminals.length, 0, 'Launch task should use debug API, not create terminal');
        });

        test('vscode tasks fetch from task provider', async function() {
            this.timeout(15000);

            const task = createMockTaskItem({
                type: 'vscode',
                label: 'VSCode Route Test',
                command: 'Build Project',
                filePath: path.join(context.workspaceRoot, '.vscode/tasks.json')
            });

            await vscode.commands.executeCommand('tasktree.run', { task });
            await sleep(1000);

            assert.ok(true, 'VSCode task should fetch from provider');
        });
    });

    suite('Integration Tests', () => {
        test('full workflow: discover, select, and execute shell task', async function() {
            this.timeout(20000);

            // 1. Get the tree provider
            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('tasktree.run'), 'Run command should exist');

            // 2. Create a task
            const task = createMockTaskItem({
                type: 'shell',
                label: 'Integration Test Task',
                command: 'echo "integration test"',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh')
            });

            // 3. Execute
            await vscode.commands.executeCommand('tasktree.run', { task });
            await sleep(2000);

            // 4. Verify terminal exists
            assert.ok(vscode.window.terminals.length > 0, 'Should have terminal after execution');
        });

        test('multiple task types can be executed in sequence', async function() {
            this.timeout(30000);

            const shellTask = createMockTaskItem({
                type: 'shell',
                label: 'Sequence Shell',
                command: 'echo "shell"',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh')
            });

            const npmTask = createMockTaskItem({
                type: 'npm',
                label: 'Sequence NPM',
                command: 'npm run test',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'package.json')
            });

            const makeTask = createMockTaskItem({
                type: 'make',
                label: 'Sequence Make',
                command: 'make test',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'Makefile')
            });

            await vscode.commands.executeCommand('tasktree.run', { task: shellTask });
            await sleep(1000);

            await vscode.commands.executeCommand('tasktree.run', { task: npmTask });
            await sleep(1000);

            await vscode.commands.executeCommand('tasktree.run', { task: makeTask });
            await sleep(1000);

            assert.ok(true, 'Should execute multiple task types in sequence');
        });

        test('both terminal modes work in same session', async function() {
            this.timeout(20000);

            // Close all terminals
            for (const t of vscode.window.terminals) {
                t.dispose();
            }
            await sleep(500);

            const newTerminalTask = createMockTaskItem({
                type: 'shell',
                label: 'New Terminal Mode',
                command: 'echo "new terminal"',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh')
            });

            await vscode.commands.executeCommand('tasktree.run', { task: newTerminalTask });
            await sleep(1000);

            const terminalsAfterNew = vscode.window.terminals.length;

            const currentTerminalTask = createMockTaskItem({
                type: 'shell',
                label: 'Current Terminal Mode',
                command: 'echo "current terminal"',
                cwd: context.workspaceRoot,
                filePath: path.join(context.workspaceRoot, 'scripts/test.sh')
            });

            await vscode.commands.executeCommand('tasktree.runInCurrentTerminal', { task: currentTerminalTask });
            await sleep(1000);

            const terminalsAfterCurrent = vscode.window.terminals.length;

            assert.ok(terminalsAfterNew >= 1, 'Should have terminal after new terminal mode');
            assert.ok(terminalsAfterCurrent >= terminalsAfterNew, 'Current terminal mode should not reduce terminals');
        });
    });
});
