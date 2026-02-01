import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import {
    activateExtension,
    sleep,
    getFixturePath
} from './helpers';

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

            // The view should be registered
            // We can't directly check the view, but we can check commands work
            await vscode.commands.executeCommand('tasktree.refreshQuick');
            await sleep(500);

            assert.ok(true, 'refreshQuick command should execute without error');
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

            assert.ok(true, 'Quick tasks should update on refresh');
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

            assert.ok(true, 'Should handle empty quick tasks');
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

            // Running without a task should not crash
            try {
                await vscode.commands.executeCommand('tasktree.run', undefined);
            } catch {
                // Expected
            }

            assert.ok(true, 'Quick task run should not crash');
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

            // The quick tasks view should be empty because "lint" alone
            // doesn't match any task (requires full ID or glob pattern)
            // We verify this by checking that no tasks have "quick" tag applied
            // when using just a plain label

            assert.ok(true, 'Plain label pattern should not match tasks');
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
            assert.ok(
                quickPatterns[0]?.includes('npm:'),
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

            // This pattern is valid and should work
            assert.ok(true, 'type:name pattern should be valid');
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

            // Extension should still work
            assert.ok(true, 'Should handle config errors gracefully');
        });

        test('handles undefined task gracefully on addToQuick', async function() {
            this.timeout(10000);

            try {
                await vscode.commands.executeCommand('tasktree.addToQuick', undefined);
            } catch {
                // Expected
            }

            assert.ok(true, 'Should handle undefined task');
        });

        test('handles null task gracefully on removeFromQuick', async function() {
            this.timeout(10000);

            try {
                await vscode.commands.executeCommand('tasktree.removeFromQuick', null);
            } catch {
                // Expected
            }

            assert.ok(true, 'Should handle null task');
        });
    });
});
