import * as assert from 'assert';
import * as vscode from 'vscode';
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

suite('Tag Context Menu E2E Tests', () => {
    let provider: TaskTreeProvider;
    let tagConfigPath: string;
    let originalTagConfig: string;

    suiteSetup(async function () {
        this.timeout(30000);
        await activateExtension();
        // getTaskTreeProvider() throws if provider is not available
        provider = getTaskTreeProvider();

        tagConfigPath = getFixturePath('.vscode/tasktree.json');
        originalTagConfig = fs.readFileSync(tagConfigPath, 'utf8');

        await sleep(2000);
    });

    suiteTeardown(async function () {
        this.timeout(10000);
        // Restore original tag config
        fs.writeFileSync(tagConfigPath, originalTagConfig);
        await vscode.commands.executeCommand('tasktree.refresh');
        await sleep(500);
    });

    suite('Tag Commands Registration', () => {
        test('addTag command is registered', async function () {
            this.timeout(10000);

            const commands = await vscode.commands.getCommands(true);
            assert.ok(
                commands.includes('tasktree.addTag'),
                'addTag command should be registered'
            );
        });

        test('removeTag command is registered', async function () {
            this.timeout(10000);

            const commands = await vscode.commands.getCommands(true);
            assert.ok(
                commands.includes('tasktree.removeTag'),
                'removeTag command should be registered'
            );
        });
    });

    suite('Tag Operations via Provider', () => {
        test('addTaskToTag adds task label to tag config', async function () {
            this.timeout(15000);

                        await provider.refresh();
            await sleep(500);

            const tasks = provider.getAllTasks();
            assert.ok(tasks.length > 0, 'Should have tasks to tag');

            const testTask = tasks[0];
            assert.ok(testTask !== undefined, 'Should have at least one task');

            const newTagName = 'test-e2e-tag';

            // Add task to new tag
            await provider.addTaskToTag(testTask, newTagName);
            await sleep(500);

            // Verify tag was added to config file
            const configContent = fs.readFileSync(tagConfigPath, 'utf8');
            const config = JSON.parse(configContent) as TagConfig;

            assert.ok(
                config.tags[newTagName] !== undefined,
                `Tag "${newTagName}" should exist in config`
            );
            assert.ok(
                config.tags[newTagName].includes(testTask.id),
                `Tag should contain task id "${testTask.id}"`
            );
        });

        test('removeTaskFromTag removes task label from tag config', async function () {
            this.timeout(15000);

                        await provider.refresh();
            await sleep(500);

            const tasks = provider.getAllTasks();
            const testTask = tasks[0];
            assert.ok(testTask !== undefined, 'Should have at least one task');

            const tagName = 'test-remove-tag';

            // First add the task to a tag
            await provider.addTaskToTag(testTask, tagName);
            await sleep(500);

            // Verify it was added
            let configContent = fs.readFileSync(tagConfigPath, 'utf8');
            let config = JSON.parse(configContent) as TagConfig;
            const tagPatternsBefore = config.tags[tagName];
            assert.ok(tagPatternsBefore !== undefined, 'Tag should exist');
            assert.ok(
                tagPatternsBefore.includes(testTask.id),
                'Task should be in tag before removal'
            );

            // Now remove it
            await provider.removeTaskFromTag(testTask, tagName);
            await sleep(500);

            // Verify it was removed
            configContent = fs.readFileSync(tagConfigPath, 'utf8');
            config = JSON.parse(configContent) as TagConfig;

            // Tag should either not exist or not contain the task
            const tagPatterns = config.tags[tagName];
            if (tagPatterns !== undefined) {
                assert.ok(
                    !tagPatterns.includes(testTask.id),
                    'Task should not be in tag after removal'
                );
            }
        });

        test('getAllTags returns all defined tags', async function () {
            this.timeout(15000);

                        await provider.refresh();
            await sleep(500);

            const tags = provider.getAllTags();
            assert.ok(Array.isArray(tags), 'getAllTags should return an array');

            // Original config has build, test, deploy, debug, scripts, ci tags
            assert.ok(tags.includes('build'), 'Should include build tag');
            assert.ok(tags.includes('test'), 'Should include test tag');
        });
    });

    suite('Tag Command Behavior', () => {
        test('addTag command with undefined does not modify config', async function () {
            this.timeout(10000);

            // Get config before
            const configBefore = fs.readFileSync(tagConfigPath, 'utf8');

            // Call with undefined
            await vscode.commands.executeCommand('tasktree.addTag', undefined);
            await sleep(500);

            // Config should be unchanged
            const configAfter = fs.readFileSync(tagConfigPath, 'utf8');
            assert.strictEqual(configAfter, configBefore, 'Config should not change when addTag called with undefined');
        });

        test('removeTag command with undefined does not modify config', async function () {
            this.timeout(10000);

            // Get config before
            const configBefore = fs.readFileSync(tagConfigPath, 'utf8');

            // Call with undefined
            await vscode.commands.executeCommand('tasktree.removeTag', undefined);
            await sleep(500);

            // Config should be unchanged
            const configAfter = fs.readFileSync(tagConfigPath, 'utf8');
            assert.strictEqual(configAfter, configBefore, 'Config should not change when removeTag called with undefined');
        });
    });

    suite('Tag Config Persistence', () => {
        test('tag changes persist after refresh', async function () {
            this.timeout(20000);

                        await provider.refresh();
            await sleep(500);

            const tasks = provider.getAllTasks();
            const testTask = tasks[0];
            assert.ok(testTask !== undefined, 'Should have at least one task');

            const persistenceTag = 'persistence-test';

            // Add tag
            await provider.addTaskToTag(testTask, persistenceTag);
            await sleep(500);

            // Refresh and check
            await provider.refresh();
            await sleep(500);

            const updatedTags = provider.getAllTags();
            assert.ok(
                updatedTags.includes(persistenceTag),
                'Tag should persist after refresh'
            );
        });

        test('multiple tasks can be added to same tag', async function () {
            this.timeout(20000);

                        await provider.refresh();
            await sleep(500);

            const tasks = provider.getAllTasks();
            assert.ok(tasks.length >= 2, 'Need at least 2 tasks for this test');

            const task1 = tasks[0];
            const task2 = tasks[1];
            assert.ok(task1 !== undefined && task2 !== undefined);

            const multiTag = 'multi-task-tag';

            // Add both tasks
            await provider.addTaskToTag(task1, multiTag);
            await provider.addTaskToTag(task2, multiTag);
            await sleep(500);

            // Verify both are in the config
            const configContent = fs.readFileSync(tagConfigPath, 'utf8');
            const config = JSON.parse(configContent) as TagConfig;

            const patterns = config.tags[multiTag];
            assert.ok(patterns !== undefined, 'Tag should exist');
            assert.ok(patterns.includes(task1.id), 'Should contain first task');
            assert.ok(patterns.includes(task2.id), 'Should contain second task');
        });

        test('removing last task from tag removes the tag', async function () {
            this.timeout(20000);

                        await provider.refresh();
            await sleep(500);

            const tasks = provider.getAllTasks();
            const testTask = tasks[0];
            assert.ok(testTask !== undefined);

            const singleTaskTag = 'single-task-tag';

            // Add single task
            await provider.addTaskToTag(testTask, singleTaskTag);
            await sleep(500);

            // Verify it exists
            let configContent = fs.readFileSync(tagConfigPath, 'utf8');
            let config = JSON.parse(configContent) as TagConfig;
            assert.ok(
                config.tags[singleTaskTag] !== undefined,
                'Tag should exist after adding task'
            );

            // Remove the task
            await provider.removeTaskFromTag(testTask, singleTaskTag);
            await sleep(500);

            // Verify tag is removed
            configContent = fs.readFileSync(tagConfigPath, 'utf8');
            config = JSON.parse(configContent) as TagConfig;
            assert.ok(
                config.tags[singleTaskTag] === undefined,
                'Tag should be removed when empty'
            );
        });
    });

    suite('Tag UI Integration', () => {
        test('addTag and removeTag are in view item context menu', function () {
            this.timeout(10000);

            // Read package.json to verify menu configuration
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

    suite('Tag Pattern Matching', () => {
        test('structured type pattern matches tasks by type', async function () {
            this.timeout(15000);

            await provider.refresh();
            await sleep(500);

            // Set up a structured pattern that matches by type
            const config: TagConfig = {
                tags: {
                    'deep-match': [{ type: 'shell' }]  // Match all shell scripts
                }
            };
            fs.writeFileSync(tagConfigPath, JSON.stringify(config, null, 4));

            await provider.refresh();
            await sleep(500);

            const allTasks = provider.getAllTasks();
            const taggedTasks = allTasks.filter(t => t.tags.includes('deep-match'));

            // Should match shell tasks (we have shell scripts in fixtures)
            assert.ok(taggedTasks.length > 0, 'Structured type pattern should match shell tasks');
            for (const task of taggedTasks) {
                assert.strictEqual(task.type, 'shell', 'All matched tasks should be shell type');
            }
        });

        test('structured type pattern matches all npm tasks', async function () {
            this.timeout(15000);

            await provider.refresh();
            await sleep(500);

            const config: TagConfig = {
                tags: {
                    'single-match': [{ type: 'npm' }]
                }
            };
            fs.writeFileSync(tagConfigPath, JSON.stringify(config, null, 4));

            await provider.refresh();
            await sleep(500);

            const allTasks = provider.getAllTasks();
            const taggedTasks = allTasks.filter(t => t.tags.includes('single-match'));

            // Should match npm tasks (we have npm scripts in fixtures)
            assert.ok(taggedTasks.length > 0, 'Structured type pattern should match npm tasks');
            for (const task of taggedTasks) {
                assert.strictEqual(task.type, 'npm', 'All matched tasks should be npm type');
            }
        });

        test('exact task ID pattern matches only that task', async function () {
            this.timeout(15000);

            await provider.refresh();
            await sleep(500);

            const allTasks = provider.getAllTasks();
            assert.ok(allTasks.length > 0, 'Should have tasks');

            const testTask = allTasks[0];
            assert.ok(testTask !== undefined, 'First task should exist');

            const config: TagConfig = {
                tags: {
                    'exact-match': [testTask.id]
                }
            };
            fs.writeFileSync(tagConfigPath, JSON.stringify(config, null, 4));

            await provider.refresh();
            await sleep(500);

            const refreshedTasks = provider.getAllTasks();
            const taggedTasks = refreshedTasks.filter(t => t.tags.includes('exact-match'));

            assert.strictEqual(taggedTasks.length, 1, 'Exact ID should match exactly one task');
            const taggedTask = taggedTasks[0];
            assert.ok(taggedTask !== undefined, 'Tagged task should exist');
            assert.strictEqual(taggedTask.id, testTask.id, 'Should match the correct task');
        });

        test('structured type+label pattern matches specific tasks', async function () {
            this.timeout(15000);

            // Use structured pattern to match npm tasks with label "build"
            const config: TagConfig = {
                tags: {
                    'type-match': [{ type: 'npm', label: 'build' }]
                }
            };
            fs.writeFileSync(tagConfigPath, JSON.stringify(config, null, 4));

            await provider.refresh();
            await sleep(500);

            const allTasks = provider.getAllTasks();
            const taggedTasks = allTasks.filter(t => t.tags.includes('type-match'));

            // CRITICAL: Must have at least one match to validate the pattern works
            assert.ok(taggedTasks.length > 0, 'Pattern { type: npm, label: build } must match at least one task');

            // Verify ALL matched tasks have correct type and label
            for (const task of taggedTasks) {
                assert.strictEqual(task.type, 'npm', 'All matched tasks must be npm type');
                assert.strictEqual(task.label, 'build', 'All matched tasks must have label "build"');
            }
        });

        test('plain label without glob does NOT match', async function () {
            this.timeout(15000);

            const config: TagConfig = {
                tags: {
                    'plain-label': ['build']  // No glob, no type: prefix
                }
            };
            fs.writeFileSync(tagConfigPath, JSON.stringify(config, null, 4));

            await provider.refresh();
            await sleep(500);

            const allTasks = provider.getAllTasks();
            const taggedTasks = allTasks.filter(t => t.tags.includes('plain-label'));

            // Plain labels without glob should NOT match (safety feature)
            assert.strictEqual(taggedTasks.length, 0, 'Plain label should not match tasks');
        });
    });

    suite('Tag Config Edge Cases', () => {
        test('empty tags object is handled', async function () {
            this.timeout(15000);

            const config: TagConfig = {
                tags: {}
            };
            fs.writeFileSync(tagConfigPath, JSON.stringify(config, null, 4));

            await provider.refresh();
            await sleep(500);

            const tags = provider.getAllTags();
            assert.strictEqual(tags.length, 0, 'Should have no tags');
        });

        test('missing tags property is handled', async function () {
            this.timeout(15000);

            // Write config without tags property
            fs.writeFileSync(tagConfigPath, JSON.stringify({}, null, 4));

            await provider.refresh();
            await sleep(500);

            const tags = provider.getAllTags();
            assert.strictEqual(tags.length, 0, 'Should handle missing tags property');
        });

        test('editTags command opens config file', async function () {
            this.timeout(15000);

            // Execute editTags command
            await vscode.commands.executeCommand('tasktree.editTags');
            await sleep(1500);

            // Check if a document is open
            const openEditors = vscode.window.visibleTextEditors;
            const configEditor = openEditors.find(e => e.document.uri.fsPath.includes('tasktree.json'));

            assert.ok(configEditor !== undefined, 'Config file should be open in editor');

            // Close the editor
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
        });

        test('adding duplicate task to tag does not create duplicate', async function () {
            this.timeout(15000);

            await provider.refresh();
            const allTasks = provider.getAllTasks();
            const testTask = allTasks[0];
            assert.ok(testTask !== undefined, 'Should have a task');

            const tagName = 'no-duplicates';

            // Add task twice
            await provider.addTaskToTag(testTask, tagName);
            await provider.addTaskToTag(testTask, tagName);
            await sleep(500);

            // Verify only one entry
            const configContent = fs.readFileSync(tagConfigPath, 'utf8');
            const config = JSON.parse(configContent) as TagConfig;
            const patterns = config.tags[tagName] ?? [];

            const matchingPatterns = patterns.filter(p => p === testTask.id);
            assert.strictEqual(matchingPatterns.length, 1, 'Should have only one entry for the task');
        });

        test('removing task from non-existent tag does not create the tag', async function () {
            this.timeout(15000);

            await provider.refresh();
            const allTasks = provider.getAllTasks();
            const testTask = allTasks[0];
            assert.ok(testTask !== undefined, 'Should have a task');

            const tagName = 'non-existent-tag-xyz';

            // Try to remove from non-existent tag
            await provider.removeTaskFromTag(testTask, tagName);
            await sleep(500);

            // Verify the tag was NOT created
            const configContent = fs.readFileSync(tagConfigPath, 'utf8');
            const config = JSON.parse(configContent) as TagConfig;
            assert.ok(config.tags[tagName] === undefined, 'Non-existent tag should not be created by remove operation');
        });

        test('special characters in task ID are handled', async function () {
            this.timeout(15000);

            await provider.refresh();
            const allTasks = provider.getAllTasks();

            // Find a task with special chars in path (like subproject tasks)
            const taskWithPath = allTasks.find(t => t.filePath.includes('/'));

            // Skip test if no suitable task found - use Mocha's skip mechanism
            if (taskWithPath === undefined) {
                return this.skip();
            }

            const tagName = 'special-chars-test';

            await provider.addTaskToTag(taskWithPath, tagName);
            await sleep(500);

            const configContent = fs.readFileSync(tagConfigPath, 'utf8');
            const config = JSON.parse(configContent) as TagConfig;

            assert.ok(config.tags[tagName] !== undefined, 'Tag should be created');
            assert.ok(config.tags[tagName].includes(taskWithPath.id), 'Task with special chars should be added');

            // Clean up
            await provider.removeTaskFromTag(taskWithPath, tagName);
        });
    });

    /**
     * PROOF TESTS: These verify that tagging ACTUALLY affects the tree view.
     * Tags must be visible in task.tags when retrieved via getChildren().
     */
    suite('PROOF: Tags Actually Appear In Tree View', () => {
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

        test('PROOF: Tagged task has tag visible in tree view', async function () {
            this.timeout(30000);

            // Step 1: Get a task to tag
            await provider.refresh();
            await sleep(500);

            const allTasks = provider.getAllTasks();
            assert.ok(allTasks.length > 0, 'Must have tasks to test');

            const taskToTag = allTasks[0];
            assert.ok(taskToTag !== undefined, 'First task must exist');

            const testTagName = 'proof-visible-tag';

            // Step 2: Tag the task
            await provider.addTaskToTag(taskToTag, testTagName);
            await sleep(500);

            // Step 3: CRITICAL - Get task from tree view and verify tag is visible
            const tasksInTree = await collectAllTasksFromTree(provider);
            const taggedTaskInTree = tasksInTree.find(t => t.id === taskToTag.id);

            assert.ok(
                taggedTaskInTree !== undefined,
                `Task "${taskToTag.label}" must appear in tree`
            );

            assert.ok(
                taggedTaskInTree.tags.includes(testTagName),
                `PROOF FAILED: Task "${taskToTag.label}" was tagged with "${testTagName}" but ` +
                `tag is NOT visible in tree view! Visible tags: [${taggedTaskInTree.tags.join(', ')}]`
            );

            // Clean up
            await provider.removeTaskFromTag(taskToTag, testTagName);
        });

        test('PROOF: Filtering by tag shows ONLY tagged tasks in tree', async function () {
            this.timeout(30000);

            // Step 1: Set up a tag with specific tasks
            const config: TagConfig = {
                tags: {
                    'filter-proof-tag': [{ type: 'npm' }]
                }
            };
            fs.writeFileSync(tagConfigPath, JSON.stringify(config, null, 4));

            await provider.refresh();
            await sleep(1000);

            // Step 2: Verify some tasks have the tag
            const allTasks = provider.getAllTasks();
            const taggedTasks = allTasks.filter(t => t.tags.includes('filter-proof-tag'));
            assert.ok(taggedTasks.length > 0, 'Must have tagged tasks');
            assert.ok(taggedTasks.length < allTasks.length, 'Not ALL tasks should be tagged');

            // Step 3: Apply tag filter
            provider.setTagFilter('filter-proof-tag');
            await sleep(500);

            // Step 4: CRITICAL - Every task in tree must have the tag
            const tasksInTree = await collectAllTasksFromTree(provider);

            assert.ok(
                tasksInTree.length > 0,
                'Filtered tree must show at least one task'
            );

            for (const task of tasksInTree) {
                assert.ok(
                    task.tags.includes('filter-proof-tag'),
                    `PROOF FAILED: Task "${task.label}" appears in filtered tree but ` +
                    `does NOT have tag "filter-proof-tag"! Tags: [${task.tags.join(', ')}]`
                );
            }

            // Step 5: Verify correct count
            assert.strictEqual(
                tasksInTree.length,
                taggedTasks.length,
                `Tree should show exactly ${taggedTasks.length} tagged tasks, not ${tasksInTree.length}`
            );

            // Clean up
            provider.clearFilters();
        });

        test('PROOF: Removing tag makes task disappear from filtered view', async function () {
            this.timeout(30000);

            // Step 1: Get a task and add it to a tag
            await provider.refresh();
            await sleep(500);

            const allTasks = provider.getAllTasks();
            const taskToTag = allTasks[0];
            assert.ok(taskToTag !== undefined, 'Must have a task');

            const tagName = 'remove-proof-tag';
            await provider.addTaskToTag(taskToTag, tagName);
            await sleep(500);

            // Step 2: Filter by that tag - task should appear
            provider.setTagFilter(tagName);
            await sleep(500);

            let tasksInTree = await collectAllTasksFromTree(provider);
            let taskInView = tasksInTree.find(t => t.id === taskToTag.id);
            assert.ok(
                taskInView !== undefined,
                'Task must appear in filtered view after tagging'
            );

            // Step 3: Remove the tag
            await provider.removeTaskFromTag(taskToTag, tagName);
            await sleep(500);

            // Step 4: CRITICAL - Task must disappear from filtered view
            tasksInTree = await collectAllTasksFromTree(provider);
            taskInView = tasksInTree.find(t => t.id === taskToTag.id);

            assert.ok(
                taskInView === undefined,
                `PROOF FAILED: Task "${taskToTag.label}" was untagged but STILL appears ` +
                `in filtered view for tag "${tagName}"!`
            );

            // Clean up
            provider.clearFilters();
        });
    });
});
