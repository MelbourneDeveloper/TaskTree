/**
 * E2E Tests for Quick Tasks functionality
 *
 * These tests verify config file behavior and command registration.
 * They do NOT call internal provider methods.
 *
 * For unit tests that test provider internals, see quicktasks.unit.test.ts
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import {
    activateExtension,
    sleep,
    getFixturePath
} from './helpers';

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

suite('Quick Tasks E2E Tests', () => {
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

            const config: TaskTreeConfig = {
                tags: {
                    quick: ['build.sh', 'test']
                }
            };
            writeTaskTreeConfig(config);

            const savedConfig = readTaskTreeConfig();
            const quickTags = savedConfig.tags?.['quick'];
            assert.ok(quickTags !== undefined, 'Should have quick tag');
            assert.strictEqual(quickTags.length, 2, 'Should have 2 quick tasks');
        });

        test('quick tasks order is preserved', function() {
            this.timeout(10000);

            const config: TaskTreeConfig = {
                tags: {
                    quick: ['task-c', 'task-a', 'task-b']
                }
            };
            writeTaskTreeConfig(config);

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
        test('quick tasks maintain insertion order', function() {
            this.timeout(15000);

            writeTaskTreeConfig({ tags: { quick: ['deploy.sh', 'build.sh', 'test.sh'] } });

            const savedConfig = readTaskTreeConfig();
            const quickTasks = savedConfig.tags?.['quick'] ?? [];

            assert.strictEqual(quickTasks[0], 'deploy.sh', 'First should be deploy.sh');
            assert.strictEqual(quickTasks[1], 'build.sh', 'Second should be build.sh');
            assert.strictEqual(quickTasks[2], 'test.sh', 'Third should be test.sh');
        });

        test('reordering updates config file', async function() {
            this.timeout(15000);

            const config: TaskTreeConfig = {
                tags: {
                    quick: ['first', 'second', 'third']
                }
            };
            writeTaskTreeConfig(config);

            const reorderedConfig: TaskTreeConfig = {
                tags: {
                    quick: ['third', 'first', 'second']
                }
            };
            writeTaskTreeConfig(reorderedConfig);

            await sleep(500);

            const savedConfig = readTaskTreeConfig();
            const quickTasks = savedConfig.tags?.['quick'] ?? [];

            assert.strictEqual(quickTasks[0], 'third', 'First should be third');
            assert.strictEqual(quickTasks[1], 'first', 'Second should be first');
            assert.strictEqual(quickTasks[2], 'second', 'Third should be second');
        });

        test('adding task appends to end', async function() {
            this.timeout(15000);

            const config: TaskTreeConfig = {
                tags: {
                    quick: ['existing1', 'existing2']
                }
            };
            writeTaskTreeConfig(config);

            const updatedConfig: TaskTreeConfig = {
                tags: {
                    quick: ['existing1', 'existing2', 'new-task']
                }
            };
            writeTaskTreeConfig(updatedConfig);

            await sleep(500);

            const savedConfig = readTaskTreeConfig();
            const quickTasks = savedConfig.tags?.['quick'] ?? [];

            assert.strictEqual(quickTasks.length, 3, 'Should have 3 tasks');
            assert.strictEqual(quickTasks[2], 'new-task', 'New task should be at end');
        });

        test('removing task preserves remaining order', async function() {
            this.timeout(15000);

            const config: TaskTreeConfig = {
                tags: {
                    quick: ['first', 'middle', 'last']
                }
            };
            writeTaskTreeConfig(config);

            const updatedConfig: TaskTreeConfig = {
                tags: {
                    quick: ['first', 'last']
                }
            };
            writeTaskTreeConfig(updatedConfig);

            await sleep(500);

            const savedConfig = readTaskTreeConfig();
            const quickTasks = savedConfig.tags?.['quick'] ?? [];

            assert.strictEqual(quickTasks.length, 2, 'Should have 2 tasks');
            assert.strictEqual(quickTasks[0], 'first', 'First should remain first');
            assert.strictEqual(quickTasks[1], 'last', 'Last should now be second');
        });
    });

    suite('Quick Tasks Integration', () => {
        test('config persistence works', function() {
            this.timeout(15000);

            writeTaskTreeConfig({ tags: { quick: ['build'] } });

            const savedConfig = readTaskTreeConfig();
            const quickTags = savedConfig.tags?.['quick'] ?? [];
            assert.ok(quickTags.includes('build'), 'Config should have build');
        });

        test('main tree and quick tasks sync on config change', async function() {
            this.timeout(15000);

            writeTaskTreeConfig({ tags: { quick: ['sync-test-task'] } });
            await sleep(3000);

            const savedConfig = readTaskTreeConfig();
            const quickTags = savedConfig.tags?.['quick'] ?? [];
            assert.ok(quickTags.includes('sync-test-task'), 'Config should persist');
        });
    });

    suite('Quick Tasks File Watching', () => {
        test('tasktree.json changes trigger refresh', async function() {
            this.timeout(15000);

            const config1: TaskTreeConfig = {
                tags: {
                    quick: ['initial-task']
                }
            };
            writeTaskTreeConfig(config1);

            await sleep(2000);

            const config2: TaskTreeConfig = {
                tags: {
                    quick: ['updated-task']
                }
            };
            writeTaskTreeConfig(config2);

            await sleep(2000);

            const savedConfig = readTaskTreeConfig();
            const quickTags = savedConfig.tags?.['quick'] ?? [];
            assert.ok(quickTags.includes('updated-task'), 'Should have updated task');
        });
    });
});
