/**
 * ⛔️⛔️⛔️ CRITICAL E2E TEST RULES ⛔️⛔️⛔️
 *
 * These are END-TO-END tests. They MUST simulate REAL USER behavior.
 * VS Code extension tests run in extension host, NOT renderer - no DOM access.
 *
 * ⛔️⛔️⛔️ ILLEGAL ACTIONS ⛔️⛔️⛔️
 * - ❌ Calling ANY internal methods (refresh, addTaskToTag, removeTaskFromTag, setTagFilter, clearFilters)
 * - ❌ Calling vscode.commands.executeCommand('tasktree.refresh') - refresh should be AUTOMATIC!
 * - ❌ Manipulating internal state in any way
 *
 * ✅ LEGAL ACTIONS ✅
 * - ✅ Directly using the UI through the DOM
 *
 * THE BUG: The extension may NOT auto-refresh when config changes.
 * These tests prove whether the file watcher triggers syncQuickTasks automatically!
 */

import * as assert from 'assert';
import * as fs from 'fs';
import {
    activateExtension,
    sleep,
    getFixturePath,
    getExtensionPath,
    getTaskTreeProvider
} from './helpers';
import type { TaskTreeProvider } from './helpers';

interface TagPattern {
    id?: string;
    type?: string;
    label?: string;
}

interface TagConfig {
    tags: Record<string, Array<string | TagPattern>>;
}

function writeTagConfig(config: TagConfig): void {
    const tagConfigPath = getFixturePath('.vscode/tasktree.json');
    fs.writeFileSync(tagConfigPath, JSON.stringify(config, null, 4));
}

function readTagConfig(): TagConfig {
    const tagConfigPath = getFixturePath('.vscode/tasktree.json');
    return JSON.parse(fs.readFileSync(tagConfigPath, 'utf8')) as TagConfig;
}

suite('Tag Context Menu E2E Tests', () => {
    let provider: TaskTreeProvider;
    let originalTagConfig: string;

    suiteSetup(async function () {
        this.timeout(30000);
        await activateExtension();
        provider = getTaskTreeProvider();

        const tagConfigPath = getFixturePath('.vscode/tasktree.json');
        originalTagConfig = fs.readFileSync(tagConfigPath, 'utf8');

        await sleep(2000);
    });

    suiteTeardown(async function () {
        this.timeout(10000);
        // Restore original tag config
        const tagConfigPath = getFixturePath('.vscode/tasktree.json');
        fs.writeFileSync(tagConfigPath, originalTagConfig);
        await sleep(3000); // Wait for file watcher
    });

    suite('Tag Commands Registration', () => {
        test('addTag command is registered', async function () {
            this.timeout(10000);

            const commands = await import('vscode').then(v => v.commands.getCommands(true));
            assert.ok(
                commands.includes('tasktree.addTag'),
                'addTag command should be registered'
            );
        });

        test('removeTag command is registered', async function () {
            this.timeout(10000);

            const commands = await import('vscode').then(v => v.commands.getCommands(true));
            assert.ok(
                commands.includes('tasktree.removeTag'),
                'removeTag command should be registered'
            );
        });
    });

    suite('Tag Config File Operations', () => {
        test('PROOF: Writing tag to config file auto-syncs to view', async function () {
            this.timeout(30000);

            // Get a task ID from already-loaded tasks
            const allTasks = provider.getAllTasks();
            assert.ok(allTasks.length > 0, 'Tasks must be loaded at activation');

            const testTask = allTasks[0];
            assert.ok(testTask !== undefined, 'First task must exist');

            const newTagName = 'test-e2e-tag';

            // Step 1: Write tag to config file (simulates user editing)
            const config = readTagConfig();
            config.tags[newTagName] = [testTask.id];
            writeTagConfig(config);

            // Step 2: Wait for file watcher to auto-sync (THIS IS THE BUG!)
            await sleep(3000);

            // Step 3: CRITICAL - Task MUST have tag WITHOUT any refresh command
            const refreshedTasks = provider.getAllTasks();
            const taskAfterEdit = refreshedTasks.find(t => t.id === testTask.id);

            assert.ok(
                taskAfterEdit !== undefined,
                'Task must still exist after config edit'
            );

            assert.ok(
                taskAfterEdit.tags.includes(newTagName),
                `BUG: Config has tag "${newTagName}" for task "${testTask.id}" but ` +
                `task.tags is [${taskAfterEdit.tags.join(', ')}]. ` +
                `File watcher is NOT auto-syncing!`
            );
        });

        test('PROOF: Removing tag from config file auto-syncs to view', async function () {
            this.timeout(30000);

            const allTasks = provider.getAllTasks();
            const testTask = allTasks[0];
            assert.ok(testTask !== undefined, 'Task must exist');

            const tagName = 'test-remove-tag';

            // Step 1: Add tag via config
            let config = readTagConfig();
            config.tags[tagName] = [testTask.id];
            writeTagConfig(config);
            await sleep(3000);

            // Step 2: Remove tag via config (simulates user editing)
            config = readTagConfig();
            const remainingTags = Object.fromEntries(
                Object.entries(config.tags).filter(([key]) => key !== tagName)
            );
            config.tags = remainingTags;
            writeTagConfig(config);
            await sleep(3000);

            // Step 3: CRITICAL - Tag MUST be removed WITHOUT any refresh command
            const refreshedTasks = provider.getAllTasks();
            const taskAfterEdit = refreshedTasks.find(t => t.id === testTask.id);

            assert.ok(
                taskAfterEdit !== undefined,
                'Task must still exist'
            );

            assert.ok(
                !taskAfterEdit.tags.includes(tagName),
                `BUG: Tag "${tagName}" was removed from config but task.tags is ` +
                `[${taskAfterEdit.tags.join(', ')}]. File watcher is NOT auto-syncing!`
            );
        });

        test('getAllTags returns tags from config file', async function () {
            this.timeout(15000);

            // Write specific tags to config
            writeTagConfig({
                tags: {
                    'build': [{ type: 'npm' }],
                    'test': [{ label: 'test' }],
                    'custom-tag': ['some-id']
                }
            });
            await sleep(3000);

            // Observe tags
            const tags = provider.getAllTags();
            assert.ok(Array.isArray(tags), 'getAllTags should return an array');

            // These tags should be present if file watcher works
            assert.ok(tags.includes('build'), 'Should include build tag');
            assert.ok(tags.includes('test'), 'Should include test tag');
            assert.ok(tags.includes('custom-tag'), 'Should include custom-tag');
        });
    });

    suite('Tag UI Integration (Static Checks)', () => {
        test('addTag and removeTag are in view item context menu', function () {
            this.timeout(10000);

            // Read package.json to verify menu configuration (static check - OK)
            const packageJsonPath = getExtensionPath('package.json');
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
                contributes: {
                    menus: {
                        'view/item/context': Array<{
                            command: string;
                            when: string;
                            group: string;
                        }>;
                    };
                };
            };

            const contextMenus = packageJson.contributes.menus['view/item/context'];

            const addTagMenu = contextMenus.find(
                m => m.command === 'tasktree.addTag'
            );
            const removeTagMenu = contextMenus.find(
                m => m.command === 'tasktree.removeTag'
            );

            assert.ok(addTagMenu !== undefined, 'addTag should be in context menu');
            assert.ok(
                removeTagMenu !== undefined,
                'removeTag should be in context menu'
            );
            assert.ok(
                addTagMenu.when.includes('viewItem == task'),
                'addTag should only show for tasks'
            );
            assert.ok(
                removeTagMenu.when.includes('viewItem == task'),
                'removeTag should only show for tasks'
            );
        });

        test('tag commands are in 3_tagging group', function () {
            this.timeout(10000);

            const packageJsonPath = getExtensionPath('package.json');
            const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as {
                contributes: {
                    menus: {
                        'view/item/context': Array<{
                            command: string;
                            group: string;
                        }>;
                    };
                };
            };

            const contextMenus = packageJson.contributes.menus['view/item/context'];

            const addTagMenu = contextMenus.find(
                m => m.command === 'tasktree.addTag'
            );
            const removeTagMenu = contextMenus.find(
                m => m.command === 'tasktree.removeTag'
            );

            assert.ok(addTagMenu !== undefined, 'addTag should be in context menu');
            assert.ok(
                addTagMenu.group.startsWith('3_tagging'),
                'addTag should be in tagging group'
            );
            assert.ok(removeTagMenu !== undefined, 'removeTag should be in context menu');
            assert.ok(
                removeTagMenu.group.startsWith('3_tagging'),
                'removeTag should be in tagging group'
            );
        });
    });

    suite('Tag Pattern Matching (Config -> View)', () => {
        test('PROOF: Structured {type} pattern applies tag to matching tasks', async function () {
            this.timeout(30000);

            // Write config with type pattern
            writeTagConfig({
                tags: {
                    'type-pattern-tag': [{ type: 'shell' }]
                }
            });
            await sleep(3000);

            // Observe tasks - shell tasks MUST have the tag
            const allTasks = provider.getAllTasks();
            const shellTasks = allTasks.filter(t => t.type === 'shell');
            const taggedTasks = allTasks.filter(t => t.tags.includes('type-pattern-tag'));

            assert.ok(shellTasks.length > 0, 'Fixture must have shell tasks');

            // PROOF: All shell tasks should have the tag
            for (const task of shellTasks) {
                assert.ok(
                    task.tags.includes('type-pattern-tag'),
                    `BUG: Shell task "${task.label}" should have tag but has [${task.tags.join(', ')}]`
                );
            }

            // PROOF: Only shell tasks should have the tag
            for (const task of taggedTasks) {
                assert.strictEqual(
                    task.type,
                    'shell',
                    `BUG: Non-shell task "${task.label}" (type: ${task.type}) has the tag`
                );
            }
        });

        test('PROOF: Structured {type, label} pattern matches specific tasks', async function () {
            this.timeout(30000);

            // Write config with type+label pattern
            writeTagConfig({
                tags: {
                    'specific-match-tag': [{ type: 'npm', label: 'build' }]
                }
            });
            await sleep(3000);

            // Observe tasks
            const allTasks = provider.getAllTasks();
            const expectedTasks = allTasks.filter(t => t.type === 'npm' && t.label === 'build');
            const taggedTasks = allTasks.filter(t => t.tags.includes('specific-match-tag'));

            assert.ok(expectedTasks.length > 0, 'Fixture must have npm:build task');

            // PROOF: Only npm tasks with label 'build' should have tag
            for (const task of taggedTasks) {
                assert.strictEqual(task.type, 'npm', 'Tagged task must be npm type');
                assert.strictEqual(task.label, 'build', 'Tagged task must have label "build"');
            }

            assert.strictEqual(taggedTasks.length, expectedTasks.length, 'Tag count must match expected');
        });

        test('PROOF: Exact task ID pattern matches only that task', async function () {
            this.timeout(30000);

            // Get a real task ID
            const allTasks = provider.getAllTasks();
            assert.ok(allTasks.length > 0, 'Must have tasks');

            const targetTask = allTasks[0];
            assert.ok(targetTask !== undefined, 'First task must exist');

            // Write config with exact ID
            writeTagConfig({
                tags: {
                    'exact-id-tag': [targetTask.id]
                }
            });
            await sleep(3000);

            // Observe tasks
            const refreshedTasks = provider.getAllTasks();
            const taggedTasks = refreshedTasks.filter(t => t.tags.includes('exact-id-tag'));

            // PROOF: Exactly ONE task should have tag
            assert.strictEqual(
                taggedTasks.length,
                1,
                `Exact ID pattern should match exactly 1 task, got ${taggedTasks.length}`
            );

            const taggedTask = taggedTasks[0];
            assert.ok(taggedTask !== undefined, 'Tagged task must exist');
            assert.strictEqual(taggedTask.id, targetTask.id, 'Must be the correct task');
        });

        test('PROOF: {label} only pattern applies tag to ALL tasks with that label', async function () {
            this.timeout(30000);

            // Write config with label-only pattern
            writeTagConfig({
                tags: {
                    'label-only-tag': [{ label: 'build' }]
                }
            });
            await sleep(3000);

            // Observe tasks
            const allTasks = provider.getAllTasks();
            const buildLabelTasks = allTasks.filter(t => t.label === 'build');
            const taggedTasks = allTasks.filter(t => t.tags.includes('label-only-tag'));

            assert.ok(buildLabelTasks.length > 0, 'Fixture must have tasks with label "build"');

            // PROOF: All 'build' label tasks should have tag
            for (const task of buildLabelTasks) {
                assert.ok(
                    task.tags.includes('label-only-tag'),
                    `BUG: Task "${task.label}" (type: ${task.type}) has label "build" but ` +
                    `tags are [${task.tags.join(', ')}]`
                );
            }

            // PROOF: Only 'build' label tasks should have tag
            for (const task of taggedTasks) {
                assert.strictEqual(
                    task.label,
                    'build',
                    `BUG: Task with label "${task.label}" has tag but label is not "build"`
                );
            }
        });
    });

    suite('Tag Config Edge Cases', () => {
        test('empty tags object results in no tags', async function () {
            this.timeout(15000);

            writeTagConfig({ tags: {} });
            await sleep(3000);

            const tags = provider.getAllTags();
            assert.strictEqual(tags.length, 0, 'Should have no tags');
        });

        test('missing tags property results in no tags', async function () {
            this.timeout(15000);

            // Write config without tags property
            const tagConfigPath = getFixturePath('.vscode/tasktree.json');
            fs.writeFileSync(tagConfigPath, JSON.stringify({}, null, 4));
            await sleep(3000);

            const tags = provider.getAllTags();
            assert.strictEqual(tags.length, 0, 'Should handle missing tags property');
        });

        test('config file persistence works', function () {
            this.timeout(10000);

            // Write config
            writeTagConfig({
                tags: {
                    'persistence-test': ['task-id']
                }
            });

            // Read back - should persist
            const savedConfig = readTagConfig();
            assert.ok(savedConfig.tags['persistence-test'] !== undefined, 'Tag should persist');
            assert.ok(
                savedConfig.tags['persistence-test'].includes('task-id'),
                'Task ID should persist'
            );
        });

        test('multiple tasks can be added to same tag via config', async function () {
            this.timeout(20000);

            const allTasks = provider.getAllTasks();
            assert.ok(allTasks.length >= 2, 'Need at least 2 tasks');

            const task1 = allTasks[0];
            const task2 = allTasks[1];
            assert.ok(task1 !== undefined && task2 !== undefined);

            // Write both task IDs to same tag
            writeTagConfig({
                tags: {
                    'multi-task-tag': [task1.id, task2.id]
                }
            });
            await sleep(3000);

            // Verify both have the tag
            const refreshedTasks = provider.getAllTasks();
            const taggedTasks = refreshedTasks.filter(t => t.tags.includes('multi-task-tag'));

            assert.ok(
                taggedTasks.some(t => t.id === task1.id),
                'First task should have tag'
            );
            assert.ok(
                taggedTasks.some(t => t.id === task2.id),
                'Second task should have tag'
            );
        });
    });

    /**
     * PROOF TESTS: These verify that tagging ACTUALLY affects the tree view.
     * Tags must be visible in task.tags when retrieved via getChildren().
     */
    suite('PROOF: Tags Appear In Tree View', () => {
        /**
         * Recursively collects all TaskItems from the tree view.
         */
        async function collectAllTasksFromTree(
            treeProvider: TaskTreeProvider,
            element?: Parameters<TaskTreeProvider['getChildren']>[0]
        ): Promise<Array<{ id: string; label: string; tags: readonly string[] }>> {
            const children = await treeProvider.getChildren(element);
            const tasks: Array<{ id: string; label: string; tags: readonly string[] }> = [];

            for (const child of children) {
                if (child.task !== null) {
                    tasks.push({
                        id: child.task.id,
                        label: child.task.label,
                        tags: child.task.tags
                    });
                }
                if (child.children.length > 0) {
                    const childTasks = await collectAllTasksFromTree(treeProvider, child);
                    tasks.push(...childTasks);
                }
            }

            return tasks;
        }

        test('PROOF: Config change makes tag visible in tree view', async function () {
            this.timeout(30000);

            // Get a task from already-loaded tasks
            const allTasks = provider.getAllTasks();
            assert.ok(allTasks.length > 0, 'Must have tasks');

            const taskToTag = allTasks[0];
            assert.ok(taskToTag !== undefined, 'First task must exist');

            const testTagName = 'proof-visible-tag';

            // Step 1: Write tag to config (simulates user editing)
            writeTagConfig({
                tags: {
                    [testTagName]: [taskToTag.id]
                }
            });

            // Step 2: Wait for file watcher (THIS IS THE BUG!)
            await sleep(3000);

            // Step 3: CRITICAL - Get task from tree view and verify tag is visible
            const tasksInTree = await collectAllTasksFromTree(provider);
            const taggedTaskInTree = tasksInTree.find(t => t.id === taskToTag.id);

            assert.ok(
                taggedTaskInTree !== undefined,
                `Task "${taskToTag.label}" must appear in tree`
            );

            assert.ok(
                taggedTaskInTree.tags.includes(testTagName),
                `PROOF FAILED: Task "${taskToTag.label}" should have tag "${testTagName}" ` +
                `but visible tags are [${taggedTaskInTree.tags.join(', ')}]. ` +
                `File watcher is NOT auto-syncing!`
            );
        });

        test('PROOF: Structured pattern tags are visible in tree view', async function () {
            this.timeout(30000);

            // Write config with type pattern
            writeTagConfig({
                tags: {
                    'tree-view-proof-tag': [{ type: 'npm' }]
                }
            });
            await sleep(3000);

            // Get tasks from tree view
            const tasksInTree = await collectAllTasksFromTree(provider);
            const npmTasksInTree = tasksInTree.filter(t =>
                provider.getAllTasks().find(at => at.id === t.id && at.type === 'npm')
            );

            assert.ok(npmTasksInTree.length > 0, 'Must have npm tasks in tree');

            // PROOF: All npm tasks in tree should have the tag
            for (const task of npmTasksInTree) {
                assert.ok(
                    task.tags.includes('tree-view-proof-tag'),
                    `PROOF FAILED: npm task "${task.label}" in tree should have tag ` +
                    `but visible tags are [${task.tags.join(', ')}]`
                );
            }
        });
    });
});
