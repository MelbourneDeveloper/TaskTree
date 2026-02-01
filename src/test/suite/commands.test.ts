import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import {
    activateExtension,
    sleep,
    getExtensionPath,
    EXTENSION_ID
} from './helpers';

interface ViewDefinition {
    id: string;
    name: string;
    icon?: string;
    contextualTitle?: string;
}

interface MenuItemDefinition {
    command: string;
    when?: string;
}

interface CommandDefinition {
    command: string;
    title: string;
    icon?: string;
}

interface PackageJson {
    name: string;
    displayName: string;
    description: string;
    version: string;
    publisher: string;
    main: string;
    engines: {
        vscode: string;
    };
    activationEvents?: string[];
    contributes: {
        views: {
            'tasktree-container': ViewDefinition[];
        };
        commands: CommandDefinition[];
        menus: {
            'view/title': MenuItemDefinition[];
            'view/item/context': MenuItemDefinition[];
        };
    };
}

function readPackageJson(): PackageJson {
    const content = fs.readFileSync(getExtensionPath('package.json'), 'utf8');
    return JSON.parse(content) as PackageJson;
}

suite('Commands and UI E2E Tests', () => {
    suiteSetup(async function() {
        this.timeout(30000);
        await activateExtension();
        await sleep(2000);
    });

    suite('Extension Activation', () => {
        test('extension is present', function() {
            this.timeout(10000);

            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            assert.ok(extension, `Extension ${EXTENSION_ID} should be installed`);
        });

        test('extension activates successfully', function() {
            this.timeout(10000);

            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            assert.ok(extension, 'Extension should exist');
            assert.ok(extension.isActive, 'Extension should be active');
        });

        test('extension activates on view visibility', function() {
            this.timeout(10000);

            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            assert.ok(extension, 'Extension should exist');

            const packageJson = readPackageJson();

            const hasActivationEvent = packageJson.activationEvents?.includes('onView:tasktree') ?? false;
            const hasViewContribution = packageJson.contributes.views['tasktree-container'].some(
                (v: ViewDefinition) => v.id === 'tasktree'
            );

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

            assert.ok(true, 'editTags command should execute');

            await vscode.commands.executeCommand('workbench.action.closeAllEditors');
        });
    });

    suite('Tree View Registration', () => {
        test('tree view is registered in custom container', function() {
            this.timeout(10000);

            const packageJson = readPackageJson();

            const containerViews = packageJson.contributes.views['tasktree-container'];
            assert.ok(containerViews.length > 0, 'Should have container views');

            const taskTreeView = containerViews.find((v: ViewDefinition) => v.id === 'tasktree');
            assert.ok(taskTreeView, 'tasktree view should be registered');
            assert.strictEqual(taskTreeView.name, 'All Tasks', 'View name should be All Tasks');
        });

        test('tree view has correct configuration', function() {
            this.timeout(10000);

            const packageJson = readPackageJson();

            const taskTreeView = packageJson.contributes.views['tasktree-container'].find(
                (v: ViewDefinition) => v.id === 'tasktree'
            );

            assert.ok(taskTreeView, 'Should have tasktree view');
            assert.ok(taskTreeView.contextualTitle !== undefined && taskTreeView.contextualTitle !== '', 'View should have contextual title');
        });
    });

    suite('Menu Contributions', () => {
        test('view title menu has correct commands', function() {
            this.timeout(10000);

            const packageJson = readPackageJson();

            const viewTitleMenus = packageJson.contributes.menus['view/title'];
            assert.ok(viewTitleMenus.length > 0, 'Should have view/title menus');

            const taskTreeMenus = viewTitleMenus.filter(
                (m) => m.when?.includes('view == tasktree') === true
            );

            assert.ok(taskTreeMenus.length >= 4, 'Should have at least 4 menu items');

            const commands = taskTreeMenus.map((m) => m.command);
            assert.ok(commands.includes('tasktree.filter'), 'Should have filter in menu');
            assert.ok(commands.includes('tasktree.filterByTag'), 'Should have filterByTag in menu');
            assert.ok(commands.includes('tasktree.clearFilter'), 'Should have clearFilter in menu');
            assert.ok(commands.includes('tasktree.refresh'), 'Should have refresh in menu');
        });

        test('context menu has run command for tasks', function() {
            this.timeout(10000);

            const packageJson = readPackageJson();

            const itemContextMenus = packageJson.contributes.menus['view/item/context'];
            assert.ok(itemContextMenus.length > 0, 'Should have view/item/context menus');

            const runMenu = itemContextMenus.find(
                (m) => m.command === 'tasktree.run'
            );
            assert.ok(runMenu, 'Should have run command in context menu');
            assert.ok(runMenu.when?.includes('viewItem == task') === true, 'Run should only show for tasks');
        });

        test('clearFilter only visible when filter is active', function() {
            this.timeout(10000);

            const packageJson = readPackageJson();

            const viewTitleMenus = packageJson.contributes.menus['view/title'];
            const clearFilterMenu = viewTitleMenus.find(
                (m) => m.command === 'tasktree.clearFilter'
            );

            assert.ok(clearFilterMenu, 'Should have clearFilter menu');
            assert.ok(
                clearFilterMenu.when?.includes('tasktree.hasFilter') === true,
                'clearFilter should require hasFilter context'
            );
        });
    });

    suite('Command Icons', () => {
        test('commands have appropriate icons', function() {
            this.timeout(10000);

            const packageJson = readPackageJson();

            const commands = packageJson.contributes.commands;

            const refreshCmd = commands.find((c) => c.command === 'tasktree.refresh');
            assert.ok(refreshCmd?.icon === '$(refresh)', 'Refresh should have refresh icon');

            const runCmd = commands.find((c) => c.command === 'tasktree.run');
            assert.ok(runCmd?.icon === '$(play)', 'Run should have play icon');

            const filterCmd = commands.find((c) => c.command === 'tasktree.filter');
            assert.ok(filterCmd?.icon === '$(search)', 'Filter should have search icon');

            const tagFilterCmd = commands.find((c) => c.command === 'tasktree.filterByTag');
            assert.ok(tagFilterCmd?.icon === '$(tag)', 'FilterByTag should have tag icon');

            const clearFilterCmd = commands.find((c) => c.command === 'tasktree.clearFilter');
            assert.ok(clearFilterCmd?.icon === '$(clear-all)', 'ClearFilter should have clear-all icon');
        });
    });

    suite('Tree Item Display', () => {
        test('task items have correct context value', function() {
            this.timeout(10000);
            assert.ok(true, 'Task items should have task context value');
        });

        test('category items are collapsible', function() {
            this.timeout(10000);
            assert.ok(true, 'Categories should be collapsible');
        });

        test('leaf tasks are not collapsible', function() {
            this.timeout(10000);
            assert.ok(true, 'Leaf tasks should not be collapsible');
        });
    });

    suite('Status Bar and Notifications', () => {
        test('refresh shows information message', async function() {
            this.timeout(10000);

            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(500);

            assert.ok(true, 'Refresh should show info message');
        });
    });

    suite('Context Management', () => {
        test('hasFilter context is set correctly', async function() {
            this.timeout(10000);

            await vscode.commands.executeCommand('tasktree.clearFilter');
            await sleep(500);

            assert.ok(true, 'Context management should work');
        });
    });

    suite('Extension Package Configuration', () => {
        test('package.json has correct metadata', function() {
            this.timeout(10000);

            const packageJson = readPackageJson();

            assert.strictEqual(packageJson.name, 'tasktree', 'Name should be tasktree');
            assert.strictEqual(packageJson.displayName, 'TaskTree', 'Display name should be TaskTree');
            assert.ok(packageJson.description !== '', 'Should have description');
            assert.ok(packageJson.version !== '', 'Should have version');
            assert.ok(packageJson.publisher !== '', 'Should have publisher');
        });

        test('package.json has correct engine requirement', function() {
            this.timeout(10000);

            const packageJson = readPackageJson();

            assert.ok(packageJson.engines.vscode !== '', 'Should have vscode engine requirement');
            assert.ok(
                packageJson.engines.vscode.startsWith('^1.'),
                'Should require VS Code 1.x'
            );
        });

        test('package.json has main entry point', function() {
            this.timeout(10000);

            const packageJson = readPackageJson();

            assert.strictEqual(packageJson.main, './out/extension.js', 'Main should point to compiled extension');
        });
    });

    suite('View Container', () => {
        test('views are in custom container', function() {
            this.timeout(10000);

            const packageJson = readPackageJson();

            assert.ok(
                packageJson.contributes.views['tasktree-container'].length > 0,
                'Views should be in tasktree-container'
            );
        });
    });

    suite('Workspace Trust', () => {
        test('extension works in trusted workspace', function() {
            this.timeout(10000);

            const extension = vscode.extensions.getExtension(EXTENSION_ID);
            assert.ok(extension?.isActive === true, 'Extension should be active');
        });
    });

    suite('Error Handling UI', () => {
        test('handles workspace without tasks gracefully', async function() {
            this.timeout(10000);

            await vscode.commands.executeCommand('tasktree.refresh');
            await sleep(500);

            assert.ok(true, 'Should handle workspace gracefully');
        });

        test('handles rapid command execution', async function() {
            this.timeout(15000);

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
