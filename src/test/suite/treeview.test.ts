/**
 * TREEVIEW E2E TESTS
 *
 * These tests verify the tree view structure, icons, labels, and data integrity.
 *
 * ⛔️⛔️⛔️ E2E TEST RULES ⛔️⛔️⛔️
 *
 * LEGAL:
 * ✅ Observing state via getChildren() / getAllTasks() (read-only)
 * ✅ Waiting for initial load with await sleep()
 * ✅ Writing to config files (simulates user editing)
 *
 * ILLEGAL:
 * ❌ provider.refresh() - refresh should be AUTOMATIC
 * ❌ provider.setTextFilter() - internal method
 * ❌ provider.setTagFilter() - internal method
 * ❌ provider.clearFilters() - internal method
 * ❌ vscode.commands.executeCommand('tasktree.refresh')
 *
 * The extension should auto-load tasks on activation and auto-refresh
 * when files change. Tests verify the observable state only.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import type { TaskTreeProvider, TaskTreeItem, TestContext } from './helpers';
import {
    activateExtension,
    sleep,
    getTaskTreeProvider,
    getTreeChildren
} from './helpers';

function getLabelString(label: string | vscode.TreeItemLabel | undefined): string {
    if (typeof label === 'string') {
        return label;
    }
    if (label !== undefined && typeof label === 'object' && 'label' in label) {
        return label.label;
    }
    return '';
}

suite('TreeView Real UI Tests', () => {
    let context: TestContext;
    let provider: TaskTreeProvider;

    suiteSetup(async function() {
        this.timeout(30000);
        context = await activateExtension();
        provider = getTaskTreeProvider();
        // Wait for extension to auto-load tasks - NO refresh() call!
        await sleep(3000);
    });

    suite('Tree Structure Verification', () => {
        test('root level has all expected categories', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);

            // We have many task types now - at least the core ones should exist
            assert.ok(roots.length >= 6, `Expected at least 6 root categories, got ${roots.length}`);

            const categoryLabels = roots.map(r => getLabelString(r.label));
            assert.ok(categoryLabels.some(l => l.includes('Shell Scripts')), 'Should have Shell Scripts category');
            assert.ok(categoryLabels.some(l => l.includes('NPM Scripts')), 'Should have NPM Scripts category');
            assert.ok(categoryLabels.some(l => l.includes('Make Targets')), 'Should have Make Targets category');
            assert.ok(categoryLabels.some(l => l.includes('VS Code Launch')), 'Should have VS Code Launch category');
            assert.ok(categoryLabels.some(l => l.includes('VS Code Tasks')), 'Should have VS Code Tasks category');
            assert.ok(categoryLabels.some(l => l.includes('Python Scripts')), 'Should have Python Scripts category');
        });

        test('Shell Scripts category shows correct count in label', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const shellCategory = roots.find(r => getLabelString(r.label).includes('Shell Scripts'));

            assert.ok(shellCategory, 'Shell Scripts category should exist');
            // 3 shell scripts: build.sh, deploy.sh, test.sh
            const shellLabel = getLabelString(shellCategory.label);
            assert.ok(
                shellLabel.includes('(3)'),
                `Shell Scripts should show count (3), got: ${shellLabel}`
            );
        });

        test('NPM Scripts category shows correct count in label', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const npmCategory = roots.find(r => getLabelString(r.label).includes('NPM Scripts'));

            assert.ok(npmCategory, 'NPM Scripts category should exist');
            // 7 npm scripts: 4 from root + 3 from subproject
            const npmLabel = getLabelString(npmCategory.label);
            assert.ok(
                npmLabel.includes('(7)'),
                `NPM Scripts should show count (7), got: ${npmLabel}`
            );
        });

        test('Make Targets category shows correct count in label', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const makeCategory = roots.find(r => getLabelString(r.label).includes('Make Targets'));

            assert.ok(makeCategory, 'Make Targets category should exist');
            // 6 targets: all, build, test, clean, install, new-watcher-target (.internal is skipped)
            const makeLabel = getLabelString(makeCategory.label);
            assert.ok(
                makeLabel.includes('(6)'),
                `Make Targets should show count (6), got: ${makeLabel}`
            );
        });

        test('VS Code Launch category shows correct count in label', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const launchCategory = roots.find(r => getLabelString(r.label).includes('VS Code Launch'));

            assert.ok(launchCategory, 'VS Code Launch category should exist');
            // 5 launch configs: 3 from workspace + 2 from nested test-fixtures
            const launchLabel = getLabelString(launchCategory.label);
            assert.ok(
                launchLabel.includes('(5)'),
                `VS Code Launch should show count (5), got: ${launchLabel}`
            );
        });

        test('VS Code Tasks category shows correct count in label', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const tasksCategory = roots.find(r => getLabelString(r.label).includes('VS Code Tasks'));

            assert.ok(tasksCategory, 'VS Code Tasks category should exist');
            // 6 tasks: 4 from workspace + 2 from nested test-fixtures
            const tasksLabel = getLabelString(tasksCategory.label);
            assert.ok(
                tasksLabel.includes('(6)'),
                `VS Code Tasks should show count (6), got: ${tasksLabel}`
            );
        });

        test('Python Scripts category shows correct count in label', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const pythonCategory = roots.find(r => getLabelString(r.label).includes('Python Scripts'));

            assert.ok(pythonCategory, 'Python Scripts category should exist');
            // 3 runnable python scripts: build_project.py, run_tests.py, deploy.py (utils.py has no __main__)
            const pythonLabel = getLabelString(pythonCategory.label);
            assert.ok(
                pythonLabel.includes('(3)'),
                `Python Scripts should show count (3), got: ${pythonLabel}`
            );
        });
    });

    suite('Task Item Properties', () => {
        test('shell script tasks have correct labels', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const shellCategory = roots.find(r => getLabelString(r.label).includes('Shell Scripts'));
            assert.ok(shellCategory, 'Shell Scripts category required');

            const shellChildren = shellCategory.children;
            const allTasks = flattenTaskItems(shellChildren);

            const labels = allTasks.map(t => t.task?.label ?? '');
            assert.ok(labels.includes('build.sh'), 'Should have build.sh task');
            assert.ok(labels.includes('deploy.sh'), 'Should have deploy.sh task');
            assert.ok(labels.includes('test.sh'), 'Should have test.sh task');
        });

        test('npm script tasks have correct labels', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const npmCategory = roots.find(r => getLabelString(r.label).includes('NPM Scripts'));
            assert.ok(npmCategory, 'NPM Scripts category required');

            const allTasks = flattenTaskItems(npmCategory.children);
            const labels = allTasks.map(t => t.task?.label ?? '');

            assert.ok(labels.includes('build'), 'Should have build npm script');
            assert.ok(labels.includes('test'), 'Should have test npm script');
            assert.ok(labels.includes('lint'), 'Should have lint npm script');
            assert.ok(labels.includes('start'), 'Should have start npm script');
        });

        test('make targets have correct labels', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const makeCategory = roots.find(r => getLabelString(r.label).includes('Make Targets'));
            assert.ok(makeCategory, 'Make Targets category required');

            const allTasks = flattenTaskItems(makeCategory.children);
            const labels = allTasks.map(t => t.task?.label ?? '');

            assert.ok(labels.includes('all'), 'Should have all target');
            assert.ok(labels.includes('build'), 'Should have build target');
            assert.ok(labels.includes('test'), 'Should have test target');
            assert.ok(labels.includes('clean'), 'Should have clean target');
            assert.ok(labels.includes('install'), 'Should have install target');
            assert.ok(!labels.includes('.internal'), 'Should NOT have .internal target');
        });

        test('launch configs have correct labels', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const launchCategory = roots.find(r => getLabelString(r.label).includes('VS Code Launch'));
            assert.ok(launchCategory, 'VS Code Launch category required');

            const allTasks = flattenTaskItems(launchCategory.children);
            const labels = allTasks.map(t => t.task?.label ?? '');

            assert.ok(labels.includes('Debug Application'), 'Should have Debug Application');
            assert.ok(labels.includes('Debug Tests'), 'Should have Debug Tests');
            assert.ok(labels.includes('Debug Python'), 'Should have Debug Python');
        });

        test('vscode tasks have correct labels', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const tasksCategory = roots.find(r => getLabelString(r.label).includes('VS Code Tasks'));
            assert.ok(tasksCategory, 'VS Code Tasks category required');

            const allTasks = flattenTaskItems(tasksCategory.children);
            const labels = allTasks.map(t => t.task?.label ?? '');

            assert.ok(labels.includes('Build Project'), 'Should have Build Project');
            assert.ok(labels.includes('Run Tests'), 'Should have Run Tests');
            assert.ok(labels.includes('Deploy with Config'), 'Should have Deploy with Config');
            assert.ok(labels.includes('Custom Build'), 'Should have Custom Build');
        });

        test('python script tasks have correct labels', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const pythonCategory = roots.find(r => getLabelString(r.label).includes('Python Scripts'));
            assert.ok(pythonCategory, 'Python Scripts category required');

            const allTasks = flattenTaskItems(pythonCategory.children);
            const labels = allTasks.map(t => t.task?.label ?? '');

            assert.ok(labels.includes('build_project.py'), 'Should have build_project.py');
            assert.ok(labels.includes('run_tests.py'), 'Should have run_tests.py');
            assert.ok(labels.includes('deploy.py'), 'Should have deploy.py');
            assert.ok(!labels.includes('utils.py'), 'Should NOT have utils.py (not runnable)');
        });
    });

    suite('Icon Verification', () => {
        test('shell tasks have terminal icon', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const shellCategory = roots.find(r => getLabelString(r.label).includes('Shell Scripts'));
            assert.ok(shellCategory, 'Shell Scripts category required');

            const allTasks = flattenTaskItems(shellCategory.children);
            for (const task of allTasks) {
                const icon = task.iconPath as vscode.ThemeIcon;
                assert.strictEqual(icon.id, 'terminal', `Shell task ${task.task?.label} should have terminal icon`);
            }
        });

        test('npm tasks have package icon', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const npmCategory = roots.find(r => getLabelString(r.label).includes('NPM Scripts'));
            assert.ok(npmCategory, 'NPM Scripts category required');

            const allTasks = flattenTaskItems(npmCategory.children);
            for (const task of allTasks) {
                const icon = task.iconPath as vscode.ThemeIcon;
                assert.strictEqual(icon.id, 'package', `NPM task ${task.task?.label} should have package icon`);
            }
        });

        test('make tasks have tools icon', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const makeCategory = roots.find(r => getLabelString(r.label).includes('Make Targets'));
            assert.ok(makeCategory, 'Make Targets category required');

            const allTasks = flattenTaskItems(makeCategory.children);
            for (const task of allTasks) {
                const icon = task.iconPath as vscode.ThemeIcon;
                assert.strictEqual(icon.id, 'tools', `Make task ${task.task?.label} should have tools icon`);
            }
        });

        test('launch tasks have debug-alt icon', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const launchCategory = roots.find(r => getLabelString(r.label).includes('VS Code Launch'));
            assert.ok(launchCategory, 'VS Code Launch category required');

            const allTasks = flattenTaskItems(launchCategory.children);
            for (const task of allTasks) {
                const icon = task.iconPath as vscode.ThemeIcon;
                assert.strictEqual(icon.id, 'debug-alt', `Launch task ${task.task?.label} should have debug-alt icon`);
            }
        });

        test('vscode tasks have gear icon', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const tasksCategory = roots.find(r => getLabelString(r.label).includes('VS Code Tasks'));
            assert.ok(tasksCategory, 'VS Code Tasks category required');

            const allTasks = flattenTaskItems(tasksCategory.children);
            for (const task of allTasks) {
                const icon = task.iconPath as vscode.ThemeIcon;
                assert.strictEqual(icon.id, 'gear', `VS Code task ${task.task?.label} should have gear icon`);
            }
        });

        test('python tasks have symbol-misc icon', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const pythonCategory = roots.find(r => getLabelString(r.label).includes('Python Scripts'));
            assert.ok(pythonCategory, 'Python Scripts category required');

            const allTasks = flattenTaskItems(pythonCategory.children);
            for (const task of allTasks) {
                const icon = task.iconPath as vscode.ThemeIcon;
                assert.strictEqual(icon.id, 'symbol-misc', `Python task ${task.task?.label} should have symbol-misc icon`);
            }
        });
    });

    suite('Collapsible State Verification', () => {
        test('category nodes are collapsible', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);

            for (const category of roots) {
                assert.strictEqual(
                    category.collapsibleState,
                    vscode.TreeItemCollapsibleState.Collapsed,
                    `Category ${getLabelString(category.label)} should be collapsible`
                );
            }
        });

        test('task leaf nodes are not collapsible', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);

            for (const category of roots) {
                const allTasks = flattenTaskItems(category.children);
                for (const task of allTasks) {
                    assert.strictEqual(
                        task.collapsibleState,
                        vscode.TreeItemCollapsibleState.None,
                        `Task ${task.task?.label} should not be collapsible`
                    );
                }
            }
        });
    });

    suite('Context Value Verification', () => {
        test('category nodes have category context', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);

            for (const category of roots) {
                assert.strictEqual(
                    category.contextValue,
                    'category',
                    `Category ${getLabelString(category.label)} should have 'category' contextValue`
                );
            }
        });

        test('task nodes have task context', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);

            for (const category of roots) {
                const allTasks = flattenTaskItems(category.children);
                for (const task of allTasks) {
                    assert.strictEqual(
                        task.contextValue,
                        'task',
                        `Task ${task.task?.label} should have 'task' contextValue`
                    );
                }
            }
        });
    });

    suite('Command Binding Verification', () => {
        test('task nodes have run command attached', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);

            for (const category of roots) {
                const allTasks = flattenTaskItems(category.children);
                for (const task of allTasks) {
                    assert.ok(task.command, `Task ${task.task?.label} should have a command`);
                    const cmd = task.command;
                    assert.strictEqual(
                        cmd.command,
                        'tasktree.run',
                        `Task ${task.task?.label} command should be tasktree.run`
                    );
                    assert.ok(
                        cmd.arguments?.length === 1,
                        `Task ${task.task?.label} command should have 1 argument (the task item)`
                    );
                }
            }
        });
    });

    suite('Task Description and Tooltip', () => {
        test('task items have description showing category', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const launchCategory = roots.find(r => getLabelString(r.label).includes('VS Code Launch'));
            assert.ok(launchCategory, 'VS Code Launch category required');

            const allTasks = flattenTaskItems(launchCategory.children);
            for (const task of allTasks) {
                assert.ok(
                    task.description !== undefined && task.description !== '',
                    `Task ${task.task?.label} should have a description`
                );
            }
        });

        test('task items have markdown tooltip', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const makeCategory = roots.find(r => getLabelString(r.label).includes('Make Targets'));
            assert.ok(makeCategory, 'Make Targets category required');

            const allTasks = flattenTaskItems(makeCategory.children);
            for (const task of allTasks) {
                assert.ok(
                    task.tooltip instanceof vscode.MarkdownString,
                    `Task ${task.task?.label} should have MarkdownString tooltip`
                );

                const md = task.tooltip;
                const taskData = task.task;
                assert.ok(taskData, 'Task should have task data');
                assert.ok(
                    md.value.includes(taskData.label),
                    `Tooltip should contain task label`
                );
                assert.ok(
                    md.value.includes(taskData.type),
                    `Tooltip should contain task type`
                );
            }
        });
    });

    suite('Tree Item ID and Indentation Structure', () => {
        function collectAllIds(items: TaskTreeItem[], allIds: Set<string>): void {
            for (const item of items) {
                if (item.id !== undefined) {
                    assert.ok(!allIds.has(item.id), `ID "${item.id}" should be unique`);
                    allIds.add(item.id);
                }
                if (item.children.length > 0) {
                    collectAllIds(item.children, allIds);
                }
            }
        }

        test('all tree items have unique IDs for proper indentation', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const allIds = new Set<string>();

            // Check root categories have IDs
            for (const category of roots) {
                assert.ok(category.id !== undefined, `Category "${getLabelString(category.label)}" should have an id`);
                assert.ok(!allIds.has(category.id), `ID "${category.id}" should be unique`);
                allIds.add(category.id);

                // Check children recursively
                collectAllIds(category.children, allIds);
            }
        });

        test('folder nodes have hierarchical IDs', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const npmCategory = roots.find(r => getLabelString(r.label).includes('NPM Scripts'));
            assert.ok(npmCategory, 'NPM Scripts category required');

            // NPM Scripts has folder grouping (Root, subproject, etc.)
            for (const child of npmCategory.children) {
                if (child.task === null && child.categoryLabel !== null) {
                    // This is a folder node
                    assert.ok(child.id !== undefined, `Folder "${child.categoryLabel}" should have an id`);
                    assert.ok(
                        child.id.includes('/'),
                        `Folder id "${child.id}" should be hierarchical (contain /)`
                    );
                }
            }
        });

        test('nested task items have proper parent context in IDs', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const npmCategory = roots.find(r => getLabelString(r.label).includes('NPM Scripts'));
            assert.ok(npmCategory, 'NPM Scripts category required');

            // Find a folder with multiple tasks
            const folderWithTasks = npmCategory.children.find(
                c => c.task === null && c.children.length > 1
            );

            if (folderWithTasks !== undefined) {
                // Tasks under a folder should have unique IDs
                const taskIds = folderWithTasks.children.map(t => t.id);
                const uniqueIds = new Set(taskIds);
                assert.strictEqual(
                    taskIds.length,
                    uniqueIds.size,
                    'All tasks in folder should have unique IDs'
                );
            }
        });

        test('tree has proper 3-level nesting for grouped categories', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const npmCategory = roots.find(r => getLabelString(r.label).includes('NPM Scripts'));
            assert.ok(npmCategory, 'NPM Scripts category required');

            // Level 1: Category (NPM Scripts)
            assert.ok(npmCategory.id !== undefined, 'Category should have ID');
            assert.ok(
                npmCategory.collapsibleState === vscode.TreeItemCollapsibleState.Collapsed,
                'Category should be collapsible'
            );

            // Level 2: Folders (Root, subproject)
            const folders = npmCategory.children.filter(c => c.task === null && c.children.length > 0);
            assert.ok(folders.length > 0, 'Should have folder nodes under NPM Scripts');

            for (const folder of folders) {
                assert.ok(folder.id !== undefined, `Folder should have ID`);
                assert.ok(
                    folder.collapsibleState === vscode.TreeItemCollapsibleState.Collapsed,
                    'Folder should be collapsible'
                );

                // Level 3: Tasks
                for (const task of folder.children) {
                    assert.ok(task.id !== undefined, `Task should have ID`);
                    assert.ok(
                        task.collapsibleState === vscode.TreeItemCollapsibleState.None,
                        'Task should not be collapsible'
                    );
                }
            }
        });
    });

    suite('Task Data Integrity', () => {
        test('all tasks have required properties', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);

            for (const category of roots) {
                const allTasks = flattenTaskItems(category.children);
                for (const item of allTasks) {
                    const task = item.task;
                    assert.ok(task, 'TaskTreeItem should have task property');
                    assert.ok(task.id, `Task ${task.label} should have id`);
                    assert.ok(task.label, 'Task should have label');
                    assert.ok(task.type, `Task ${task.label} should have type`);
                    assert.ok(task.command, `Task ${task.label} should have command`);
                    assert.ok(task.filePath, `Task ${task.label} should have filePath`);
                    assert.ok(Array.isArray(task.tags), `Task ${task.label} should have tags array`);
                }
            }
        });

        test('shell tasks have correct cwd', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const shellCategory = roots.find(r => getLabelString(r.label).includes('Shell Scripts'));
            assert.ok(shellCategory, 'Shell Scripts category required');

            const allTasks = flattenTaskItems(shellCategory.children);
            for (const item of allTasks) {
                const taskData = item.task;
                assert.ok(taskData, 'Task should have task data');
                assert.ok(
                    taskData.cwd !== undefined && taskData.cwd !== '',
                    `Shell task ${taskData.label} should have cwd`
                );
                assert.ok(
                    taskData.cwd.includes(context.workspaceRoot) ||
                    context.workspaceRoot.includes(taskData.cwd),
                    `Shell task ${taskData.label} cwd should be related to workspace`
                );
            }
        });

        test('npm tasks reference package.json location', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const npmCategory = roots.find(r => getLabelString(r.label).includes('NPM Scripts'));
            assert.ok(npmCategory, 'NPM Scripts category required');

            const allTasks = flattenTaskItems(npmCategory.children);
            for (const item of allTasks) {
                const taskData = item.task;
                assert.ok(taskData, 'Task should have task data');
                assert.ok(
                    taskData.filePath.endsWith('package.json'),
                    `NPM task ${taskData.label} filePath should end with package.json`
                );
            }
        });
    });

    suite('Category Visibility', () => {
        test('all visible categories have at least one task', async function() {
            this.timeout(15000);

            // By default showEmptyCategories is false
            // Verify that all root categories have at least one task
            const roots = await getTreeChildren(provider);

            for (const category of roots) {
                const label = getLabelString(category.label);
                const allTasks = flattenTaskItems(category.children);
                assert.ok(allTasks.length > 0, `Category "${label}" should have tasks when visible`);
            }
        });

        test('category count in label matches actual children count', async function() {
            this.timeout(15000);

            const roots = await getTreeChildren(provider);

            for (const category of roots) {
                const label = getLabelString(category.label);
                // Extract count from label like "NPM Scripts (7)"
                const countMatch = (/\((\d+)\)/).exec(label);
                if (countMatch?.[1] !== undefined) {
                    const claimedCount = parseInt(countMatch[1], 10);
                    const actualTasks = flattenTaskItems(category.children);
                    assert.strictEqual(
                        actualTasks.length,
                        claimedCount,
                        `Category "${label}" claims ${claimedCount} tasks but has ${actualTasks.length}`
                    );
                }
            }
        });
    });
});

/**
 * PROOF TESTS: Verify NO DUPLICATE items appear in the tree.
 * These tests prove at the data level that each task appears exactly once.
 */
suite('PROOF: No Duplicate Items In Tree', () => {
    let provider: TaskTreeProvider;

    suiteSetup(async function() {
        this.timeout(30000);
        await activateExtension();
        provider = getTaskTreeProvider();
        // Wait for extension to auto-load tasks - NO refresh() call!
        await sleep(3000);
    });

    test('PROOF: Each task ID appears exactly ONCE in entire tree', async function() {
        this.timeout(15000);

        const roots = await getTreeChildren(provider);
        const allTaskIds: string[] = [];
        const duplicates: string[] = [];

        // Collect ALL task IDs from the entire tree
        function collectTaskIds(items: TaskTreeItem[]): void {
            for (const item of items) {
                if (item.task !== null) {
                    const taskId = item.task.id;
                    if (allTaskIds.includes(taskId)) {
                        duplicates.push(taskId);
                    }
                    allTaskIds.push(taskId);
                }
                if (item.children.length > 0) {
                    collectTaskIds(item.children);
                }
            }
        }

        for (const category of roots) {
            collectTaskIds(category.children);
        }

        assert.strictEqual(
            duplicates.length, 0,
            `PROOF FAILED: Found ${duplicates.length} duplicate task IDs: [${duplicates.join(', ')}]`
        );

        // Also verify we have tasks
        assert.ok(allTaskIds.length > 0, 'Should have at least some tasks');
    });

    test('PROOF: Each TreeItem ID appears exactly ONCE', async function() {
        this.timeout(15000);

        const roots = await getTreeChildren(provider);
        const allIds: string[] = [];
        const duplicates: string[] = [];

        // Collect ALL TreeItem IDs (categories, folders, and tasks)
        function collectAllIds(items: TaskTreeItem[]): void {
            for (const item of items) {
                if (item.id !== undefined) {
                    if (allIds.includes(item.id)) {
                        duplicates.push(item.id);
                    }
                    allIds.push(item.id);
                }
                if (item.children.length > 0) {
                    collectAllIds(item.children);
                }
            }
        }

        // Include root categories
        for (const root of roots) {
            if (root.id !== undefined) {
                if (allIds.includes(root.id)) {
                    duplicates.push(root.id);
                }
                allIds.push(root.id);
            }
            collectAllIds(root.children);
        }

        assert.strictEqual(
            duplicates.length, 0,
            `PROOF FAILED: Found ${duplicates.length} duplicate TreeItem IDs: [${duplicates.join(', ')}]`
        );
    });

    test('PROOF: Task count matches getAllTasks length', async function() {
        this.timeout(15000);

        const roots = await getTreeChildren(provider);
        const allTasks = provider.getAllTasks();

        // Count tasks in tree
        let treeTaskCount = 0;
        function countTasks(items: TaskTreeItem[]): void {
            for (const item of items) {
                if (item.task !== null) {
                    treeTaskCount++;
                }
                if (item.children.length > 0) {
                    countTasks(item.children);
                }
            }
        }

        for (const category of roots) {
            countTasks(category.children);
        }

        assert.strictEqual(
            treeTaskCount, allTasks.length,
            `PROOF FAILED: Tree shows ${treeTaskCount} tasks but getAllTasks returns ${allTasks.length}`
        );
    });

    test('PROOF: No task appears in multiple categories', async function() {
        this.timeout(15000);

        const roots = await getTreeChildren(provider);
        const taskIdToCategories = new Map<string, string[]>();

        for (const category of roots) {
            const categoryLabel = getLabelString(category.label);
            const categoryTasks = flattenTaskItems(category.children);

            for (const taskItem of categoryTasks) {
                if (taskItem.task !== null) {
                    const taskId = taskItem.task.id;
                    const existing = taskIdToCategories.get(taskId) ?? [];
                    existing.push(categoryLabel);
                    taskIdToCategories.set(taskId, existing);
                }
            }
        }

        // Find tasks that appear in multiple categories
        const multiCategoryTasks: string[] = [];
        for (const [taskId, categories] of taskIdToCategories) {
            if (categories.length > 1) {
                multiCategoryTasks.push(`${taskId} in [${categories.join(', ')}]`);
            }
        }

        assert.strictEqual(
            multiCategoryTasks.length, 0,
            `PROOF FAILED: Tasks appear in multiple categories: ${multiCategoryTasks.join('; ')}`
        );
    });

    test('PROOF: getAllTasks returns unique tasks only', function() {
        this.timeout(10000);

        const allTasks = provider.getAllTasks();
        const taskIds = allTasks.map(t => t.id);
        const uniqueIds = new Set(taskIds);

        const duplicates = taskIds.filter((id, index) => taskIds.indexOf(id) !== index);

        assert.strictEqual(
            taskIds.length, uniqueIds.size,
            `PROOF FAILED: getAllTasks has ${taskIds.length - uniqueIds.size} duplicates: [${duplicates.join(', ')}]`
        );
    });
});

/**
 * Flattens nested TaskTreeItems to get all leaf task nodes
 */
function flattenTaskItems(items: TaskTreeItem[]): TaskTreeItem[] {
    const result: TaskTreeItem[] = [];

    for (const item of items) {
        if (item.task) {
            result.push(item);
        }
        if (item.children.length > 0) {
            result.push(...flattenTaskItems(item.children));
        }
    }

    return result;
}
