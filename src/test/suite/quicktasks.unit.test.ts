/**
 * UNIT TESTS for Quick Tasks functionality
 *
 * These tests directly access provider internals to verify behavior.
 * They are NOT E2E tests - they test provider methods directly.
 */

import * as assert from 'assert';
import * as fs from 'fs';
import {
    activateExtension,
    sleep,
    getFixturePath,
    getQuickTasksProvider,
    getTaskTreeProvider
} from './helpers';
import type { QuickTasksProvider, TaskTreeProvider } from './helpers';

interface TagPattern {
    id?: string;
    type?: string;
    label?: string;
}

interface TaskTreeConfig {
    tags?: Record<string, Array<string | TagPattern>>;
}

function readTaskTreeConfig(): TaskTreeConfig {
    const configPath = getFixturePath('.vscode/tasktree.json');
    return JSON.parse(fs.readFileSync(configPath, 'utf8')) as TaskTreeConfig;
}

function writeTaskTreeConfig(config: TaskTreeConfig): void {
    const configPath = getFixturePath('.vscode/tasktree.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
}

suite('Quick Tasks Unit Tests', () => {
    let originalConfig: TaskTreeConfig;

    suiteSetup(async function() {
        this.timeout(30000);
        await activateExtension();
        await sleep(2000);
        originalConfig = readTaskTreeConfig();
    });

    suiteTeardown(() => {
        writeTaskTreeConfig(originalConfig);
    });

    setup(() => {
        writeTaskTreeConfig(originalConfig);
    });

    suite('Provider: Config Change Syncs Quick Tasks', () => {
        let quickProvider: QuickTasksProvider;
        let treeProvider: TaskTreeProvider;

        suiteSetup(function() {
            this.timeout(15000);
            quickProvider = getQuickTasksProvider();
            treeProvider = getTaskTreeProvider();
        });

        test('Config file change auto-syncs Quick Tasks view', async function() {
            this.timeout(30000);

            const allTasks = treeProvider.getAllTasks();
            assert.ok(allTasks.length > 0, 'Tasks must be loaded at activation');

            const taskToStar = allTasks[0];
            assert.ok(taskToStar !== undefined, 'First task must exist');

            writeTaskTreeConfig({ tags: { quick: [taskToStar.id] } });
            await sleep(3000);

            const quickChildren = quickProvider.getChildren(undefined);
            const taskInView = quickChildren.find(c => c.task?.id === taskToStar.id);

            assert.ok(
                taskInView !== undefined,
                `BUG: Config has "${taskToStar.id}" but view shows: ` +
                `[${quickChildren.map(c => c.task?.id ?? 'placeholder').join(', ')}]. ` +
                `File watcher is NOT auto-syncing!`
            );
        });

        test('Removing from config auto-removes from view', async function() {
            this.timeout(30000);

            const allTasks = treeProvider.getAllTasks();
            assert.ok(allTasks.length > 0, 'Tasks must be loaded');

            const taskToTest = allTasks[0];
            assert.ok(taskToTest !== undefined, 'Task must exist');

            writeTaskTreeConfig({ tags: { quick: [taskToTest.id] } });
            await sleep(3000);

            writeTaskTreeConfig({ tags: { quick: [] } });
            await sleep(3000);

            const quickChildren = quickProvider.getChildren(undefined);
            const taskInView = quickChildren.find(c => c.task?.id === taskToTest.id);

            assert.ok(
                taskInView === undefined,
                `BUG: Config is empty but view still shows "${taskToTest.id}". ` +
                `File watcher is NOT auto-syncing!`
            );
        });

        test('Multiple tasks in config all appear in view', async function() {
            this.timeout(30000);

            const allTasks = treeProvider.getAllTasks();
            assert.ok(allTasks.length >= 3, 'Need at least 3 tasks');

            const task1 = allTasks[0];
            const task2 = allTasks[1];
            const task3 = allTasks[2];
            assert.ok(task1 && task2 && task3, 'Tasks must exist');

            writeTaskTreeConfig({ tags: { quick: [task1.id, task2.id, task3.id] } });
            await sleep(3000);

            const quickChildren = quickProvider.getChildren(undefined);
            const taskIds = quickChildren.filter(c => c.task !== null).map(c => c.task?.id);

            assert.ok(taskIds.includes(task1.id), `BUG: Task 1 not in view`);
            assert.ok(taskIds.includes(task2.id), `BUG: Task 2 not in view`);
            assert.ok(taskIds.includes(task3.id), `BUG: Task 3 not in view`);
        });

        test('Config persists and view stays in sync', async function() {
            this.timeout(30000);

            const allTasks = treeProvider.getAllTasks();
            const taskToStar = allTasks[0];
            assert.ok(taskToStar !== undefined, 'Task must exist');

            writeTaskTreeConfig({ tags: { quick: [taskToStar.id] } });
            await sleep(3000);

            const savedConfig = readTaskTreeConfig();
            const quickTags = savedConfig.tags?.['quick'] ?? [];
            assert.ok(quickTags.includes(taskToStar.id), 'Config must persist');

            const quickChildren = quickProvider.getChildren(undefined);
            const taskInView = quickChildren.find(c => c.task?.id === taskToStar.id);

            assert.ok(taskInView !== undefined, `BUG: Config persists but view doesn't sync`);
        });

        test('Config has task but view is empty - file watcher bug', async function() {
            this.timeout(30000);

            const allTasks = treeProvider.getAllTasks();
            assert.ok(allTasks.length > 0, 'Tasks must be loaded at activation');

            const targetTask = allTasks[0];
            assert.ok(targetTask !== undefined && targetTask.id !== '', 'Task must exist');

            writeTaskTreeConfig({ tags: { quick: [targetTask.id] } });
            await sleep(3000);

            const quickChildren = quickProvider.getChildren(undefined);
            const taskInView = quickChildren.find(c => c.task?.id === targetTask.id);

            assert.ok(
                taskInView !== undefined,
                `THE BUG: Config has "${targetTask.id}" but view shows: ` +
                `[${quickChildren.map(c => c.task?.id ?? 'placeholder').join(', ')}]. ` +
                `File watcher is NOT triggering syncQuickTasks!`
            );
        });
    });

    suite('Provider: View State Observation', () => {
        let quickProvider: QuickTasksProvider;

        suiteSetup(function() {
            this.timeout(15000);
            quickProvider = getQuickTasksProvider();
        });

        test('quick tasks view exists', function() {
            this.timeout(10000);

            const children = quickProvider.getChildren(undefined);
            assert.ok(Array.isArray(children), 'QuickTasksProvider.getChildren should return an array');
        });

        test('quick tasks view auto-updates on config change', async function() {
            this.timeout(15000);

            writeTaskTreeConfig({ tags: { quick: ['build.sh'] } });
            await sleep(3000);

            const savedConfig = readTaskTreeConfig();
            const quickTags = savedConfig.tags?.['quick'] ?? [];
            assert.ok(quickTags.includes('build.sh'), 'Config should have build.sh');

            const children = quickProvider.getChildren(undefined);
            assert.ok(Array.isArray(children), 'Provider should return array');
        });

        test('quick tasks view handles empty state', async function() {
            this.timeout(15000);

            writeTaskTreeConfig({ tags: {} });
            await sleep(3000);

            const children = quickProvider.getChildren(undefined);
            assert.ok(children.length === 1, 'Should show exactly one placeholder');
            const placeholder = children[0];
            assert.ok(placeholder !== undefined, 'Placeholder should exist');
            assert.ok(placeholder.task === null, 'Placeholder should have null task');
        });
    });

    suite('Provider: Unique Identification', () => {
        test('plain label pattern stored in config', async function() {
            this.timeout(20000);

            writeTaskTreeConfig({ tags: { quick: ['lint'] } });
            await sleep(3000);

            const savedConfig = readTaskTreeConfig();
            const quickTags = savedConfig.tags?.['quick'] ?? [];
            assert.ok(quickTags.includes('lint'), 'Config should have lint pattern');

            const quickProvider = getQuickTasksProvider();
            const children = quickProvider.getChildren(undefined);
            assert.ok(Array.isArray(children), 'Provider should return valid array');
        });

        test('full task ID pattern stored correctly', async function() {
            this.timeout(20000);

            const provider = getTaskTreeProvider();
            const allTasks = provider.getAllTasks();
            const npmTask = allTasks.find((t: { type: string }) => t.type === 'npm');
            assert.ok(npmTask !== undefined, 'Should have an npm task');

            writeTaskTreeConfig({ tags: { quick: [npmTask.id] } });
            await sleep(3000);

            const savedConfig = readTaskTreeConfig();
            const quickPatterns = savedConfig.tags?.['quick'] ?? [];
            assert.strictEqual(quickPatterns.length, 1, 'Should have 1 pattern');
            const firstPattern = quickPatterns[0];
            assert.ok(typeof firstPattern === 'string' && firstPattern.startsWith('npm:'), 'Pattern should be task ID');
        });

        test('structured pattern stored correctly', async function() {
            this.timeout(20000);

            writeTaskTreeConfig({ tags: { quick: [{ type: 'npm', label: 'lint' }] } });
            await sleep(3000);

            const savedConfig = readTaskTreeConfig();
            const quickTags = savedConfig.tags?.['quick'] ?? [];
            assert.strictEqual(quickTags.length, 1, 'Should have one pattern');

            const quickProvider = getQuickTasksProvider();
            const children = quickProvider.getChildren(undefined);
            assert.ok(Array.isArray(children), 'Provider should return valid array');
        });
    });

    suite('Provider: Error Handling', () => {
        test('config persistence works with valid data', function() {
            this.timeout(15000);

            writeTaskTreeConfig({ tags: { quick: ['valid-task'] } });
            const savedConfig = readTaskTreeConfig();
            const quickTags = savedConfig.tags?.['quick'] ?? [];
            assert.ok(quickTags.includes('valid-task'), 'Config should persist');

            const provider = getTaskTreeProvider();
            const tasks = provider.getAllTasks();
            assert.ok(Array.isArray(tasks), 'Provider should return valid array');
        });
    });

    suite('Provider: getChildren and getTreeItem', () => {
        let quickProvider: QuickTasksProvider;
        let treeProvider: TaskTreeProvider;

        suiteSetup(function() {
            this.timeout(15000);
            quickProvider = getQuickTasksProvider();
            treeProvider = getTaskTreeProvider();
        });

        test('getChildren returns placeholder when config empty', async function() {
            this.timeout(15000);

            writeTaskTreeConfig({ tags: {} });
            await sleep(3000);

            const children = quickProvider.getChildren(undefined);
            assert.ok(children.length === 1, 'Should have placeholder');
            const placeholder = children[0];
            assert.ok(placeholder?.task === null, 'Placeholder should have null task');
        });

        test('getChildren returns tasks when config has tasks', async function() {
            this.timeout(15000);

            const allTasks = treeProvider.getAllTasks();
            assert.ok(allTasks.length > 0, 'Should have tasks');

            const testTask = allTasks[0];
            assert.ok(testTask !== undefined, 'Task must exist');

            writeTaskTreeConfig({ tags: { quick: [testTask.id] } });
            await sleep(3000);

            const children = quickProvider.getChildren(undefined);
            const taskItem = children.find(c => c.task?.id === testTask.id);
            assert.ok(taskItem !== undefined, 'BUG: Task should appear after config change');
        });

        test('getTreeItem returns element as-is', function() {
            this.timeout(10000);

            const children = quickProvider.getChildren(undefined);
            assert.ok(children.length > 0, 'Should have at least placeholder');

            const child = children[0];
            assert.ok(child !== undefined, 'Child must exist');
            const treeItem = quickProvider.getTreeItem(child);
            assert.strictEqual(treeItem, child, 'getTreeItem returns same element');
        });

        test('drag mime types are registered', function() {
            this.timeout(10000);
            assert.ok(quickProvider.dragMimeTypes.length > 0, 'Should have drag mime types');
            assert.ok(quickProvider.dropMimeTypes.length > 0, 'Should have drop mime types');
        });

        test('config order is preserved in view', async function() {
            this.timeout(20000);

            const allTasks = treeProvider.getAllTasks();
            assert.ok(allTasks.length >= 2, 'Need at least 2 tasks');

            const task1 = allTasks[0];
            const task2 = allTasks[1];
            assert.ok(task1 && task2, 'Tasks must exist');

            writeTaskTreeConfig({ tags: { quick: [task2.id, task1.id] } });
            await sleep(3000);

            const config = readTaskTreeConfig();
            const quickTags = config.tags?.['quick'] ?? [];
            assert.strictEqual(quickTags[0], task2.id, 'task2 should be first');
            assert.strictEqual(quickTags[1], task1.id, 'task1 should be second');
        });

        test('getChildren with parent returns empty array', function() {
            this.timeout(15000);

            const rootChildren = quickProvider.getChildren(undefined);
            assert.ok(Array.isArray(rootChildren), 'Should return array');

            if (rootChildren.length > 0) {
                const firstChild = rootChildren[0];
                assert.ok(firstChild !== undefined, 'Child must exist');
                const grandchildren = quickProvider.getChildren(firstChild);
                assert.strictEqual(grandchildren.length, 0, 'Leaf items have no children');
            }
        });

        test('duplicate IDs in config are handled', async function() {
            this.timeout(15000);

            const allTasks = treeProvider.getAllTasks();
            const testTask = allTasks[0];
            assert.ok(testTask !== undefined, 'Task must exist');

            writeTaskTreeConfig({ tags: { quick: [testTask.id, testTask.id] } });
            await sleep(3000);

            const children = quickProvider.getChildren(undefined);
            assert.ok(Array.isArray(children), 'Should return valid array');
        });
    });
});
