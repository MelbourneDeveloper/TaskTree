/**
 * Spec: tagging/config-file, quick-tasks
 * E2E TESTS for TagConfig -> Task Tagging -> Filtering Flow
 *
 * Tests the COMPLETE flow through VS Code:
 * - Write config file
 * - File watcher auto-syncs
 * - Tags applied to tasks
 * - Filtering works correctly
 */

import * as assert from 'assert';
import * as fs from 'fs';
import {
    activateExtension,
    sleep,
    getFixturePath,
    getTaskTreeProvider,
    getQuickTasksProvider
} from '../helpers/helpers';
import type { TaskTreeProvider, QuickTasksProvider, TaskTreeItem } from '../helpers/helpers';

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

async function findTreeItemById(
    categories: TaskTreeItem[],
    taskId: string,
    provider: TaskTreeProvider
): Promise<TaskTreeItem | undefined> {
    for (const cat of categories) {
        const children = await provider.getChildren(cat);
        for (const child of children) {
            if (child.task?.id === taskId) { return child; }
            const grandChildren = await provider.getChildren(child);
            for (const gc of grandChildren) {
                if (gc.task?.id === taskId) { return gc; }
            }
        }
    }
    return undefined;
}

// Spec: tagging/config-file, quick-tasks
suite('TagConfig E2E Flow Tests', () => {
    let originalConfig: string;
    let treeProvider: TaskTreeProvider;
    let quickProvider: QuickTasksProvider;

    suiteSetup(async function () {
        this.timeout(30000);
        await activateExtension();
        treeProvider = getTaskTreeProvider();
        quickProvider = getQuickTasksProvider();

        // Save original config
        const configPath = getFixturePath('.vscode/tasktree.json');
        if (fs.existsSync(configPath)) {
            originalConfig = fs.readFileSync(configPath, 'utf8');
        } else {
            originalConfig = JSON.stringify({ tags: {} }, null, 4);
        }

        await sleep(2000);
    });

    suiteTeardown(async function () {
        this.timeout(10000);
        fs.writeFileSync(getFixturePath('.vscode/tasktree.json'), originalConfig);
        await sleep(3000);
    });

    // Spec: tagging/config-file, tagging/pattern-syntax, quick-tasks
    suite('Complete Tag Flow', () => {
        test('E2E: type pattern config -> auto-sync -> tags applied -> filter works', async function () {
            this.timeout(30000);

            // GIVEN: Config with type pattern for npm tasks
            const config: TaskTreeConfig = {
                tags: {
                    'quick': [{ type: 'npm' }],
                    'build': [{ label: 'build' }]
                }
            };
            writeConfig(config);

            // WAIT: File watcher auto-syncs
            await sleep(3000);

            // VERIFY: Tags applied correctly
            const allTasks = treeProvider.getAllTasks();
            const npmTasks = allTasks.filter(t => t.type === 'npm');
            const buildLabelTasks = allTasks.filter(t => t.label === 'build');

            assert.ok(npmTasks.length > 0, 'Fixture MUST have npm tasks');
            assert.ok(buildLabelTasks.length > 0, 'Fixture MUST have build tasks');

            // All npm tasks should have 'quick' tag
            for (const task of npmTasks) {
                assert.ok(
                    task.tags.includes('quick'),
                    `NPM task "${task.label}" MUST have quick tag. Has: [${task.tags.join(', ')}]`
                );
            }

            // All 'build' label tasks should have 'build' tag
            for (const task of buildLabelTasks) {
                assert.ok(
                    task.tags.includes('build'),
                    `Build task "${task.label}" (${task.type}) MUST have build tag. Has: [${task.tags.join(', ')}]`
                );
            }

            // npm:build should have BOTH tags
            const npmBuildTask = allTasks.find(t => t.type === 'npm' && t.label === 'build');
            if (npmBuildTask !== undefined) {
                assert.ok(npmBuildTask.tags.includes('quick'), 'npm:build MUST have quick tag');
                assert.ok(npmBuildTask.tags.includes('build'), 'npm:build MUST have build tag');
            }
        });

        test('E2E: exact ID pattern -> auto-sync -> only that task tagged', async function () {
            this.timeout(30000);

            // Get a real task ID first
            const allTasks = treeProvider.getAllTasks();
            assert.ok(allTasks.length > 0, 'Must have tasks');

            const targetTask = allTasks[0];
            assert.ok(targetTask !== undefined, 'First task must exist');

            // GIVEN: Config with exact ID pattern
            const config: TaskTreeConfig = {
                tags: {
                    'exact-match': [targetTask.id]
                }
            };
            writeConfig(config);

            // WAIT: File watcher auto-syncs
            await sleep(3000);

            // VERIFY: Only that task has the tag
            const refreshedTasks = treeProvider.getAllTasks();
            const taggedTasks = refreshedTasks.filter(t => t.tags.includes('exact-match'));

            assert.strictEqual(
                taggedTasks.length,
                1,
                `Exact ID pattern should match exactly 1 task, got ${taggedTasks.length}`
            );

            const taggedTask = taggedTasks[0];
            assert.ok(taggedTask !== undefined, 'Tagged task must exist');
            assert.strictEqual(taggedTask.id, targetTask.id, 'Must be the correct task');

            // VERIFY: Tree item description MUST show the tag visually
            const categories = await treeProvider.getChildren();
            const treeItem = await findTreeItemById(categories, targetTask.id, treeProvider);
            assert.ok(treeItem !== undefined, 'Tagged task must appear in tree view');
            assert.ok(
                typeof treeItem.description === 'string' && treeItem.description.includes('exact-match'),
                `Tree item description MUST show the tag. Got: "${String(treeItem.description)}"`
            );
        });

        test('E2E: quick tag -> tasks appear in QuickTasksProvider', async function () {
            this.timeout(30000);

            // Get a task to add to quick
            const allTasks = treeProvider.getAllTasks();
            const targetTask = allTasks[0];
            assert.ok(targetTask !== undefined, 'Must have task');

            // GIVEN: Config with task in quick tag
            const config: TaskTreeConfig = {
                tags: {
                    'quick': [targetTask.id]
                }
            };
            writeConfig(config);

            // WAIT: File watcher auto-syncs
            await sleep(3000);

            // VERIFY: Task appears in QuickTasksProvider
            const quickChildren = quickProvider.getChildren(undefined);
            const taskInQuick = quickChildren.find(c => c.task?.id === targetTask.id);

            assert.ok(
                taskInQuick !== undefined,
                `Task "${targetTask.label}" with quick tag MUST appear in QuickTasksProvider. ` +
                `Quick view contains: [${quickChildren.map(c => c.task?.id ?? 'placeholder').join(', ')}]`
            );

            // VERIFY: Tree item in main view MUST have contextValue 'task-quick' (filled star icon)
            const categories = await treeProvider.getChildren();
            const treeItem = await findTreeItemById(categories, targetTask.id, treeProvider);
            assert.ok(treeItem !== undefined, 'Quick-tagged task must appear in main tree');
            assert.strictEqual(
                treeItem.contextValue,
                'task-quick',
                `Task with quick tag MUST have contextValue 'task-quick' for filled star. Got: "${treeItem.contextValue}"`
            );
        });

        test('E2E: remove from quick tag -> task disappears from QuickTasksProvider', async function () {
            this.timeout(30000);

            // Get a task
            const allTasks = treeProvider.getAllTasks();
            const targetTask = allTasks[0];
            assert.ok(targetTask !== undefined, 'Must have task');

            // Add to quick first
            writeConfig({ tags: { quick: [targetTask.id] } });
            await sleep(3000);

            // Verify it's there
            let quickChildren = quickProvider.getChildren(undefined);
            let taskInQuick = quickChildren.find(c => c.task?.id === targetTask.id);
            assert.ok(taskInQuick !== undefined, 'Task must be in quick before removal');

            // GIVEN: Remove from quick config
            writeConfig({ tags: { quick: [] } });

            // WAIT: File watcher auto-syncs
            await sleep(3000);

            // VERIFY: Task no longer in QuickTasksProvider
            quickChildren = quickProvider.getChildren(undefined);
            taskInQuick = quickChildren.find(c => c.task?.id === targetTask.id);

            assert.ok(
                taskInQuick === undefined,
                `Task "${targetTask.label}" removed from quick config MUST NOT appear in QuickTasksProvider`
            );
        });
    });
});
