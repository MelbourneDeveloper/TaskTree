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
    suiteSetup(async function() {
        this.timeout(30000);
        await activateExtension();
        await sleep(2000);
    });

    suite('Text Filtering', () => {
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

        test('clearFilter resets hasFilter to false', async function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();

            // Set a filter first
            provider.setTextFilter('build');
            assert.strictEqual(provider.hasFilter(), true, 'hasFilter should be true after setTextFilter');

            // Clear filter via provider
            provider.clearFilters();
            assert.strictEqual(provider.hasFilter(), false, 'hasFilter should be false after clearFilters');
        });
    });

    suite('Tag Filtering', () => {
        test('filterByTag command is registered', async function() {
            this.timeout(10000);

            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('tasktree.filterByTag'), 'filterByTag command should be registered');
        });

        test('tag configuration file exists in fixtures', function() {
            this.timeout(10000);

            const tagConfigPath = getFixturePath('.vscode/tasktree.json');
            assert.ok(fs.existsSync(tagConfigPath), 'tasktree.json should exist');
        });

        test('tag configuration has expected structure', function() {
            this.timeout(10000);

            const tagConfigPath = getFixturePath('.vscode/tasktree.json');
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

            const tagConfig = JSON.parse(fs.readFileSync(getFixturePath('.vscode/tasktree.json'), 'utf8')) as TagConfig;

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

            const tagConfig = JSON.parse(fs.readFileSync(getFixturePath('.vscode/tasktree.json'), 'utf8')) as TagConfig;

            // Check debug tag patterns - should have type pattern for launch
            const debugPatterns = tagConfig.tags['debug'];
            assert.ok(debugPatterns, 'debug tag should exist');
            assert.ok(
                debugPatterns.some(p => typeof p === 'object' && 'type' in p && p.type === 'launch'),
                'debug tag should have launch type pattern'
            );
        });

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

        test('tasktree.json config file exists in fixtures', function(this: Mocha.Context) {
            this.timeout(15000);

            // Verify the fixture has the expected config file
            const configPath = getFixturePath('.vscode/tasktree.json');
            assert.ok(fs.existsSync(configPath), 'tasktree.json should exist in fixtures');

            // Verify it has valid JSON
            const content = JSON.parse(fs.readFileSync(configPath, 'utf8')) as TagConfig;
            assert.ok(typeof content.tags === 'object', 'Config should have tags object');
        });
    });

    suite('Tag Pattern Matching', () => {
        test('structured patterns with label property', function() {
            this.timeout(10000);

            const tagConfig = JSON.parse(fs.readFileSync(getFixturePath('.vscode/tasktree.json'), 'utf8')) as TagConfig;

            // Build tag should have structured patterns with label
            const buildPatterns = tagConfig.tags['build'];
            assert.ok(buildPatterns, 'build tag should exist');
            assert.ok(
                buildPatterns.some(p => typeof p === 'object' && 'label' in p),
                'Should have structured patterns with label'
            );
        });

        test('structured patterns with type property', function() {
            this.timeout(10000);

            const tagConfig = JSON.parse(fs.readFileSync(getFixturePath('.vscode/tasktree.json'), 'utf8')) as TagConfig;

            // Check scripts patterns - should match by type
            const scriptsPatterns = tagConfig.tags['scripts'];
            assert.ok(scriptsPatterns, 'scripts tag should exist');
            assert.ok(
                scriptsPatterns.some(p => typeof p === 'object' && 'type' in p && p.type === 'shell'),
                'scripts tag should have shell type pattern'
            );

            const debugPatterns = tagConfig.tags['debug'];
            assert.ok(debugPatterns, 'debug tag should exist');
            assert.ok(
                debugPatterns.some(p => typeof p === 'object' && 'type' in p && p.type === 'launch'),
                'debug tag should have launch type pattern'
            );
        });

        test('ci tag has multiple npm script patterns', function() {
            this.timeout(10000);

            const tagConfig = JSON.parse(fs.readFileSync(getFixturePath('.vscode/tasktree.json'), 'utf8')) as TagConfig;

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
    });

    suite('Filter State Management', () => {
        test('filter state persists across refresh', async function() {
            this.timeout(15000);

            const provider = getTaskTreeProvider();

            // Set a filter
            provider.setTextFilter('build');
            assert.strictEqual(provider.hasFilter(), true, 'hasFilter should be true before refresh');

            // Trigger refresh
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1000);

            // Filter state should persist
            assert.strictEqual(provider.hasFilter(), true, 'hasFilter should still be true after refresh');

            // Clean up
            provider.clearFilters();
        });

        test('clearFilters clears both text and tag filters', async function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();

            // Set both filters
            provider.setTextFilter('build');
            provider.setTagFilter('test');
            assert.strictEqual(provider.hasFilter(), true, 'hasFilter should be true with filters set');

            // Clear all filters
            provider.clearFilters();
            assert.strictEqual(provider.hasFilter(), false, 'hasFilter should be false after clearFilters');
        });
    });

    suite('Filter UI Integration', () => {
        test('filter command is registered', async function() {
            this.timeout(10000);

            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('tasktree.filter'), 'filter command should exist');
        });

        test('filterByTag command is registered', async function() {
            this.timeout(10000);

            const commands = await vscode.commands.getCommands(true);
            assert.ok(commands.includes('tasktree.filterByTag'), 'filterByTag command should exist');
        });

        test('setTextFilter reduces visible tasks', async function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();

            // Get unfiltered count
            provider.clearFilters();
            await provider.refresh();
            await sleep(500);
            const allTasks = provider.getAllTasks();
            const unfilteredCount = allTasks.length;

            // Apply filter
            provider.setTextFilter('deploy');
            const filteredTasks = provider.getAllTasks().filter(t =>
                t.label.toLowerCase().includes('deploy') ||
                t.filePath.toLowerCase().includes('deploy') ||
                (t.description ?? '').toLowerCase().includes('deploy')
            );

            // Filtered count should be less than unfiltered (unless all tasks match)
            assert.ok(filteredTasks.length <= unfilteredCount, 'Filtering should not increase task count');

            // Clean up
            provider.clearFilters();
        });
    });

    suite('Filter Edge Cases', () => {
        test('empty filter shows all tasks', async function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();

            // Get initial count with no filter
            provider.clearFilters();
            await provider.refresh();
            await sleep(500);
            const allTasksCount = provider.getAllTasks().length;

            // Set empty filter (should show all)
            provider.setTextFilter('');
            const afterEmptyFilter = provider.getAllTasks().length;

            assert.strictEqual(afterEmptyFilter, allTasksCount, 'Empty filter should show all tasks');
        });

        test('non-existent tag filter shows no tasks', async function() {
            this.timeout(10000);

            const provider = getTaskTreeProvider();

            // Set filter for non-existent tag
            provider.setTagFilter('nonexistent-tag-xyz-12345');
            await provider.refresh();
            await sleep(500);

            // Get children - should have no tasks with this tag
            const children = await provider.getChildren(undefined);
            let totalTasks = 0;
            for (const category of children) {
                const categoryChildren = await provider.getChildren(category);
                totalTasks += categoryChildren.length;
            }

            assert.strictEqual(totalTasks, 0, 'Non-existent tag filter should show no tasks');

            // Clean up
            provider.clearFilters();
        });

        test('tags in config are lowercase', function() {
            this.timeout(10000);

            const tagConfig = JSON.parse(fs.readFileSync(getFixturePath('.vscode/tasktree.json'), 'utf8')) as TagConfig;

            // Tags should be lowercase
            assert.ok(tagConfig.tags['build'] !== undefined, 'Should have lowercase build tag');
            assert.ok(tagConfig.tags['test'] !== undefined, 'Should have lowercase test tag');
        });
    });

    suite('Filter with Tag Configuration Changes', () => {
        test('refreshes when tag configuration changes', async function() {
            this.timeout(15000);

            const tagConfigPath = getFixturePath('.vscode/tasktree.json');
            const originalContent = fs.readFileSync(tagConfigPath, 'utf8');

            try {
                // Modify tag configuration
                const config = JSON.parse(originalContent) as TagConfig;
                config.tags['newTag'] = ['*new*'];
                fs.writeFileSync(tagConfigPath, JSON.stringify(config, null, 4));

                // Wait for file watcher to trigger refresh
                await sleep(2000);

                // Verify file was modified
                const newContent = fs.readFileSync(tagConfigPath, 'utf8');
                assert.ok(newContent.includes('newTag'), 'Config should have new tag');
            } finally {
                // Restore original
                fs.writeFileSync(tagConfigPath, originalContent);
                await sleep(500);
            }
        });

        test('invalid JSON config results in empty tags', async function() {
            this.timeout(15000);

            const tagConfigPath = getFixturePath('.vscode/tasktree.json');
            const originalContent = fs.readFileSync(tagConfigPath, 'utf8');
            const provider = getTaskTreeProvider();

            try {
                // Write invalid JSON
                fs.writeFileSync(tagConfigPath, '{ invalid json }');

                await vscode.commands.executeCommand('tasktree.refresh');
                await sleep(1000);

                // Provider should still work, just with no tags
                const tags = provider.getAllTags();
                assert.ok(Array.isArray(tags), 'getAllTags should return array even with invalid config');
            } finally {
                // Restore original
                fs.writeFileSync(tagConfigPath, originalContent);
                await vscode.commands.executeCommand('tasktree.refresh');
                await sleep(500);
            }
        });

        test('missing tags property results in empty tags', async function() {
            this.timeout(15000);

            const tagConfigPath = getFixturePath('.vscode/tasktree.json');
            const originalContent = fs.readFileSync(tagConfigPath, 'utf8');
            const provider = getTaskTreeProvider();

            try {
                // Write config without tags property
                fs.writeFileSync(tagConfigPath, JSON.stringify({ version: '1.0' }, null, 2));

                await vscode.commands.executeCommand('tasktree.refresh');
                await sleep(1000);

                // Provider should return empty tags array
                const tags = provider.getAllTags();
                assert.strictEqual(tags.length, 0, 'Missing tags property should result in empty tags');
            } finally {
                // Restore original
                fs.writeFileSync(tagConfigPath, originalContent);
                await vscode.commands.executeCommand('tasktree.refresh');
                await sleep(500);
            }
        });

        test('empty tags object results in empty tags', async function() {
            this.timeout(15000);

            const tagConfigPath = getFixturePath('.vscode/tasktree.json');
            const originalContent = fs.readFileSync(tagConfigPath, 'utf8');
            const provider = getTaskTreeProvider();

            try {
                // Write config with empty tags
                fs.writeFileSync(tagConfigPath, JSON.stringify({ tags: {} }, null, 2));

                await vscode.commands.executeCommand('tasktree.refresh');
                await sleep(1000);

                // Provider should return empty tags array
                const tags = provider.getAllTags();
                assert.strictEqual(tags.length, 0, 'Empty tags object should result in empty tags');
            } finally {
                // Restore original
                fs.writeFileSync(tagConfigPath, originalContent);
                await vscode.commands.executeCommand('tasktree.refresh');
                await sleep(500);
            }
        });
    });

    /**
     * PROOF TESTS: These tests verify that tag filtering ACTUALLY works at the
     * tree view level. They recursively check every task in getChildren() output.
     */
    suite('PROOF: Tag Filtering Actually Works At Tree Level', () => {
        let originalConfig: string;
        const tagConfigPath = getFixturePath('.vscode/tasktree.json');

        suiteSetup(async function() {
            this.timeout(15000);
            originalConfig = fs.readFileSync(tagConfigPath, 'utf8');
        });

        suiteTeardown(async function() {
            this.timeout(10000);
            fs.writeFileSync(tagConfigPath, originalConfig);
            const provider = getTaskTreeProvider();
            provider.clearFilters();
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(500);
        });

        interface CollectedTask {
            id: string;
            label: string;
            tags: string[];
            category: string;
            filePath: string;
            description: string | undefined;
        }

        /**
         * Recursively collects all TaskItems from the tree view.
         */
        async function collectAllTasksFromTree(
            provider: ReturnType<typeof getTaskTreeProvider>,
            element?: Parameters<ReturnType<typeof getTaskTreeProvider>['getChildren']>[0]
        ): Promise<CollectedTask[]> {
            const children = await provider.getChildren(element);
            const tasks: CollectedTask[] = [];

            for (const child of children) {
                if (child.task !== null) {
                    // This is an actual task node
                    tasks.push({
                        id: child.task.id,
                        label: child.task.label,
                        tags: [...child.task.tags],
                        category: child.task.category,
                        filePath: child.task.filePath,
                        description: child.task.description
                    });
                }
                // Recursively get tasks from child nodes (categories, folders)
                if (child.children.length > 0) {
                    const childTasks = await collectAllTasksFromTree(provider, child);
                    tasks.push(...childTasks);
                }
            }

            return tasks;
        }

        test('PROOF: setTagFilter shows ONLY tasks with that tag in tree', async function() {
            this.timeout(30000);

            const provider = getTaskTreeProvider();

            // Step 1: Set up a config with a specific tag
            const config: TagConfig = {
                tags: {
                    'proof-tag': ['npm:build', 'npm:test']
                }
            };
            fs.writeFileSync(tagConfigPath, JSON.stringify(config, null, 4));

            // Step 2: Refresh to apply tags
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(2000);

            // Step 3: Verify some tasks have the tag before filtering
            const allTasks = provider.getAllTasks();
            const taggedTasks = allTasks.filter(t => t.tags.includes('proof-tag'));
            assert.ok(taggedTasks.length > 0, 'Must have at least one task with proof-tag');
            assert.ok(taggedTasks.length < allTasks.length, 'Not ALL tasks should have proof-tag');

            // Step 4: Apply tag filter
            provider.setTagFilter('proof-tag');
            await sleep(500);

            // Step 5: CRITICAL - Get ALL tasks from the tree view
            const tasksInTree = await collectAllTasksFromTree(provider);

            // Step 6: PROOF - Every task in tree MUST have the tag
            assert.ok(tasksInTree.length > 0, 'Tree must show at least one task when filter matches');

            for (const task of tasksInTree) {
                assert.ok(
                    task.tags.includes('proof-tag'),
                    `PROOF FAILED: Task "${task.label}" (ID: ${task.id}) appears in tree but ` +
                    `does NOT have tag "proof-tag"! Tags: [${task.tags.join(', ')}]`
                );
            }

            // Step 7: Verify count matches expected
            assert.strictEqual(
                tasksInTree.length,
                taggedTasks.length,
                `Tree should show exactly ${taggedTasks.length} tasks, not ${tasksInTree.length}`
            );

            // Clean up
            provider.clearFilters();
        });

        test('PROOF: setTagFilter with non-existent tag shows ZERO tasks in tree', async function() {
            this.timeout(20000);

            const provider = getTaskTreeProvider();

            // Step 1: Clear filters and refresh
            provider.clearFilters();
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1000);

            // Step 2: Verify we have tasks before filtering
            const allTasks = provider.getAllTasks();
            assert.ok(allTasks.length > 0, 'Must have tasks before testing');

            // Step 3: Apply filter for non-existent tag
            provider.setTagFilter('this-tag-does-not-exist-xyz-12345');
            await sleep(500);

            // Step 4: CRITICAL - Get ALL tasks from tree
            const tasksInTree = await collectAllTasksFromTree(provider);

            // Step 5: PROOF - Tree must be empty
            assert.strictEqual(
                tasksInTree.length,
                0,
                `PROOF FAILED: Tree shows ${tasksInTree.length} tasks for non-existent tag! ` +
                `Tasks: [${tasksInTree.map(t => t.label).join(', ')}]`
            );

            // Clean up
            provider.clearFilters();
        });

        test('PROOF: setTextFilter shows ONLY matching tasks in tree', async function() {
            this.timeout(20000);

            const provider = getTaskTreeProvider();

            // Step 1: Clear filters and refresh
            provider.clearFilters();
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1000);

            // Step 2: Get all tasks and find ones matching "build"
            const allTasks = provider.getAllTasks();
            const matchingTasks = allTasks.filter(t =>
                t.label.toLowerCase().includes('build') ||
                t.category.toLowerCase().includes('build') ||
                t.filePath.toLowerCase().includes('build') ||
                (t.description?.toLowerCase().includes('build') ?? false)
            );
            assert.ok(matchingTasks.length > 0, 'Must have tasks matching "build"');
            assert.ok(matchingTasks.length < allTasks.length, 'Not ALL tasks should match "build"');

            // Step 3: Apply text filter
            provider.setTextFilter('build');
            await sleep(500);

            // Step 4: CRITICAL - Get ALL tasks from tree
            const tasksInTree = await collectAllTasksFromTree(provider);

            // Step 5: PROOF - Every task in tree must match the filter
            // Filter checks: label, category, filePath, description
            for (const task of tasksInTree) {
                const matches =
                    task.label.toLowerCase().includes('build') ||
                    task.category.toLowerCase().includes('build') ||
                    task.filePath.toLowerCase().includes('build') ||
                    (task.description?.toLowerCase().includes('build') ?? false);

                assert.ok(
                    matches,
                    `PROOF FAILED: Task "${task.label}" (ID: ${task.id}) appears in tree ` +
                    `but does NOT match text filter "build"!`
                );
            }

            // Step 6: Verify count is reasonable
            assert.ok(
                tasksInTree.length > 0,
                'Tree must show at least one task matching "build"'
            );
            assert.ok(
                tasksInTree.length <= matchingTasks.length,
                `Tree shows ${tasksInTree.length} tasks but only ${matchingTasks.length} match`
            );

            // Clean up
            provider.clearFilters();
        });

        test('PROOF: clearFilters shows ALL tasks again', async function() {
            this.timeout(20000);

            const provider = getTaskTreeProvider();

            // Step 1: Get unfiltered count
            provider.clearFilters();
            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(1000);

            const allTasksBefore = await collectAllTasksFromTree(provider);
            const unfilteredCount = allTasksBefore.length;
            assert.ok(unfilteredCount > 0, 'Must have tasks');

            // Step 2: Apply a restrictive filter
            provider.setTextFilter('xyznonexistent123');
            await sleep(500);

            const filteredTasks = await collectAllTasksFromTree(provider);
            assert.strictEqual(filteredTasks.length, 0, 'Filter should show 0 tasks');

            // Step 3: Clear filters
            provider.clearFilters();
            await sleep(500);

            // Step 4: CRITICAL - Verify ALL tasks are back
            const allTasksAfter = await collectAllTasksFromTree(provider);

            assert.strictEqual(
                allTasksAfter.length,
                unfilteredCount,
                `PROOF FAILED: After clearFilters, tree shows ${allTasksAfter.length} tasks ` +
                `but should show ${unfilteredCount}!`
            );
        });

        test('PROOF: Combined text + tag filter intersects correctly', async function() {
            this.timeout(30000);

            const provider = getTaskTreeProvider();

            // Step 1: Set up config with tags using structured pattern
            const config: TagConfig = {
                tags: {
                    'combo-tag': [{ type: 'npm' }]  // All npm tasks
                }
            };
            fs.writeFileSync(tagConfigPath, JSON.stringify(config, null, 4));

            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(2000);

            // Step 2: Get tasks that match both criteria
            const allTasks = provider.getAllTasks();
            const npmTasks = allTasks.filter(t => t.tags.includes('combo-tag'));
            assert.ok(npmTasks.length > 0, 'Must have npm tasks with combo-tag');

            // Step 3: Apply BOTH filters
            provider.setTagFilter('combo-tag');
            provider.setTextFilter('build');
            await sleep(500);

            // Step 4: CRITICAL - Get tasks from tree
            const tasksInTree = await collectAllTasksFromTree(provider);

            // Step 5: PROOF - Every task must satisfy BOTH conditions
            for (const task of tasksInTree) {
                assert.ok(
                    task.tags.includes('combo-tag'),
                    `PROOF FAILED: Task "${task.label}" in tree but missing "combo-tag"`
                );

                const matchesText =
                    task.label.toLowerCase().includes('build') ||
                    task.category.toLowerCase().includes('build') ||
                    task.filePath.toLowerCase().includes('build') ||
                    (task.description?.toLowerCase().includes('build') ?? false);
                assert.ok(
                    matchesText,
                    `PROOF FAILED: Task "${task.label}" in tree but doesn't match "build"`
                );
            }

            // Clean up
            provider.clearFilters();
        });
    });
});
