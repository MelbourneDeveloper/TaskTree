/**
 * FILTERING E2E TESTS
 *
 * These tests verify the filtering configuration and command registration.
 *
 * ⛔️⛔️⛔️ E2E TEST RULES ⛔️⛔️⛔️
 *
 * LEGAL:
 * ✅ Checking the UI
 *
 * ILLEGAL:
 * ❌ provider.setTextFilter() - internal method
 * ❌ provider.setTagFilter() - internal method
 * ❌ provider.clearFilters() - internal method
 * ❌ provider.refresh() - internal method
 * ❌ vscode.commands.executeCommand('tasktree.refresh')
 *
 * Note: The actual filter commands (tasktree.filter, tasktree.filterByTag)
 * open QuickPick dialogs that require user interaction. These cannot be
 * easily tested in automated E2E tests without mock injection.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import {
    activateExtension,
    sleep,
    getFixturePath,
    getTaskTreeProvider
} from './helpers';

interface TagPattern {
    id?: string;
    type?: string;
    label?: string;
}

interface TagConfig {
    tags: Record<string, Array<string | TagPattern>>;
}

suite('Task Filtering E2E Tests', () => {
    let originalConfig: string;
    const tagConfigPath = getFixturePath('.vscode/tasktree.json');

    suiteSetup(async function() {
        this.timeout(30000);
        await activateExtension();
        // Save original config
        if (fs.existsSync(tagConfigPath)) {
            originalConfig = fs.readFileSync(tagConfigPath, 'utf8');
        } else {
            originalConfig = JSON.stringify({ tags: {} }, null, 4);
        }
        await sleep(2000);
    });

    suiteTeardown(async function() {
        this.timeout(10000);
        // Restore original config - file watcher should auto-sync
        fs.writeFileSync(tagConfigPath, originalConfig);
        await sleep(3000);
    });

    suite('Filter Commands Registration', () => {
        test('filter command is registered', async function() {
            this.timeout(10000);

            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('tasktree.filter'), 'filter command should be registered');
        });

        test('clearFilter command is registered', async function() {
            this.timeout(10000);

            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('tasktree.clearFilter'), 'clearFilter command should be registered');
        });

        test('filterByTag command is registered', async function() {
            this.timeout(10000);

            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('tasktree.filterByTag'), 'filterByTag command should be registered');
        });

        test('editTags command is registered', async function() {
            this.timeout(10000);

            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('tasktree.editTags'), 'editTags command should be registered');
        });
    });

    suite('Tag Configuration File Structure', () => {
        test('tag configuration file exists in fixtures', function() {
            this.timeout(10000);

            assert.ok(fs.existsSync(tagConfigPath), 'tasktree.json should exist');
        });

        test('tag configuration has valid JSON structure', function() {
            this.timeout(10000);

            const content = JSON.parse(fs.readFileSync(tagConfigPath, 'utf8')) as TagConfig;
            assert.ok('tags' in content, 'Config should have tags property');
            assert.ok(typeof content.tags === 'object', 'Tags should be an object');
        });

        test('tag configuration has expected tags', function() {
            this.timeout(10000);

            const content = JSON.parse(fs.readFileSync(tagConfigPath, 'utf8')) as TagConfig;

            assert.ok('build' in content.tags, 'Should have build tag');
            assert.ok(content.tags['test'], 'Should have test tag');
            assert.ok(content.tags['deploy'], 'Should have deploy tag');
            assert.ok(content.tags['debug'], 'Should have debug tag');
            assert.ok(content.tags['scripts'], 'Should have scripts tag');
            assert.ok(content.tags['ci'], 'Should have ci tag');
        });

        test('tag patterns use structured objects with label', function() {
            this.timeout(10000);

            const tagConfig = JSON.parse(fs.readFileSync(tagConfigPath, 'utf8')) as TagConfig;

            // Check build tag patterns - should have structured patterns
            const buildPatterns = tagConfig.tags['build'];
            assert.ok(buildPatterns, 'build tag should exist');
            assert.ok(
                buildPatterns.some(p => typeof p === 'object' && 'label' in p && p.label === 'build'),
                'build tag should have label pattern'
            );
            assert.ok(
                buildPatterns.some(p => typeof p === 'object' && 'type' in p && p.type === 'npm'),
                'build tag should have npm type pattern'
            );
        });

        test('tag patterns use structured objects with type', function() {
            this.timeout(10000);

            const tagConfig = JSON.parse(fs.readFileSync(tagConfigPath, 'utf8')) as TagConfig;

            // Check debug tag patterns - should have type pattern for launch
            const debugPatterns = tagConfig.tags['debug'];
            assert.ok(debugPatterns, 'debug tag should exist');
            assert.ok(
                debugPatterns.some(p => typeof p === 'object' && 'type' in p && p.type === 'launch'),
                'debug tag should have launch type pattern'
            );
        });

        test('ci tag has multiple npm script patterns', function() {
            this.timeout(10000);

            const tagConfig = JSON.parse(fs.readFileSync(tagConfigPath, 'utf8')) as TagConfig;

            const ciPatterns = tagConfig.tags['ci'];
            assert.ok(ciPatterns, 'ci tag should exist');
            assert.ok(
                ciPatterns.some(p => typeof p === 'object' && p.type === 'npm' && p.label === 'lint'),
                'ci should include lint pattern'
            );
            assert.ok(
                ciPatterns.some(p => typeof p === 'object' && p.type === 'npm' && p.label === 'test'),
                'ci should include test pattern'
            );
            assert.ok(
                ciPatterns.some(p => typeof p === 'object' && p.type === 'npm' && p.label === 'build'),
                'ci should include build pattern'
            );
        });

        test('tags in config are lowercase', function() {
            this.timeout(10000);

            const tagConfig = JSON.parse(fs.readFileSync(tagConfigPath, 'utf8')) as TagConfig;

            // Tags should be lowercase
            assert.ok(tagConfig.tags['build'] !== undefined, 'Should have lowercase build tag');
            assert.ok(tagConfig.tags['test'] !== undefined, 'Should have lowercase test tag');
        });
    });

    suite('Edit Tags Command', () => {
        test('editTags command opens configuration file', async function() {
            this.timeout(15000);

            // Close all editors first
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
            await sleep(500);

            // Execute editTags
            await vscode.commands.executeCommand('tasktree.editTags');
            await sleep(1000);

            // Check if an editor was opened
            const activeEditor = vscode.window.activeTextEditor;
            assert.ok(activeEditor !== undefined, 'editTags should open an editor');

            const fileName = activeEditor.document.fileName;
            assert.ok(fileName.includes('tasktree.json'), 'Should open tasktree.json');

            // Clean up
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        });
    });

    suite('Tag Configuration Auto-Sync', () => {
        test('tags from config are applied to tasks automatically', async function() {
            this.timeout(30000);

            const provider = getTaskTreeProvider();

            // Write config with a tag that matches npm tasks
            const config: TagConfig = {
                tags: {
                    'auto-sync-tag': [{ type: 'npm' }]
                }
            };
            fs.writeFileSync(tagConfigPath, JSON.stringify(config, null, 4));

            // Wait for file watcher to auto-sync - NO refresh call!
            await sleep(3000);

            // OBSERVE: Check if npm tasks have the tag
            const allTasks = provider.getAllTasks();
            const npmTasks = allTasks.filter(t => t.type === 'npm');
            const taggedTasks = allTasks.filter(t => t.tags.includes('auto-sync-tag'));

            assert.ok(npmTasks.length > 0, 'Should have npm tasks');
            assert.strictEqual(
                taggedTasks.length,
                npmTasks.length,
                `CRITICAL: File watcher should auto-apply tags! Expected ${npmTasks.length} tagged tasks, got ${taggedTasks.length}. ` +
                `File watcher may not be working!`
            );
        });

        test('getAllTags returns tags from config after write', async function() {
            this.timeout(30000);

            const provider = getTaskTreeProvider();

            // Write config with specific tags
            const config: TagConfig = {
                tags: {
                    'tag-alpha': [{ type: 'npm' }],
                    'tag-beta': [{ type: 'shell' }],
                    'tag-gamma': [{ type: 'make' }]
                }
            };
            fs.writeFileSync(tagConfigPath, JSON.stringify(config, null, 4));

            // Wait for file watcher to auto-sync
            await sleep(3000);

            // OBSERVE: getAllTags should include new tags
            const tags = provider.getAllTags();

            assert.ok(tags.includes('tag-alpha'), 'Should have tag-alpha');
            assert.ok(tags.includes('tag-beta'), 'Should have tag-beta');
            assert.ok(tags.includes('tag-gamma'), 'Should have tag-gamma');
        });

        test('empty tags config results in no tags on tasks', async function() {
            this.timeout(30000);

            const provider = getTaskTreeProvider();

            // Write empty tags config
            const config: TagConfig = {
                tags: {}
            };
            fs.writeFileSync(tagConfigPath, JSON.stringify(config, null, 4));

            // Wait for file watcher to auto-sync
            await sleep(3000);

            // OBSERVE: No tasks should have tags
            const allTasks = provider.getAllTasks();
            const tasksWithTags = allTasks.filter(t => t.tags.length > 0);

            assert.strictEqual(
                tasksWithTags.length,
                0,
                `Expected 0 tasks with tags after clearing config, got ${tasksWithTags.length}`
            );
        });

        test('invalid JSON config is handled gracefully', async function() {
            this.timeout(30000);

            const provider = getTaskTreeProvider();

            // First, set up valid config
            fs.writeFileSync(tagConfigPath, JSON.stringify({ tags: { test: [{ type: 'npm' }] } }, null, 4));
            await sleep(3000);

            // Write invalid JSON
            fs.writeFileSync(tagConfigPath, '{ invalid json }');
            await sleep(3000);

            // OBSERVE: Provider should still work
            const tags = provider.getAllTags();
            assert.ok(Array.isArray(tags), 'getAllTags should return array even with invalid config');

            // Extension should not crash - tasks should still be accessible
            const tasks = provider.getAllTasks();
            assert.ok(Array.isArray(tasks), 'getAllTasks should still work');
        });

        test('missing tags property is handled gracefully', async function() {
            this.timeout(30000);

            const provider = getTaskTreeProvider();

            // Write config without tags property
            fs.writeFileSync(tagConfigPath, JSON.stringify({ version: '1.0' }, null, 2));
            await sleep(3000);

            // OBSERVE: Provider should return empty tags array
            const tags = provider.getAllTags();
            assert.strictEqual(tags.length, 0, 'Missing tags property should result in empty tags');
        });

        test('config change adds new tags to matching tasks', async function() {
            this.timeout(30000);

            const provider = getTaskTreeProvider();

            // Start with no tags
            fs.writeFileSync(tagConfigPath, JSON.stringify({ tags: {} }, null, 4));
            await sleep(3000);

            // Verify no tasks have our test tag
            let allTasks = provider.getAllTasks();
            const taggedBefore = allTasks.filter(t => t.tags.includes('config-change-tag'));
            assert.strictEqual(taggedBefore.length, 0, 'No tasks should have tag before config change');

            // Write config with new tag
            const config: TagConfig = {
                tags: {
                    'config-change-tag': [{ type: 'shell' }]
                }
            };
            fs.writeFileSync(tagConfigPath, JSON.stringify(config, null, 4));

            // Wait for file watcher to auto-sync
            await sleep(3000);

            // OBSERVE: Shell tasks should now have the tag
            allTasks = provider.getAllTasks();
            const shellTasks = allTasks.filter(t => t.type === 'shell');
            const taggedAfter = allTasks.filter(t => t.tags.includes('config-change-tag'));

            assert.ok(shellTasks.length > 0, 'Should have shell tasks');
            assert.strictEqual(
                taggedAfter.length,
                shellTasks.length,
                `After config change, expected ${shellTasks.length} tagged tasks, got ${taggedAfter.length}. ` +
                `File watcher may not be auto-syncing!`
            );
        });
    });

    suite('Tag Pattern Matching Verification', () => {
        test('type pattern matches all tasks of that type', async function() {
            this.timeout(30000);

            const provider = getTaskTreeProvider();

            // Write config with type pattern
            const config: TagConfig = {
                tags: {
                    'type-pattern-test': [{ type: 'make' }]
                }
            };
            fs.writeFileSync(tagConfigPath, JSON.stringify(config, null, 4));
            await sleep(3000);

            // OBSERVE: All make tasks should have the tag
            const allTasks = provider.getAllTasks();
            const makeTasks = allTasks.filter(t => t.type === 'make');
            const taggedTasks = allTasks.filter(t => t.tags.includes('type-pattern-test'));

            assert.ok(makeTasks.length > 0, 'Should have make tasks');

            for (const task of makeTasks) {
                assert.ok(
                    task.tags.includes('type-pattern-test'),
                    `Make task "${task.label}" should have tag but has: [${task.tags.join(', ')}]`
                );
            }

            assert.strictEqual(taggedTasks.length, makeTasks.length, 'Only make tasks should have the tag');
        });

        test('label pattern matches tasks with that label', async function() {
            this.timeout(30000);

            const provider = getTaskTreeProvider();

            // Write config with label pattern
            const config: TagConfig = {
                tags: {
                    'label-pattern-test': [{ label: 'build' }]
                }
            };
            fs.writeFileSync(tagConfigPath, JSON.stringify(config, null, 4));
            await sleep(3000);

            // OBSERVE: All tasks with label 'build' should have the tag
            const allTasks = provider.getAllTasks();
            const buildLabelTasks = allTasks.filter(t => t.label === 'build');
            const taggedTasks = allTasks.filter(t => t.tags.includes('label-pattern-test'));

            assert.ok(buildLabelTasks.length > 0, 'Should have tasks with label "build"');

            for (const task of buildLabelTasks) {
                assert.ok(
                    task.tags.includes('label-pattern-test'),
                    `Task "${task.label}" (${task.type}) should have tag`
                );
            }

            assert.strictEqual(taggedTasks.length, buildLabelTasks.length, 'Only "build" label tasks should have the tag');
        });

        test('combined type+label pattern matches specific tasks', async function() {
            this.timeout(30000);

            const provider = getTaskTreeProvider();

            // Write config with type+label pattern
            const config: TagConfig = {
                tags: {
                    'combined-pattern-test': [{ type: 'npm', label: 'build' }]
                }
            };
            fs.writeFileSync(tagConfigPath, JSON.stringify(config, null, 4));
            await sleep(3000);

            // OBSERVE: Only npm tasks with label 'build' should have the tag
            const allTasks = provider.getAllTasks();
            const npmBuildTasks = allTasks.filter(t => t.type === 'npm' && t.label === 'build');
            const taggedTasks = allTasks.filter(t => t.tags.includes('combined-pattern-test'));

            assert.ok(npmBuildTasks.length > 0, 'Should have npm:build task');

            for (const task of taggedTasks) {
                assert.strictEqual(task.type, 'npm', 'Tagged task type should be npm');
                assert.strictEqual(task.label, 'build', 'Tagged task label should be build');
            }

            assert.strictEqual(taggedTasks.length, npmBuildTasks.length, 'Only npm:build tasks should have the tag');
        });

        test('task can have multiple tags from different patterns', async function() {
            this.timeout(30000);

            const provider = getTaskTreeProvider();

            // Write config with multiple tags matching same task
            const config: TagConfig = {
                tags: {
                    'multi-tag-1': [{ type: 'npm' }],
                    'multi-tag-2': [{ label: 'build' }],
                    'multi-tag-3': [{ type: 'npm', label: 'build' }]
                }
            };
            fs.writeFileSync(tagConfigPath, JSON.stringify(config, null, 4));
            await sleep(3000);

            // OBSERVE: npm:build task should have all three tags
            const allTasks = provider.getAllTasks();
            const npmBuildTask = allTasks.find(t => t.type === 'npm' && t.label === 'build');

            assert.ok(npmBuildTask !== undefined, 'Should have npm:build task');
            assert.ok(npmBuildTask.tags.includes('multi-tag-1'), 'Should have multi-tag-1');
            assert.ok(npmBuildTask.tags.includes('multi-tag-2'), 'Should have multi-tag-2');
            assert.ok(npmBuildTask.tags.includes('multi-tag-3'), 'Should have multi-tag-3');
        });
    });
});
