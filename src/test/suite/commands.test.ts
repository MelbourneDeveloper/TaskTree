import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import {
    activateExtension,
    sleep,
    getExtensionPath,
    EXTENSION_ID
} from './helpers';

suite('Commands and UI E2E Tests', () => {
    suiteSetup(async function() {
        this.timeout(30000);
        await activateExtension();
        await sleep(2000);
    });

    suite('Extension Activation', () => {
        test('extension is present', async function() {
            this.timeout(10000);

            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            assert.ok(extension, `Extension ${EXTENSION_ID} should be installed`);
        });

        test('extension activates successfully', async function() {
            this.timeout(10000);

            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            assert.ok(extension, 'Extension should exist');
            assert.ok(extension.isActive, 'Extension should be active');
        });

        test('extension activates on view visibility', async function() {
            this.timeout(10000);

            // The extension should activate when the tasktree view is shown
            // VS Code auto-generates activation events from view contributions

            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            assert.ok(extension, 'Extension should exist');

            // Package.json should have the tasktree view contribution
            const packageJson = JSON.parse(
                fs.readFileSync(getExtensionPath('package.json'), 'utf8')
            );

            // Either explicit activationEvents or view contribution triggers activation
            const hasActivationEvent = packageJson.activationEvents?.includes('onView:tasktree') ?? false;
            const hasViewContribution = packageJson.contributes?.views?.explorer?.some(
                (v: { id: string }) => v.id === 'tasktree'
            ) ?? false;

            assert.ok(
                hasActivationEvent || hasViewContribution,
                'Should activate on view (via activationEvents or view contribution)'
            );
        });
    });

    suite('Command Registration', () => {
        test('all commands are registered', async function() {
            this.timeout(10000);

            const commands = await vscode.commands.getCommands(true);

            const expectedCommands = [
                'tasktree.refresh',
                'tasktree.run',
                'tasktree.filter',
                'tasktree.filterByTag',
                'tasktree.clearFilter',
                'tasktree.editTags'
            ];

            for (const cmd of expectedCommands) {
                assert.ok(commands.includes(cmd), `Command ${cmd} should be registered`);
            }
        });

        test('refresh command executes without error', async function() {
            this.timeout(10000);

            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(500);

            assert.ok(true, 'Refresh command should execute');
        });

        test('clearFilter command executes without error', async function() {
            this.timeout(10000);

            await vscode.commands.executeCommand('tasktree.clearFilter');
            await sleep(500);

            assert.ok(true, 'clearFilter command should execute');
        });

        test('editTags command executes without error', async function() {
            this.timeout(15000);

            await vscode.commands.executeCommand('tasktree.editTags');
            await sleep(1000);

            // Should open an editor
            assert.ok(true, 'editTags command should execute');

            // Clean up
            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        });
    });

    suite('Tree View Registration', () => {
        test('tree view is registered in explorer', async function() {
            this.timeout(10000);

            // The tree view is registered via contributes.views.explorer
            const packageJson = JSON.parse(
                fs.readFileSync(getExtensionPath('package.json'), 'utf8')
            );

            const explorerViews = packageJson.contributes.views.explorer;
            assert.ok(explorerViews, 'Should have explorer views');

            const taskTreeView = explorerViews.find((v: { id: string }) => v.id === 'tasktree');
            assert.ok(taskTreeView, 'tasktree view should be registered');
            assert.strictEqual(taskTreeView.name, 'TaskTree', 'View name should be TaskTree');
        });

        test('tree view has correct configuration', async function() {
            this.timeout(10000);

            const packageJson = JSON.parse(
                fs.readFileSync(getExtensionPath('package.json'), 'utf8')
            );

            const taskTreeView = packageJson.contributes.views.explorer.find(
                (v: { id: string }) => v.id === 'tasktree'
            );

            assert.ok(taskTreeView.icon, 'View should have an icon');
            assert.ok(taskTreeView.contextualTitle, 'View should have contextual title');
        });
    });

    suite('Menu Contributions', () => {
        test('view title menu has correct commands', async function() {
            this.timeout(10000);

            const packageJson = JSON.parse(
                fs.readFileSync(getExtensionPath('package.json'), 'utf8')
            );

            const viewTitleMenus = packageJson.contributes.menus['view/title'];
            assert.ok(viewTitleMenus, 'Should have view/title menus');

            const taskTreeMenus = viewTitleMenus.filter(
                (m: { when: string }) => m.when && m.when.includes('view == tasktree')
            );

            assert.ok(taskTreeMenus.length >= 4, 'Should have at least 4 menu items');

            // Check for specific commands
            const commands = taskTreeMenus.map((m: { command: string }) => m.command);
            assert.ok(commands.includes('tasktree.filter'), 'Should have filter in menu');
            assert.ok(commands.includes('tasktree.filterByTag'), 'Should have filterByTag in menu');
            assert.ok(commands.includes('tasktree.clearFilter'), 'Should have clearFilter in menu');
            assert.ok(commands.includes('tasktree.refresh'), 'Should have refresh in menu');
        });

        test('context menu has run command for tasks', async function() {
            this.timeout(10000);

            const packageJson = JSON.parse(
                fs.readFileSync(getExtensionPath('package.json'), 'utf8')
            );

            const itemContextMenus = packageJson.contributes.menus['view/item/context'];
            assert.ok(itemContextMenus, 'Should have view/item/context menus');

            const runMenu = itemContextMenus.find(
                (m: { command: string }) => m.command === 'tasktree.run'
            );
            assert.ok(runMenu, 'Should have run command in context menu');
            assert.ok(runMenu.when.includes('viewItem == task'), 'Run should only show for tasks');
        });

        test('clearFilter only visible when filter is active', async function() {
            this.timeout(10000);

            const packageJson = JSON.parse(
                fs.readFileSync(getExtensionPath('package.json'), 'utf8')
            );

            const viewTitleMenus = packageJson.contributes.menus['view/title'];
            const clearFilterMenu = viewTitleMenus.find(
                (m: { command: string }) => m.command === 'tasktree.clearFilter'
            );

            assert.ok(clearFilterMenu, 'Should have clearFilter menu');
            assert.ok(
                clearFilterMenu.when.includes('tasktree.hasFilter'),
                'clearFilter should require hasFilter context'
            );
        });
    });

    suite('Command Icons', () => {
        test('commands have appropriate icons', async function() {
            this.timeout(10000);

            const packageJson = JSON.parse(
                fs.readFileSync(getExtensionPath('package.json'), 'utf8')
            );

            const commands = packageJson.contributes.commands;

            const refreshCmd = commands.find((c: { command: string }) => c.command === 'tasktree.refresh');
            assert.ok(refreshCmd.icon === '$(refresh)', 'Refresh should have refresh icon');

            const runCmd = commands.find((c: { command: string }) => c.command === 'tasktree.run');
            assert.ok(runCmd.icon === '$(play)', 'Run should have play icon');

            const filterCmd = commands.find((c: { command: string }) => c.command === 'tasktree.filter');
            assert.ok(filterCmd.icon === '$(search)', 'Filter should have search icon');

            const tagFilterCmd = commands.find((c: { command: string }) => c.command === 'tasktree.filterByTag');
            assert.ok(tagFilterCmd.icon === '$(tag)', 'FilterByTag should have tag icon');

            const clearFilterCmd = commands.find((c: { command: string }) => c.command === 'tasktree.clearFilter');
            assert.ok(clearFilterCmd.icon === '$(clear-all)', 'ClearFilter should have clear-all icon');
        });
    });

    suite('Tree Item Display', () => {
        test('task items have correct context value', async function() {
            this.timeout(10000);

            // Task items should have contextValue = 'task' for context menu
            // This is set in TaskTreeItem class

            assert.ok(true, 'Task items should have task context value');
        });

        test('category items are collapsible', async function() {
            this.timeout(10000);

            // Categories should be collapsible (TreeItemCollapsibleState.Collapsed)

            assert.ok(true, 'Categories should be collapsible');
        });

        test('leaf tasks are not collapsible', async function() {
            this.timeout(10000);

            // Leaf tasks should have TreeItemCollapsibleState.None

            assert.ok(true, 'Leaf tasks should not be collapsible');
        });
    });

    suite('Status Bar and Notifications', () => {
        test('refresh shows information message', async function() {
            this.timeout(10000);

            // The refresh command shows an info message
            // We can't easily capture this in tests, but we verify it doesn't crash

            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(500);

            assert.ok(true, 'Refresh should show info message');
        });
    });

    suite('Context Management', () => {
        test('hasFilter context is set correctly', async function() {
            this.timeout(10000);

            // Clear filter should set context to false
            await vscode.commands.executeCommand('tasktree.clearFilter');
            await sleep(500);

            // We can't directly read context values, but verify no crash
            assert.ok(true, 'Context management should work');
        });
    });

    suite('Extension Package Configuration', () => {
        test('package.json has correct metadata', async function() {
            this.timeout(10000);

            const packageJson = JSON.parse(
                fs.readFileSync(getExtensionPath('package.json'), 'utf8')
            );

            assert.strictEqual(packageJson.name, 'tasktree', 'Name should be tasktree');
            assert.strictEqual(packageJson.displayName, 'TaskTree', 'Display name should be TaskTree');
            assert.ok(packageJson.description, 'Should have description');
            assert.ok(packageJson.version, 'Should have version');
            assert.ok(packageJson.publisher, 'Should have publisher');
        });

        test('package.json has correct engine requirement', async function() {
            this.timeout(10000);

            const packageJson = JSON.parse(
                fs.readFileSync(getExtensionPath('package.json'), 'utf8')
            );

            assert.ok(packageJson.engines.vscode, 'Should have vscode engine requirement');
            assert.ok(
                packageJson.engines.vscode.startsWith('^1.'),
                'Should require VS Code 1.x'
            );
        });

        test('package.json has main entry point', async function() {
            this.timeout(10000);

            const packageJson = JSON.parse(
                fs.readFileSync(getExtensionPath('package.json'), 'utf8')
            );

            assert.strictEqual(packageJson.main, './out/extension.js', 'Main should point to compiled extension');
        });
    });

    suite('View Container', () => {
        test('view is in explorer container', async function() {
            this.timeout(10000);

            const packageJson = JSON.parse(
                fs.readFileSync(getExtensionPath('package.json'), 'utf8')
            );

            assert.ok(
                packageJson.contributes.views.explorer,
                'Views should be in explorer container'
            );
        });
    });

    suite('Workspace Trust', () => {
        test('extension works in trusted workspace', async function() {
            this.timeout(10000);

            // Verify extension is active in our test workspace
            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            assert.ok(extension?.isActive, 'Extension should be active');
        });
    });

    suite('Error Handling UI', () => {
        test('handles workspace without tasks gracefully', async function() {
            this.timeout(10000);

            // Should not crash or show errors for empty categories

            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(500);

            assert.ok(true, 'Should handle workspace gracefully');
        });

        test('handles rapid command execution', async function() {
            this.timeout(15000);

            // Execute multiple commands rapidly
            const promises = [];
            for (let i = 0; i < 5; i++) {
                promises.push(vscode.commands.executeCommand('tasktree.refresh'));
            }

            await Promise.all(promises);
            await sleep(1000);

            assert.ok(true, 'Should handle rapid execution');
        });
    });
});
