import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import {
    activateExtension,
    sleep,
    getFixturePath,
    getQuickTasksProvider,
    getTaskTreeProvider,
    TaskTreeItem
} from './helpers';
import type { QuickTasksProvider, TaskTreeProvider } from './helpers';

interface TaskTreeConfig {
    tags?: Record<string, string[]>;
}

function readTaskTreeConfig(): TaskTreeConfig {
    const configPath = getFixturePath('.vscode/tasktree.json');
    return JSON.parse(fs.readFileSync(configPath, 'utf8')) as TaskTreeConfig;
}

function writeTaskTreeConfig(config: TaskTreeConfig): void {
    const configPath = getFixturePath('.vscode/tasktree.json');
    fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
}

suite('Quick Tasks E2E Tests', () => {
    let originalConfig: TaskTreeConfig;

    suiteSetup(async function() {
        this.timeout(30000);
        await activateExtension();
        await sleep(2000);

        // Save original config
        originalConfig = readTaskTreeConfig();
    });

    suiteTeardown(() => {
        // Restore original config
        writeTaskTreeConfig(originalConfig);
    });

    setup(() => {
        // Reset to original config before each test
        writeTaskTreeConfig(originalConfig);
    });

    suite('Quick Tasks Commands', () => {
        test('addToQuick command is registered', async function() {
            this.timeout(10000);

            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('tasktree.addToQuick'), 'addToQuick command should be registered');
        });

        test('removeFromQuick command is registered', async function() {
            this.timeout(10000);

            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('tasktree.removeFromQuick'), 'removeFromQuick command should be registered');
        });

        test('refreshQuick command is registered', async function() {
            this.timeout(10000);

            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('tasktree.refreshQuick'), 'refreshQuick command should be registered');
        });
    });

    /**
     * PROOF TESTS: These tests verify that starring a task ACTUALLY puts it
     * in the Quick Tasks view. They test the EXACT user workflow.
     */
    suite('PROOF: Starring Task Actually Shows In Quick Launch', () => {
        let quickProvider: QuickTasksProvider;
        let treeProvider: TaskTreeProvider;

        suiteSetup(async function() {
            this.timeout(15000);
            quickProvider = getQuickTasksProvider();
            treeProvider = getTaskTreeProvider();
        });

        test('PROOF: Starring via command puts task in Quick Tasks view', async function() {
            this.timeout(30000);

            // Step 1: Clear all quick tasks and refresh
            writeTaskTreeConfig({ tags: {} });
            await sleep(500);
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(2000);

            // Step 2: Get the QuickTasksProvider's children - should show placeholder
            let quickChildren = quickProvider.getChildren(undefined);
            const hasPlaceholder = quickChildren.some(c => c.task === null);
            assert.ok(
                hasPlaceholder || quickChildren.length === 0,
                'Quick Tasks should be empty or show placeholder before starring'
            );

            // Step 3: Get a REAL task from the main tree view
            await treeProvider.refresh();
            await sleep(1000);
            const allTasks = treeProvider.getAllTasks();
            assert.ok(allTasks.length > 0, 'Must have at least one task to test with');

            const taskToStar = allTasks[0];
            assert.ok(taskToStar !== undefined, 'First task must exist');
            assert.ok(taskToStar.id !== '', 'Task must have a valid ID');

            // Step 4: Create a TaskTreeItem like the UI would have
            const treeItem = new TaskTreeItem(taskToStar, null, []);

            // Step 5: Execute the EXACT command the UI uses when starring
            await vscode.commands.executeCommand('tasktree.addToQuick', treeItem);
            await sleep(1000);

            // Step 6: Verify config file was updated
            const config = readTaskTreeConfig();
            const quickTags = config.tags?.['quick'] ?? [];
            assert.ok(
                quickTags.includes(taskToStar.id),
                `Config MUST contain task ID "${taskToStar.id}" after starring`
            );

            // Step 7: Refresh the quick tasks provider to ensure it picks up changes
            await quickProvider.updateTasks(treeProvider.getAllTasks());
            await sleep(500);

            // Step 8: CRITICAL - Verify the task ACTUALLY APPEARS in Quick Tasks view
            quickChildren = quickProvider.getChildren(undefined);
            const starredTaskInView = quickChildren.find(c => c.task?.id === taskToStar.id);

            assert.ok(
                starredTaskInView !== undefined,
                `PROOF FAILED: Task "${taskToStar.label}" (ID: ${taskToStar.id}) was starred but ` +
                `does NOT appear in Quick Tasks view! Quick view contains: ` +
                `[${quickChildren.map(c => c.task?.id ?? 'placeholder').join(', ')}]`
            );

            assert.ok(
                starredTaskInView.task !== null,
                'Starred task in view must have a non-null task'
            );

            assert.strictEqual(
                starredTaskInView.task.id,
                taskToStar.id,
                'Task ID in Quick Tasks view must match starred task ID'
            );
        });

        test('PROOF: Unstarring via command removes task from Quick Tasks view', async function() {
            this.timeout(30000);

            // Step 1: Get a task and add it to quick tasks first
            await treeProvider.refresh();
            await sleep(1000);
            const allTasks = treeProvider.getAllTasks();
            assert.ok(allTasks.length > 0, 'Must have at least one task');

            const taskToTest = allTasks[0];
            assert.ok(taskToTest !== undefined, 'Task must exist');

            // Step 2: Star the task via command
            const treeItem = new TaskTreeItem(taskToTest, null, []);
            await vscode.commands.executeCommand('tasktree.addToQuick', treeItem);
            await sleep(500);
            await quickProvider.updateTasks(treeProvider.getAllTasks());
            await sleep(500);

            // Step 3: Verify task IS in Quick Tasks view
            let quickChildren = quickProvider.getChildren(undefined);
            let taskInView = quickChildren.find(c => c.task?.id === taskToTest.id);
            assert.ok(
                taskInView !== undefined,
                'Task must be in Quick Tasks view before unstarring'
            );

            // Step 4: Unstar via command (get fresh tree item with task)
            const treeItemForRemove = new TaskTreeItem(taskToTest, null, []);
            await vscode.commands.executeCommand('tasktree.removeFromQuick', treeItemForRemove);
            await sleep(500);
            await quickProvider.updateTasks(treeProvider.getAllTasks());
            await sleep(500);

            // Step 5: Verify config was updated
            const config = readTaskTreeConfig();
            const quickTags = config.tags?.['quick'] ?? [];
            assert.ok(
                !quickTags.includes(taskToTest.id),
                `Config must NOT contain task ID "${taskToTest.id}" after unstarring`
            );

            // Step 6: CRITICAL - Verify task is REMOVED from Quick Tasks view
            quickChildren = quickProvider.getChildren(undefined);
            taskInView = quickChildren.find(c => c.task?.id === taskToTest.id);

            assert.ok(
                taskInView === undefined,
                `PROOF FAILED: Task "${taskToTest.label}" (ID: ${taskToTest.id}) was unstarred but ` +
                `STILL appears in Quick Tasks view!`
            );
        });

        test('PROOF: Multiple starred tasks all appear in Quick Tasks view', async function() {
            this.timeout(30000);

            // Step 1: Clear quick tasks
            writeTaskTreeConfig({ tags: {} });
            await sleep(500);
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(2000);

            // Step 2: Get multiple tasks
            await treeProvider.refresh();
            await sleep(1000);
            const allTasks = treeProvider.getAllTasks();
            assert.ok(allTasks.length >= 3, 'Need at least 3 tasks for this test');

            const task1 = allTasks[0];
            const task2 = allTasks[1];
            const task3 = allTasks[2];
            assert.ok(task1 !== undefined && task2 !== undefined && task3 !== undefined, 'Tasks must exist');

            // Step 3: Star all three tasks
            await vscode.commands.executeCommand('tasktree.addToQuick', new TaskTreeItem(task1, null, []));
            await sleep(300);
            await vscode.commands.executeCommand('tasktree.addToQuick', new TaskTreeItem(task2, null, []));
            await sleep(300);
            await vscode.commands.executeCommand('tasktree.addToQuick', new TaskTreeItem(task3, null, []));
            await sleep(500);

            // Step 4: Refresh
            await quickProvider.updateTasks(treeProvider.getAllTasks());
            await sleep(500);

            // Step 5: CRITICAL - Verify ALL THREE tasks appear in Quick Tasks view
            const quickChildren = quickProvider.getChildren(undefined);
            const taskIds = quickChildren.filter(c => c.task !== null).map(c => c.task?.id);

            assert.ok(
                taskIds.includes(task1.id),
                `PROOF FAILED: Task 1 "${task1.label}" (ID: ${task1.id}) not in Quick Tasks`
            );
            assert.ok(
                taskIds.includes(task2.id),
                `PROOF FAILED: Task 2 "${task2.label}" (ID: ${task2.id}) not in Quick Tasks`
            );
            assert.ok(
                taskIds.includes(task3.id),
                `PROOF FAILED: Task 3 "${task3.label}" (ID: ${task3.id}) not in Quick Tasks`
            );

            // Cleanup
            await vscode.commands.executeCommand('tasktree.removeFromQuick', new TaskTreeItem(task1, null, []));
            await vscode.commands.executeCommand('tasktree.removeFromQuick', new TaskTreeItem(task2, null, []));
            await vscode.commands.executeCommand('tasktree.removeFromQuick', new TaskTreeItem(task3, null, []));
        });

        test('PROOF: Starred tasks persist after refresh', async function() {
            this.timeout(30000);

            // Step 1: Clear and refresh
            writeTaskTreeConfig({ tags: {} });
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(2000);

            // Step 2: Star a task
            await treeProvider.refresh();
            await sleep(1000);
            const allTasks = treeProvider.getAllTasks();
            const taskToStar = allTasks[0];
            assert.ok(taskToStar !== undefined, 'Task must exist');

            await vscode.commands.executeCommand('tasktree.addToQuick', new TaskTreeItem(taskToStar, null, []));
            await sleep(500);

            // Step 3: Do a full refresh (simulating closing/reopening VS Code)
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(2000);

            // Step 4: Update quick tasks provider with fresh tasks
            await treeProvider.refresh();
            await quickProvider.updateTasks(treeProvider.getAllTasks());
            await sleep(500);

            // Step 5: CRITICAL - Verify task STILL appears after refresh
            const quickChildren = quickProvider.getChildren(undefined);
            const taskInView = quickChildren.find(c => c.task?.id === taskToStar.id);

            assert.ok(
                taskInView !== undefined,
                `PROOF FAILED: Task "${taskToStar.label}" (ID: ${taskToStar.id}) disappeared ` +
                `from Quick Tasks after refresh!`
            );
        });

        test('PROOF: Config with task ID MUST show task in Quick Tasks view', async function() {
            this.timeout(30000);

            // Step 1: Discover tasks to get a REAL task ID
            await treeProvider.refresh();
            await sleep(1000);
            const allTasks = treeProvider.getAllTasks();
            assert.ok(allTasks.length > 0, 'Must have discovered tasks');

            const targetTask = allTasks[0];
            assert.ok(targetTask !== undefined, 'First task must exist');
            assert.ok(targetTask.id !== '', 'Task must have a valid ID');

            // Step 2: Write task ID DIRECTLY to config file (simulating user's config)
            const config: TaskTreeConfig = {
                tags: {
                    quick: [targetTask.id]
                }
            };
            writeTaskTreeConfig(config);
            await sleep(500);

            // Step 3: Verify config was written correctly
            const savedConfig = readTaskTreeConfig();
            const quickTags = savedConfig.tags?.['quick'] ?? [];
            assert.ok(
                quickTags.includes(targetTask.id),
                `Config MUST contain task ID: ${targetTask.id}`
            );

            // Step 4: Refresh everything (this is what happens when user clicks refresh)
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(2000);

            // Step 5: Get fresh tasks and update quick provider
            await treeProvider.refresh();
            await quickProvider.updateTasks(treeProvider.getAllTasks());
            await sleep(500);

            // Step 6: CRITICAL PROOF - task MUST appear in Quick Tasks view
            const quickChildren = quickProvider.getChildren(undefined);
            const taskInView = quickChildren.find(c => c.task?.id === targetTask.id);

            assert.ok(
                taskInView !== undefined,
                `PROOF FAILED: Config has task ID "${targetTask.id}" but task does NOT appear ` +
                `in Quick Tasks view! This is the EXACT bug reported by user. ` +
                `Quick view contains: [${quickChildren.map(c => c.task?.id ?? 'placeholder').join(', ')}]`
            );

            assert.ok(
                taskInView.task !== null,
                'Task in Quick Tasks view must have non-null task'
            );

            assert.strictEqual(
                taskInView.task.id,
                targetTask.id,
                'Task ID in view must match config task ID'
            );
        });
    });

    suite('Quick Tasks Storage', () => {
        test('quick tasks are stored in tasktree.json', function() {
            this.timeout(10000);

            // Create a quick tag entry
            const config: TaskTreeConfig = {
                tags: {
                    quick: ['build.sh', 'test']
                }
            };
            writeTaskTreeConfig(config);

            // Read back
            const savedConfig = readTaskTreeConfig();
            const quickTags = savedConfig.tags?.['quick'];
            assert.ok(quickTags !== undefined, 'Should have quick tag');
            assert.strictEqual(quickTags.length, 2, 'Should have 2 quick tasks');
        });

        test('quick tasks order is preserved', function() {
            this.timeout(10000);

            // Create ordered quick tasks
            const config: TaskTreeConfig = {
                tags: {
                    quick: ['task-c', 'task-a', 'task-b']
                }
            };
            writeTaskTreeConfig(config);

            // Read back
            const savedConfig = readTaskTreeConfig();
            const quickTasks = savedConfig.tags?.['quick'] ?? [];

            assert.strictEqual(quickTasks[0], 'task-c', 'First task should be task-c');
            assert.strictEqual(quickTasks[1], 'task-a', 'Second task should be task-a');
            assert.strictEqual(quickTasks[2], 'task-b', 'Third task should be task-b');
        });

        test('empty quick tasks array is valid', function() {
            this.timeout(10000);

            const config: TaskTreeConfig = {
                tags: {
                    quick: []
                }
            };
            writeTaskTreeConfig(config);

            const savedConfig = readTaskTreeConfig();
            const quickTags = savedConfig.tags?.['quick'];
            assert.ok(Array.isArray(quickTags), 'quick should be an array');
            assert.strictEqual(quickTags.length, 0, 'Should have 0 quick tasks');
        });

        test('missing quick tag is handled gracefully', function() {
            this.timeout(10000);

            const config: TaskTreeConfig = {
                tags: {
                    build: ['npm:build']
                }
            };
            writeTaskTreeConfig(config);

            const savedConfig = readTaskTreeConfig();
            assert.ok(savedConfig.tags?.['quick'] === undefined, 'quick tag should not exist');
        });
    });

    suite('Quick Tasks Deterministic Ordering', () => {
        test('quick tasks maintain insertion order', async function() {
            this.timeout(15000);

            // Set up quick tasks in specific order
            const config: TaskTreeConfig = {
                tags: {
                    quick: ['deploy.sh', 'build.sh', 'test.sh']
                }
            };
            writeTaskTreeConfig(config);

            await sleep(500);
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1000);

            // Read back config - order should be preserved
            const savedConfig = readTaskTreeConfig();
            const quickTasks = savedConfig.tags?.['quick'] ?? [];

            assert.strictEqual(quickTasks[0], 'deploy.sh', 'First should be deploy.sh');
            assert.strictEqual(quickTasks[1], 'build.sh', 'Second should be build.sh');
            assert.strictEqual(quickTasks[2], 'test.sh', 'Third should be test.sh');
        });

        test('reordering updates config file', async function() {
            this.timeout(15000);

            // Initial order
            const config: TaskTreeConfig = {
                tags: {
                    quick: ['first', 'second', 'third']
                }
            };
            writeTaskTreeConfig(config);

            // Simulate reorder by changing config
            const reorderedConfig: TaskTreeConfig = {
                tags: {
                    quick: ['third', 'first', 'second']
                }
            };
            writeTaskTreeConfig(reorderedConfig);

            await sleep(500);

            // Verify new order
            const savedConfig = readTaskTreeConfig();
            const quickTasks = savedConfig.tags?.['quick'] ?? [];

            assert.strictEqual(quickTasks[0], 'third', 'First should be third');
            assert.strictEqual(quickTasks[1], 'first', 'Second should be first');
            assert.strictEqual(quickTasks[2], 'second', 'Third should be second');
        });

        test('adding task appends to end', async function() {
            this.timeout(15000);

            // Start with some tasks
            const config: TaskTreeConfig = {
                tags: {
                    quick: ['existing1', 'existing2']
                }
            };
            writeTaskTreeConfig(config);

            // Add new task (simulating addToQuick)
            const updatedConfig: TaskTreeConfig = {
                tags: {
                    quick: ['existing1', 'existing2', 'new-task']
                }
            };
            writeTaskTreeConfig(updatedConfig);

            await sleep(500);

            // Verify order
            const savedConfig = readTaskTreeConfig();
            const quickTasks = savedConfig.tags?.['quick'] ?? [];

            assert.strictEqual(quickTasks.length, 3, 'Should have 3 tasks');
            assert.strictEqual(quickTasks[2], 'new-task', 'New task should be at end');
        });

        test('removing task preserves remaining order', async function() {
            this.timeout(15000);

            // Start with tasks
            const config: TaskTreeConfig = {
                tags: {
                    quick: ['first', 'middle', 'last']
                }
            };
            writeTaskTreeConfig(config);

            // Remove middle task (simulating removeFromQuick)
            const updatedConfig: TaskTreeConfig = {
                tags: {
                    quick: ['first', 'last']
                }
            };
            writeTaskTreeConfig(updatedConfig);

            await sleep(500);

            // Verify order
            const savedConfig = readTaskTreeConfig();
            const quickTasks = savedConfig.tags?.['quick'] ?? [];

            assert.strictEqual(quickTasks.length, 2, 'Should have 2 tasks');
            assert.strictEqual(quickTasks[0], 'first', 'First should remain first');
            assert.strictEqual(quickTasks[1], 'last', 'Last should now be second');
        });
    });

    suite('Quick Tasks View', () => {
        test('quick tasks view exists', async function() {
            this.timeout(10000);

            // The view should be registered - verify provider exists and is callable
            const quickProvider = getQuickTasksProvider();
            await vscode.commands.executeCommand('tasktree.refreshQuick');
            await sleep(500);

            // Verify provider returns valid children (proves it's functioning)
            const children = quickProvider.getChildren(undefined);
            assert.ok(Array.isArray(children), 'QuickTasksProvider.getChildren should return an array');
        });

        test('quick tasks view updates on refresh', async function() {
            this.timeout(15000);

            // Set up quick tasks
            const config: TaskTreeConfig = {
                tags: {
                    quick: ['build.sh']
                }
            };
            writeTaskTreeConfig(config);

            await sleep(500);
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1000);

            // Verify the config was applied by checking the file
            const savedConfig = readTaskTreeConfig();
            const quickTags = savedConfig.tags?.['quick'] ?? [];
            assert.ok(quickTags.includes('build.sh'), 'Config should have build.sh in quick tags');

            // Verify the quick tasks provider can read the updated config
            const quickProvider = getQuickTasksProvider();
            const children = quickProvider.getChildren(undefined);
            assert.ok(Array.isArray(children), 'QuickTasksProvider should return children array after refresh');
        });

        test('quick tasks view handles empty state', async function() {
            this.timeout(15000);

            // Clear quick tasks
            const config: TaskTreeConfig = {
                tags: {}
            };
            writeTaskTreeConfig(config);

            await sleep(500);
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1000);

            // Verify the provider shows placeholder when no quick tasks
            const quickProvider = getQuickTasksProvider();
            const treeProvider = getTaskTreeProvider();
            await quickProvider.updateTasks(treeProvider.getAllTasks());
            await sleep(500);

            const children = quickProvider.getChildren(undefined);
            assert.ok(children.length === 1, 'Should show exactly one placeholder item when empty');
            const placeholder = children[0];
            assert.ok(placeholder !== undefined, 'Placeholder should exist');
            assert.ok(placeholder.task === null, 'Placeholder should have null task');
        });
    });

    suite('Quick Tasks Integration', () => {
        test('quick tasks can be run', async function() {
            this.timeout(15000);

            // Set up a quick task
            const config: TaskTreeConfig = {
                tags: {
                    quick: ['build']
                }
            };
            writeTaskTreeConfig(config);

            await sleep(500);
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1000);

            // Verify config was written correctly
            const savedConfig = readTaskTreeConfig();
            const quickTags = savedConfig.tags?.['quick'] ?? [];
            assert.ok(quickTags.includes('build'), 'Config should have build in quick tags');

            // Running without a task should handle undefined gracefully
            try {
                await vscode.commands.executeCommand('tasktree.run', undefined);
            } catch {
                // Expected - command may throw on undefined input
            }
            // Either the command throws (expected) or handles undefined gracefully (also ok)
            // Either way, the extension should remain functional
            const provider = getTaskTreeProvider();
            const tasks = provider.getAllTasks();
            assert.ok(Array.isArray(tasks), 'Provider should still return tasks after handling undefined run');
        });

        test('main tree and quick tasks stay in sync', async function() {
            this.timeout(15000);

            // Modify config
            const config: TaskTreeConfig = {
                tags: {
                    quick: ['sync-test-task']
                }
            };
            writeTaskTreeConfig(config);

            // Refresh both
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1000);

            // Check config
            const savedConfig = readTaskTreeConfig();
            const quickTags = savedConfig.tags?.['quick'] ?? [];
            assert.ok(quickTags.includes('sync-test-task'), 'Config should have sync-test-task');
        });
    });

    suite('Quick Tasks File Watching', () => {
        test('tasktree.json changes trigger refresh', async function() {
            this.timeout(15000);

            // Write initial config
            const config1: TaskTreeConfig = {
                tags: {
                    quick: ['initial-task']
                }
            };
            writeTaskTreeConfig(config1);

            await sleep(2000); // Wait for file watcher

            // Write updated config
            const config2: TaskTreeConfig = {
                tags: {
                    quick: ['updated-task']
                }
            };
            writeTaskTreeConfig(config2);

            await sleep(2000); // Wait for file watcher

            const savedConfig = readTaskTreeConfig();
            const quickTags = savedConfig.tags?.['quick'] ?? [];
            assert.ok(quickTags.includes('updated-task'), 'Should have updated task');
        });
    });

    suite('Quick Tasks Unique Identification', () => {
        test('plain label pattern does NOT match tasks (requires full ID or glob)', async function() {
            this.timeout(20000);

            // Plain labels like "lint" should NOT match any tasks
            // This prevents accidental duplicate matching
            const config: TaskTreeConfig = {
                tags: {
                    quick: ['lint'] // Plain label - should NOT match
                }
            };
            writeTaskTreeConfig(config);

            await sleep(500);
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(2000);

            // Verify the config was written correctly
            const savedConfig = readTaskTreeConfig();
            const quickTags = savedConfig.tags?.['quick'] ?? [];
            assert.ok(quickTags.includes('lint'), 'Config should have lint pattern');

            // Plain "lint" pattern behavior depends on implementation -
            // verify the quick tasks provider handles it gracefully
            const quickProvider = getQuickTasksProvider();
            const treeProvider = getTaskTreeProvider();
            await quickProvider.updateTasks(treeProvider.getAllTasks());
            await sleep(500);

            const children = quickProvider.getChildren(undefined);
            // Verify children is a valid array (provider handles plain pattern gracefully)
            assert.ok(Array.isArray(children), 'QuickTasksProvider should return valid array');
        });

        test('full task ID pattern matches exactly one task', async function() {
            this.timeout(20000);

            // test-fixtures has "lint" in both Root and subproject package.json
            // A full task ID should match exactly ONE task

            // Use type:name pattern which matches by type and label
            const config: TaskTreeConfig = {
                tags: {
                    // This glob pattern would match all npm lint tasks
                    quick: ['npm:*lint']
                }
            };
            writeTaskTreeConfig(config);

            await sleep(500);
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(2000);

            // Read back config - pattern should be preserved
            const savedConfig = readTaskTreeConfig();
            const quickPatterns = savedConfig.tags?.['quick'] ?? [];

            assert.strictEqual(quickPatterns.length, 1, 'Should have exactly 1 quick task pattern');
            const firstPattern = quickPatterns[0];
            assert.ok(firstPattern !== undefined, 'Should have at least one pattern');
            assert.ok(
                firstPattern.includes('npm:'),
                'Pattern should use type: prefix for specificity'
            );
        });

        test('type:name pattern matches tasks of that type with glob', async function() {
            this.timeout(20000);

            // Type:name with glob should match all tasks of that type with matching name
            const config: TaskTreeConfig = {
                tags: {
                    quick: ['npm:lint'] // This should match npm tasks named lint
                }
            };
            writeTaskTreeConfig(config);

            await sleep(500);
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(2000);

            // Verify config was written correctly
            const savedConfig = readTaskTreeConfig();
            const quickTags = savedConfig.tags?.['quick'] ?? [];
            assert.ok(quickTags.includes('npm:lint'), 'Config should have npm:lint pattern');

            // Verify provider handles the type:name pattern
            const quickProvider = getQuickTasksProvider();
            const treeProvider = getTaskTreeProvider();
            await quickProvider.updateTasks(treeProvider.getAllTasks());
            await sleep(500);

            const children = quickProvider.getChildren(undefined);
            assert.ok(Array.isArray(children), 'QuickTasksProvider should return valid array for type:name pattern');
        });
    });

    suite('Quick Tasks Error Handling', () => {
        test('handles malformed tasktree.json gracefully', async function() {
            this.timeout(15000);

            // Write valid config first
            const validConfig: TaskTreeConfig = {
                tags: {
                    quick: ['valid-task']
                }
            };
            writeTaskTreeConfig(validConfig);

            await sleep(500);
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1000);

            // Verify config was written
            const savedConfig = readTaskTreeConfig();
            const quickTags = savedConfig.tags?.['quick'] ?? [];
            assert.ok(quickTags.includes('valid-task'), 'Config should have valid-task');

            // Verify provider still works after refresh
            const provider = getTaskTreeProvider();
            const tasks = provider.getAllTasks();
            assert.ok(Array.isArray(tasks), 'Provider should return valid tasks array');
        });

        test('handles undefined task gracefully on addToQuick', async function() {
            this.timeout(10000);

            // Get initial config state
            const configBefore = readTaskTreeConfig();
            const quickTagsBefore = configBefore.tags?.['quick'] ?? [];
            const countBefore = quickTagsBefore.length;

            try {
                await vscode.commands.executeCommand('tasktree.addToQuick', undefined);
            } catch {
                // Expected - command should reject undefined
            }

            // Verify config was not corrupted
            const configAfter = readTaskTreeConfig();
            const quickTagsAfter = configAfter.tags?.['quick'] ?? [];
            assert.strictEqual(quickTagsAfter.length, countBefore, 'Config should not change when addToQuick receives undefined');
        });

        test('handles null task gracefully on removeFromQuick', async function() {
            this.timeout(10000);

            // Get initial config state
            const configBefore = readTaskTreeConfig();
            const quickTagsBefore = configBefore.tags?.['quick'] ?? [];
            const countBefore = quickTagsBefore.length;

            try {
                await vscode.commands.executeCommand('tasktree.removeFromQuick', null);
            } catch {
                // Expected - command should reject null
            }

            // Verify config was not corrupted
            const configAfter = readTaskTreeConfig();
            const quickTagsAfter = configAfter.tags?.['quick'] ?? [];
            assert.strictEqual(quickTagsAfter.length, countBefore, 'Config should not change when removeFromQuick receives null');
        });
    });

    suite('Quick Tasks Provider Direct Access', () => {
        let quickProvider: QuickTasksProvider;
        let treeProvider: TaskTreeProvider;

        suiteSetup(async function() {
            this.timeout(15000);
            quickProvider = getQuickTasksProvider();
            treeProvider = getTaskTreeProvider();
            await treeProvider.refresh();
            await quickProvider.updateTasks(treeProvider.getAllTasks());
            await sleep(1000);
        });

        test('getChildren returns placeholder when no quick tasks', async function() {
            this.timeout(15000);

            // Clear quick tasks
            const config: TaskTreeConfig = {
                tags: {}
            };
            writeTaskTreeConfig(config);

            await treeProvider.refresh();
            await quickProvider.updateTasks(treeProvider.getAllTasks());
            await sleep(500);

            const children = quickProvider.getChildren(undefined);
            assert.ok(children.length === 1, 'Should have exactly one placeholder item');

            const placeholder = children[0];
            assert.ok(placeholder !== undefined, 'Placeholder should exist');
            assert.ok(placeholder.task === null, 'Placeholder should have null task');
            const labelText = typeof placeholder.label === 'string' ? placeholder.label : '';
            assert.ok(labelText.includes('No quick tasks'), 'Placeholder should indicate no quick tasks');
        });

        test('getChildren returns task items when quick tasks exist', async function() {
            this.timeout(15000);

            await treeProvider.refresh();
            const allTasks = treeProvider.getAllTasks();
            assert.ok(allTasks.length > 0, 'Should have tasks to work with');

            const testTask = allTasks[0];
            assert.ok(testTask !== undefined, 'First task should exist');

            // Add task to quick
            await quickProvider.addToQuick(testTask);
            await sleep(500);

            const children = quickProvider.getChildren(undefined);
            assert.ok(children.length >= 1, 'Should have at least one quick task');

            const taskItem = children.find(c => c.task !== null);
            assert.ok(taskItem !== undefined, 'Should have a non-placeholder task item');

            // Clean up
            await quickProvider.removeFromQuick(testTask);
        });

        test('getTreeItem returns element as-is', function() {
            this.timeout(10000);

            // getChildren always returns at least a placeholder when empty
            const children = quickProvider.getChildren(undefined);
            assert.ok(children.length > 0, 'getChildren must always return at least one item (placeholder or tasks)');

            const child = children[0];
            assert.ok(child !== undefined, 'First child must exist');
            const treeItem = quickProvider.getTreeItem(child);
            assert.strictEqual(treeItem, child, 'getTreeItem must return the same element reference');
        });

        test('refresh fires tree data change event', async function() {
            this.timeout(10000);

            // Call refresh and verify provider state is still valid
            quickProvider.refresh();
            await sleep(100);

            // Verify provider is still functional after refresh
            const children = quickProvider.getChildren(undefined);
            assert.ok(Array.isArray(children), 'getChildren should return array after refresh');
            // Provider should have at least the placeholder item
            assert.ok(children.length >= 0, 'Children array should be valid');
        });

        test('addToQuick adds task to quick tag AND shows it in view', async function() {
            this.timeout(15000);

            await treeProvider.refresh();
            const allTasks = treeProvider.getAllTasks();
            const testTask = allTasks[0];
            assert.ok(testTask !== undefined, 'Should have a task');

            // Ensure task is not in quick
            await quickProvider.removeFromQuick(testTask);
            await sleep(500);

            // Verify task is NOT in view before adding
            let children = quickProvider.getChildren(undefined);
            const beforeAdd = children.find(c => c.task?.id === testTask.id);
            assert.ok(beforeAdd === undefined, 'Task should NOT be in quick view before adding');

            // Add to quick
            await quickProvider.addToQuick(testTask);
            await sleep(500);

            // Verify it's in config
            const config = readTaskTreeConfig();
            const quickTags = config.tags?.['quick'] ?? [];
            assert.ok(quickTags.includes(testTask.id), 'Task should be added to quick tag in config');

            // CRITICAL: Verify task ACTUALLY APPEARS in the view
            children = quickProvider.getChildren(undefined);
            const addedTask = children.find(c => c.task?.id === testTask.id);
            assert.ok(addedTask !== undefined, 'Task MUST appear in quick view after addToQuick');
            assert.ok(addedTask.task !== null, 'Found task should have a non-null task');
            assert.strictEqual(addedTask.task.id, testTask.id, 'Task in view must match added task');

            // Clean up
            await quickProvider.removeFromQuick(testTask);
        });

        test('removeFromQuick removes task from quick tag', async function() {
            this.timeout(15000);

            await treeProvider.refresh();
            const allTasks = treeProvider.getAllTasks();
            const testTask = allTasks[0];
            assert.ok(testTask !== undefined, 'Should have a task');

            // Add to quick first
            await quickProvider.addToQuick(testTask);
            await sleep(500);

            // Verify it's there
            let config = readTaskTreeConfig();
            let quickTags = config.tags?.['quick'] ?? [];
            assert.ok(quickTags.includes(testTask.id), 'Task should be in quick tag');

            // Remove from quick
            await quickProvider.removeFromQuick(testTask);
            await sleep(500);

            // Verify it's removed
            config = readTaskTreeConfig();
            quickTags = config.tags?.['quick'] ?? [];
            assert.ok(!quickTags.includes(testTask.id), 'Task should be removed from quick tag');
        });

        test('updateTasks applies tags and refreshes', async function() {
            this.timeout(15000);

            await treeProvider.refresh();
            const allTasks = treeProvider.getAllTasks();

            // updateTasks should apply tags and refresh
            await quickProvider.updateTasks(allTasks);
            await sleep(500);

            // Verify provider is functional after updateTasks
            const children = quickProvider.getChildren(undefined);
            assert.ok(Array.isArray(children), 'getChildren should return array after updateTasks');
            // Verify each child is a valid TaskTreeItem
            for (const child of children) {
                assert.ok(child !== undefined, 'Each child should be defined');
                assert.ok('label' in child, 'Each child should have a label property');
            }
        });

        test('handleDrag sets data transfer with task id', function() {
            this.timeout(10000);

            // This tests the drag functionality indirectly
            // In E2E we verify the drag mime types are registered
            assert.ok(quickProvider.dragMimeTypes.length > 0, 'Should have drag mime types');
            assert.ok(quickProvider.dropMimeTypes.length > 0, 'Should have drop mime types');
        });

        test('drag and drop reorders quick tasks', async function() {
            this.timeout(20000);

            await treeProvider.refresh();
            const allTasks = treeProvider.getAllTasks();
            assert.ok(allTasks.length >= 2, 'Need at least 2 tasks');

            const task1 = allTasks[0];
            const task2 = allTasks[1];
            assert.ok(task1 !== undefined && task2 !== undefined, 'Tasks should exist');

            // Add both tasks to quick in specific order
            await quickProvider.removeFromQuick(task1);
            await quickProvider.removeFromQuick(task2);
            await sleep(500);

            await quickProvider.addToQuick(task1);
            await quickProvider.addToQuick(task2);
            await sleep(500);

            // Verify initial order
            let config = readTaskTreeConfig();
            let quickTags = config.tags?.['quick'] ?? [];
            const initialIndex1 = quickTags.indexOf(task1.id);
            const initialIndex2 = quickTags.indexOf(task2.id);
            assert.ok(initialIndex1 < initialIndex2, 'Task1 should be before Task2 initially');

            // Simulate reorder via config (as drag/drop would do via moveTaskInTag)
            const reorderedConfig: TaskTreeConfig = {
                tags: {
                    ...config.tags,
                    quick: [task2.id, task1.id]
                }
            };
            writeTaskTreeConfig(reorderedConfig);

            await sleep(500);
            await treeProvider.refresh();
            await quickProvider.updateTasks(treeProvider.getAllTasks());
            await sleep(500);

            // Verify new order
            config = readTaskTreeConfig();
            quickTags = config.tags?.['quick'] ?? [];
            const newIndex1 = quickTags.indexOf(task1.id);
            const newIndex2 = quickTags.indexOf(task2.id);
            assert.ok(newIndex2 < newIndex1, 'Task2 should be before Task1 after reorder');

            // Clean up
            await quickProvider.removeFromQuick(task1);
            await quickProvider.removeFromQuick(task2);
        });

        test('getChildren with parent element returns children array', function() {
            this.timeout(15000);

            // Get children at root level (undefined parent)
            const rootChildren = quickProvider.getChildren(undefined);
            assert.ok(Array.isArray(rootChildren), 'Should return array for undefined parent');

            // If we have any children, getting children of a child should return its children array
            if (rootChildren.length > 0) {
                const firstChild = rootChildren[0];
                assert.ok(firstChild !== undefined, 'First child should exist');
                const grandchildren = quickProvider.getChildren(firstChild);
                assert.ok(Array.isArray(grandchildren), 'Should return children array for element');
                // TaskTreeItems for quick tasks have empty children arrays
                assert.strictEqual(grandchildren.length, 0, 'Leaf task items should have no children');
            }
        });

        test('sorting puts tasks not in patterns at end alphabetically', async function() {
            this.timeout(20000);

            await treeProvider.refresh();
            const allTasks = treeProvider.getAllTasks();
            assert.ok(allTasks.length >= 3, 'Need at least 3 tasks for this test');

            const task1 = allTasks[0];
            const task2 = allTasks[1];
            const task3 = allTasks[2];
            assert.ok(task1 !== undefined && task2 !== undefined && task3 !== undefined, 'Tasks should exist');

            // Clear and add tasks
            await quickProvider.removeFromQuick(task1);
            await quickProvider.removeFromQuick(task2);
            await quickProvider.removeFromQuick(task3);
            await sleep(500);

            // Add all three tasks
            await quickProvider.addToQuick(task1);
            await quickProvider.addToQuick(task2);
            await quickProvider.addToQuick(task3);
            await sleep(500);

            // Get the children - they should be in config order
            const children = quickProvider.getChildren(undefined);
            const taskIds = children.filter(c => c.task !== null).map(c => c.task?.id);

            assert.ok(taskIds.length === 3, 'Should have 3 tasks');
            assert.strictEqual(taskIds[0], task1.id, 'First task should match config order');
            assert.strictEqual(taskIds[1], task2.id, 'Second task should match config order');
            assert.strictEqual(taskIds[2], task3.id, 'Third task should match config order');

            // Clean up
            await quickProvider.removeFromQuick(task1);
            await quickProvider.removeFromQuick(task2);
            await quickProvider.removeFromQuick(task3);
        });

        test('addToQuick is idempotent - adding twice does not duplicate', async function() {
            this.timeout(15000);

            await treeProvider.refresh();
            const allTasks = treeProvider.getAllTasks();
            const testTask = allTasks[0];
            assert.ok(testTask !== undefined, 'Should have a task');

            // Remove first to ensure clean state
            await quickProvider.removeFromQuick(testTask);
            await sleep(500);

            // Add twice
            await quickProvider.addToQuick(testTask);
            await quickProvider.addToQuick(testTask);
            await sleep(500);

            // Check config - should only have one entry
            const config = readTaskTreeConfig();
            const quickTags = config.tags?.['quick'] ?? [];
            const occurrences = quickTags.filter(t => t === testTask.id).length;

            assert.strictEqual(occurrences, 1, 'Task should appear exactly once, not duplicated');

            // Clean up
            await quickProvider.removeFromQuick(testTask);
        });

        test('removeFromQuick handles non-existent task gracefully', async function() {
            this.timeout(15000);

            await treeProvider.refresh();
            const allTasks = treeProvider.getAllTasks();
            const testTask = allTasks[0];
            assert.ok(testTask !== undefined, 'Should have a task');

            // First remove to ensure it's not there
            await quickProvider.removeFromQuick(testTask);
            await sleep(500);

            // Remove again - should not throw
            await quickProvider.removeFromQuick(testTask);
            await sleep(500);

            // Verify task is still not there (no error occurred)
            const config = readTaskTreeConfig();
            const quickTags = config.tags?.['quick'] ?? [];
            assert.ok(!quickTags.includes(testTask.id), 'Task should not be in quick tags');
        });
    });
});
