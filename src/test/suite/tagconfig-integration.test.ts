/**
 * INTEGRATION TESTS: Tag Config -> Task Tagging -> View Display
 *
 * These tests verify the FULL FLOW from config file to actual view state.
 * They catch bugs where:
 * - Config loads but tags don't apply
 * - Tags apply but filtering doesn't work
 * - Quick tasks config exists but tasks don't show
 */
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import {
    activateExtension,
    sleep,
    getFixturePath,
    getTaskTreeProvider,
    getQuickTasksProvider,
    TaskTreeItem
} from './helpers';
import type { TaskTreeProvider, QuickTasksProvider } from './helpers';

interface TagPattern {
    id?: string;
    type?: string;
    label?: string;
}

interface TaskTreeConfig {
    tags?: Record<string, Array<string | TagPattern>>;
}

function writeConfig(config: TaskTreeConfig): void {
    const configPath = getFixturePath('.vscode/tasktree.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
}

/**
 * Recursively collects all tasks from tree view.
 */
async function collectTasksFromTree(
    provider: TaskTreeProvider,
    element?: TaskTreeItem
): Promise<Array<{ id: string; label: string; type: string; tags: readonly string[] }>> {
    const children = await provider.getChildren(element);
    const tasks: Array<{ id: string; label: string; type: string; tags: readonly string[] }> = [];

    for (const child of children) {
        if (child.task !== null) {
            tasks.push({
                id: child.task.id,
                label: child.task.label,
                type: child.task.type,
                tags: child.task.tags
            });
        }
        if (child.children.length > 0) {
            const childTasks = await collectTasksFromTree(provider, child);
            tasks.push(...childTasks);
        }
    }

    return tasks;
}

suite('Tag Config Integration Tests', () => {
    let originalConfig: string;
    let treeProvider: TaskTreeProvider;
    let quickProvider: QuickTasksProvider;

    suiteSetup(async function () {
        this.timeout(30000);
        await activateExtension();
        treeProvider = getTaskTreeProvider();
        quickProvider = getQuickTasksProvider();
        originalConfig = fs.readFileSync(getFixturePath('.vscode/tasktree.json'), 'utf8');
        await sleep(2000);
    });

    suiteTeardown(async function () {
        this.timeout(10000);
        fs.writeFileSync(getFixturePath('.vscode/tasktree.json'), originalConfig);
        treeProvider.clearFilters();
        await vscode.commands.executeCommand('tasktree.refresh');
        await sleep(500);
    });

    setup(async function () {
        this.timeout(10000);
        treeProvider.clearFilters();
        await sleep(100);
    });

    /**
     * INTEGRATION: Config Loading -> Tag Application
     */
    suite('Config Loading -> Tag Application', () => {
        test('INTEGRATION: Structured {type} pattern applies tag to ALL tasks of that type', async function () {
            this.timeout(30000);

            // SETUP: Write config with type pattern
            const config: TaskTreeConfig = {
                tags: {
                    'test-type-tag': [{ type: 'npm' }]
                }
            };
            writeConfig(config);

            // REFRESH: Force reload of config and tasks
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(2000);

            // VERIFY: Get ALL tasks and check tag application
            const allTasks = treeProvider.getAllTasks();
            const npmTasks = allTasks.filter(t => t.type === 'npm');
            const taggedTasks = allTasks.filter(t => t.tags.includes('test-type-tag'));

            // ASSERTIONS: Must have npm tasks
            assert.ok(npmTasks.length > 0, 'Fixture MUST have npm tasks');

            // CRITICAL: Every npm task MUST have the tag
            for (const task of npmTasks) {
                assert.ok(
                    task.tags.includes('test-type-tag'),
                    `INTEGRATION FAILED: npm task "${task.label}" (ID: ${task.id}) ` +
                    `does NOT have tag "test-type-tag" even though config has { type: 'npm' } pattern! ` +
                    `Task tags: [${task.tags.join(', ')}]`
                );
            }

            // CRITICAL: ONLY npm tasks should have the tag
            for (const task of taggedTasks) {
                assert.strictEqual(
                    task.type,
                    'npm',
                    `INTEGRATION FAILED: Task "${task.label}" has tag "test-type-tag" but ` +
                    `is type "${task.type}", not "npm"!`
                );
            }

            // Count check
            assert.strictEqual(
                taggedTasks.length,
                npmTasks.length,
                `Tag was applied to ${taggedTasks.length} tasks but there are ${npmTasks.length} npm tasks`
            );
        });

        test('INTEGRATION: Structured {type, label} pattern applies tag to SPECIFIC tasks', async function () {
            this.timeout(30000);

            // SETUP: Write config with type+label pattern
            const config: TaskTreeConfig = {
                tags: {
                    'specific-tag': [{ type: 'npm', label: 'build' }]
                }
            };
            writeConfig(config);

            // REFRESH
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(2000);

            // VERIFY
            const allTasks = treeProvider.getAllTasks();
            const expectedTasks = allTasks.filter(t => t.type === 'npm' && t.label === 'build');
            const taggedTasks = allTasks.filter(t => t.tags.includes('specific-tag'));

            assert.ok(expectedTasks.length > 0, 'Fixture MUST have npm:build task');

            // CRITICAL: Only npm tasks with label 'build' should have tag
            for (const task of taggedTasks) {
                assert.strictEqual(task.type, 'npm', `Tagged task "${task.label}" must be type npm`);
                assert.strictEqual(task.label, 'build', `Tagged task must have label "build"`);
            }

            assert.strictEqual(taggedTasks.length, expectedTasks.length, 'Tag count must match expected');
        });

        test('INTEGRATION: Exact ID string pattern applies tag to ONE specific task', async function () {
            this.timeout(30000);

            // First get a real task ID
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1000);

            const allTasks = treeProvider.getAllTasks();
            assert.ok(allTasks.length > 0, 'Must have tasks');

            const targetTask = allTasks[0];
            assert.ok(targetTask !== undefined, 'First task must exist');

            // SETUP: Write config with exact ID
            const config: TaskTreeConfig = {
                tags: {
                    'exact-id-tag': [targetTask.id]
                }
            };
            writeConfig(config);

            // REFRESH
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(2000);

            // VERIFY
            const refreshedTasks = treeProvider.getAllTasks();
            const taggedTasks = refreshedTasks.filter(t => t.tags.includes('exact-id-tag'));

            // CRITICAL: Exactly ONE task should have tag
            assert.strictEqual(
                taggedTasks.length,
                1,
                `Exact ID pattern should match exactly 1 task, got ${taggedTasks.length}`
            );

            const taggedTask = taggedTasks[0];
            assert.ok(taggedTask !== undefined, 'Tagged task must exist');
            assert.strictEqual(taggedTask.id, targetTask.id, 'Must be the correct task');
        });

        test('INTEGRATION: {label} only pattern applies tag to ALL tasks with that label', async function () {
            this.timeout(30000);

            // SETUP: Write config with label-only pattern
            const config: TaskTreeConfig = {
                tags: {
                    'label-only-tag': [{ label: 'build' }]
                }
            };
            writeConfig(config);

            // REFRESH
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(2000);

            // VERIFY
            const allTasks = treeProvider.getAllTasks();
            const buildLabelTasks = allTasks.filter(t => t.label === 'build');
            const taggedTasks = allTasks.filter(t => t.tags.includes('label-only-tag'));

            assert.ok(buildLabelTasks.length > 0, 'Fixture MUST have tasks with label "build"');

            // CRITICAL: All 'build' label tasks should have tag
            for (const task of buildLabelTasks) {
                assert.ok(
                    task.tags.includes('label-only-tag'),
                    `Task "${task.label}" (type: ${task.type}) has label "build" but ` +
                    `does NOT have tag! Tags: [${task.tags.join(', ')}]`
                );
            }

            // CRITICAL: Only 'build' label tasks should have tag
            for (const task of taggedTasks) {
                assert.strictEqual(
                    task.label,
                    'build',
                    `Task with label "${task.label}" has tag but label is not "build"`
                );
            }
        });
    });

    /**
     * INTEGRATION: Tag Filter -> Tree View Display
     */
    suite('Tag Filter -> Tree View Display', () => {
        test('INTEGRATION: setTagFilter shows ONLY tagged tasks in getChildren output', async function () {
            this.timeout(30000);

            // SETUP
            const config: TaskTreeConfig = {
                tags: {
                    'filter-test-tag': [{ type: 'shell' }]
                }
            };
            writeConfig(config);

            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(2000);

            // Get unfiltered count
            treeProvider.clearFilters();
            const unfilteredTasks = await collectTasksFromTree(treeProvider);
            assert.ok(unfilteredTasks.length > 0, 'Must have tasks');

            const shellTasks = unfilteredTasks.filter(t => t.type === 'shell');
            assert.ok(shellTasks.length > 0, 'Must have shell tasks');
            assert.ok(shellTasks.length < unfilteredTasks.length, 'Not all tasks should be shell');

            // APPLY FILTER
            treeProvider.setTagFilter('filter-test-tag');
            await sleep(500);

            // GET TREE OUTPUT
            const filteredTasks = await collectTasksFromTree(treeProvider);

            // CRITICAL: Only shell tasks should appear
            assert.ok(filteredTasks.length > 0, 'Filtered tree must show tasks');
            assert.strictEqual(
                filteredTasks.length,
                shellTasks.length,
                `Filtered tree shows ${filteredTasks.length} tasks but should show ${shellTasks.length} shell tasks`
            );

            for (const task of filteredTasks) {
                assert.ok(
                    task.tags.includes('filter-test-tag'),
                    `INTEGRATION FAILED: Task "${task.label}" in filtered tree but ` +
                    `does NOT have tag "filter-test-tag"! Tags: [${task.tags.join(', ')}]`
                );
                assert.strictEqual(
                    task.type,
                    'shell',
                    `INTEGRATION FAILED: Task "${task.label}" in filtered tree but ` +
                    `type is "${task.type}", not "shell"`
                );
            }

            // Cleanup
            treeProvider.clearFilters();
        });

        test('INTEGRATION: Non-existent tag filter results in EMPTY tree', async function () {
            this.timeout(20000);

            // SETUP
            writeConfig({ tags: {} });
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1000);

            // Verify tasks exist before filter
            treeProvider.clearFilters();
            const allTasks = await collectTasksFromTree(treeProvider);
            assert.ok(allTasks.length > 0, 'Must have tasks');

            // APPLY FILTER for non-existent tag
            treeProvider.setTagFilter('this-tag-absolutely-does-not-exist-xyz123');
            await sleep(500);

            // GET TREE OUTPUT
            const filteredTasks = await collectTasksFromTree(treeProvider);

            // CRITICAL: Tree must be empty
            assert.strictEqual(
                filteredTasks.length,
                0,
                `INTEGRATION FAILED: Tree shows ${filteredTasks.length} tasks for non-existent tag! ` +
                `Tasks: [${filteredTasks.map(t => t.label).join(', ')}]`
            );

            // Cleanup
            treeProvider.clearFilters();
        });
    });

    /**
     * INTEGRATION: Quick Tag -> QuickTasksProvider Display
     */
    suite('Quick Tag -> QuickTasksProvider Display', () => {
        test('INTEGRATION: Task with "quick" tag in config APPEARS in QuickTasksProvider', async function () {
            this.timeout(30000);

            // First discover a real task
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1000);

            const allTasks = treeProvider.getAllTasks();
            assert.ok(allTasks.length > 0, 'Must have tasks');

            const targetTask = allTasks[0];
            assert.ok(targetTask !== undefined, 'First task must exist');

            // SETUP: Write config with task ID in quick tag
            const config: TaskTreeConfig = {
                tags: {
                    quick: [targetTask.id]
                }
            };
            writeConfig(config);

            // REFRESH both providers
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1000);
            await quickProvider.updateTasks(treeProvider.getAllTasks());
            await sleep(500);

            // GET QUICK TASKS VIEW
            const quickChildren = quickProvider.getChildren(undefined);

            // CRITICAL: Task must appear in quick tasks
            const taskInQuick = quickChildren.find(c => c.task?.id === targetTask.id);

            assert.ok(
                taskInQuick !== undefined,
                `INTEGRATION FAILED: Config has quick: ["${targetTask.id}"] but task ` +
                `"${targetTask.label}" does NOT appear in QuickTasksProvider! ` +
                `Quick view contains: [${quickChildren.map(c => c.task?.id ?? 'placeholder').join(', ')}]`
            );
        });

        test('INTEGRATION: Structured {type} pattern in quick tag shows ALL matching tasks', async function () {
            this.timeout(30000);

            // SETUP: Write config with type pattern in quick
            const config: TaskTreeConfig = {
                tags: {
                    quick: [{ type: 'shell' }]
                }
            };
            writeConfig(config);

            // REFRESH
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1000);
            await quickProvider.updateTasks(treeProvider.getAllTasks());
            await sleep(500);

            // GET QUICK TASKS
            const quickChildren = quickProvider.getChildren(undefined);
            const quickTasks = quickChildren.filter(c => c.task !== null);

            // Get expected shell tasks
            const allTasks = treeProvider.getAllTasks();
            const shellTasks = allTasks.filter(t => t.type === 'shell');

            assert.ok(shellTasks.length > 0, 'Must have shell tasks');

            // CRITICAL: All shell tasks should be in quick view
            assert.strictEqual(
                quickTasks.length,
                shellTasks.length,
                `Quick view shows ${quickTasks.length} tasks but there are ${shellTasks.length} shell tasks`
            );

            for (const task of shellTasks) {
                const inQuick = quickTasks.find(q => q.task?.id === task.id);
                assert.ok(
                    inQuick !== undefined,
                    `INTEGRATION FAILED: Shell task "${task.label}" not in quick view ` +
                    `even though config has quick: [{ type: 'shell' }]`
                );
            }
        });

        test('INTEGRATION: Empty quick tag shows placeholder', async function () {
            this.timeout(20000);

            // SETUP: Write config with empty quick tag
            const config: TaskTreeConfig = {
                tags: {
                    quick: []
                }
            };
            writeConfig(config);

            // REFRESH
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1000);
            await quickProvider.updateTasks(treeProvider.getAllTasks());
            await sleep(500);

            // GET QUICK TASKS
            const quickChildren = quickProvider.getChildren(undefined);

            // CRITICAL: Should show placeholder
            assert.strictEqual(quickChildren.length, 1, 'Should have exactly one placeholder');
            const placeholder = quickChildren[0];
            assert.ok(placeholder !== undefined, 'Placeholder must exist');
            assert.ok(placeholder.task === null, 'Placeholder must have null task');
        });

        test('INTEGRATION: addToQuick makes task appear in QuickTasksProvider immediately', async function () {
            this.timeout(30000);

            // Clear quick tasks first
            writeConfig({ tags: {} });
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1000);
            await quickProvider.updateTasks(treeProvider.getAllTasks());
            await sleep(500);

            // Verify empty/placeholder
            let quickChildren = quickProvider.getChildren(undefined);
            const hasPlaceholder = quickChildren.some(c => c.task === null);
            assert.ok(
                hasPlaceholder || quickChildren.length === 0,
                'Quick view should be empty/placeholder before adding'
            );

            // Get a task to add
            const allTasks = treeProvider.getAllTasks();
            const taskToAdd = allTasks[0];
            assert.ok(taskToAdd !== undefined, 'Must have task to add');

            // ADD TO QUICK
            await quickProvider.addToQuick(taskToAdd);
            await sleep(500);

            // GET QUICK TASKS AGAIN
            quickChildren = quickProvider.getChildren(undefined);

            // CRITICAL: Task must appear
            const addedTask = quickChildren.find(c => c.task?.id === taskToAdd.id);
            assert.ok(
                addedTask !== undefined,
                `INTEGRATION FAILED: Called addToQuick("${taskToAdd.label}") but task ` +
                `does NOT appear in QuickTasksProvider! ` +
                `Quick view contains: [${quickChildren.map(c => c.task?.id ?? 'placeholder').join(', ')}]`
            );

            // Cleanup
            await quickProvider.removeFromQuick(taskToAdd);
        });

        test('INTEGRATION: removeFromQuick makes task disappear from QuickTasksProvider', async function () {
            this.timeout(30000);

            // Setup: Add a task first
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1000);

            const allTasks = treeProvider.getAllTasks();
            const taskToRemove = allTasks[0];
            assert.ok(taskToRemove !== undefined, 'Must have task');

            await quickProvider.addToQuick(taskToRemove);
            await sleep(500);

            // Verify it's there
            let quickChildren = quickProvider.getChildren(undefined);
            let taskInQuick = quickChildren.find(c => c.task?.id === taskToRemove.id);
            assert.ok(taskInQuick !== undefined, 'Task must be in quick view before removal');

            // REMOVE FROM QUICK
            await quickProvider.removeFromQuick(taskToRemove);
            await sleep(500);

            // GET QUICK TASKS AGAIN
            quickChildren = quickProvider.getChildren(undefined);

            // CRITICAL: Task must NOT appear
            taskInQuick = quickChildren.find(c => c.task?.id === taskToRemove.id);
            assert.ok(
                taskInQuick === undefined,
                `INTEGRATION FAILED: Called removeFromQuick("${taskToRemove.label}") but task ` +
                `STILL appears in QuickTasksProvider!`
            );
        });
    });

    /**
     * INTEGRATION: Multiple Tags on Same Task
     */
    suite('Multiple Tags on Same Task', () => {
        test('INTEGRATION: Task can have multiple tags from different patterns', async function () {
            this.timeout(30000);

            // First get a npm task
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1000);

            const allTasks = treeProvider.getAllTasks();
            const npmTask = allTasks.find(t => t.type === 'npm' && t.label === 'build');
            assert.ok(npmTask !== undefined, 'Must have npm:build task');

            // SETUP: Write config with multiple patterns that match the same task
            const config: TaskTreeConfig = {
                tags: {
                    'tag-by-type': [{ type: 'npm' }],
                    'tag-by-label': [{ label: 'build' }],
                    'tag-by-both': [{ type: 'npm', label: 'build' }]
                }
            };
            writeConfig(config);

            // REFRESH
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(2000);

            // VERIFY
            const refreshedTasks = treeProvider.getAllTasks();
            const targetTask = refreshedTasks.find(t => t.type === 'npm' && t.label === 'build');
            assert.ok(targetTask !== undefined, 'npm:build task must still exist');

            // CRITICAL: Task should have ALL three tags
            assert.ok(
                targetTask.tags.includes('tag-by-type'),
                `Task missing "tag-by-type" tag. Has: [${targetTask.tags.join(', ')}]`
            );
            assert.ok(
                targetTask.tags.includes('tag-by-label'),
                `Task missing "tag-by-label" tag. Has: [${targetTask.tags.join(', ')}]`
            );
            assert.ok(
                targetTask.tags.includes('tag-by-both'),
                `Task missing "tag-by-both" tag. Has: [${targetTask.tags.join(', ')}]`
            );
        });
    });

    /**
     * INTEGRATION: Config File Watch
     */
    suite('Config File Changes', () => {
        test('INTEGRATION: Manual config edit + refresh applies new tags', async function () {
            this.timeout(30000);

            // Start with no tags
            writeConfig({ tags: {} });
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1000);

            // Verify no tasks have our test tag
            let allTasks = treeProvider.getAllTasks();
            let taggedBefore = allTasks.filter(t => t.tags.includes('manual-edit-tag'));
            assert.strictEqual(taggedBefore.length, 0, 'No tasks should have tag before config edit');

            // MANUALLY EDIT CONFIG (simulate user editing file)
            const newConfig: TaskTreeConfig = {
                tags: {
                    'manual-edit-tag': [{ type: 'npm' }]
                }
            };
            writeConfig(newConfig);

            // REFRESH
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(2000);

            // VERIFY: Tasks now have the tag
            allTasks = treeProvider.getAllTasks();
            const taggedAfter = allTasks.filter(t => t.tags.includes('manual-edit-tag'));
            const npmTasks = allTasks.filter(t => t.type === 'npm');

            assert.ok(npmTasks.length > 0, 'Must have npm tasks');
            assert.strictEqual(
                taggedAfter.length,
                npmTasks.length,
                `After config edit, ${taggedAfter.length} tasks have tag but ${npmTasks.length} npm tasks exist`
            );
        });
    });
});
