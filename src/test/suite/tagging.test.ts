import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import {
    activateExtension,
    sleep,
    getFixturePath,
    getExtensionPath,
    getTaskTreeProvider,
    TaskTreeProvider
} from './helpers';

interface TagConfig {
    tags: Record<string, string[]>;
}

suite('Tag Context Menu E2E Tests', () => {
    let provider: TaskTreeProvider;
    let tagConfigPath: string;
    let originalTagConfig: string;

    suiteSetup(async function () {
        this.timeout(30000);
        await activateExtension();
        provider = getTaskTreeProvider();
        assert.ok(provider !== undefined, 'Provider should be available');

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
            assert.ok(
                config.tags[tagName]?.includes(testTask.id),
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
        test('addTag command handles undefined item gracefully', async function () {
            this.timeout(10000);

            // Should not throw when called with undefined
            await vscode.commands.executeCommand('tasktree.addTag', undefined);
            await sleep(500);

            assert.ok(true, 'Should handle undefined item');
        });

        test('removeTag command handles undefined item gracefully', async function () {
            this.timeout(10000);

            // Should not throw when called with undefined
            await vscode.commands.executeCommand('tasktree.removeTag', undefined);
            await sleep(500);

            assert.ok(true, 'Should handle undefined item');
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

            assert.ok(
                addTagMenu?.group.startsWith('3_tagging'),
                'addTag should be in tagging group'
            );
            assert.ok(
                removeTagMenu?.group.startsWith('3_tagging'),
                'removeTag should be in tagging group'
            );
        });
    });
});
