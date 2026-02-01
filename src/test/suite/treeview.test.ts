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
        await provider.refresh();
        await sleep(2000);
    });

    suite('Tree Structure Verification', () => {
        test('root level has exactly 5 categories', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);

            assert.strictEqual(roots.length, 5, `Expected 5 root categories, got ${roots.length}`);

            const categoryLabels = roots.map(r => getLabelString(r.label));
            assert.ok(categoryLabels.some(l => l.includes('Shell Scripts')), 'Should have Shell Scripts category');
            assert.ok(categoryLabels.some(l => l.includes('NPM Scripts')), 'Should have NPM Scripts category');
            assert.ok(categoryLabels.some(l => l.includes('Make Targets')), 'Should have Make Targets category');
            assert.ok(categoryLabels.some(l => l.includes('VS Code Launch')), 'Should have VS Code Launch category');
            assert.ok(categoryLabels.some(l => l.includes('VS Code Tasks')), 'Should have VS Code Tasks category');
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
            // 6 npm scripts: 4 from root + 2 from subproject
            const npmLabel = getLabelString(npmCategory.label);
            assert.ok(
                npmLabel.includes('(6)'),
                `NPM Scripts should show count (6), got: ${npmLabel}`
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
            // 3 launch configs: Debug Application, Debug Tests, Debug Python
            const launchLabel = getLabelString(launchCategory.label);
            assert.ok(
                launchLabel.includes('(3)'),
                `VS Code Launch should show count (3), got: ${launchLabel}`
            );
        });

        test('VS Code Tasks category shows correct count in label', async function() {
            this.timeout(10000);

            const roots = await getTreeChildren(provider);
            const tasksCategory = roots.find(r => getLabelString(r.label).includes('VS Code Tasks'));

            assert.ok(tasksCategory, 'VS Code Tasks category should exist');
            // 4 tasks: Build Project, Run Tests, Deploy with Config, Custom Build
            const tasksLabel = getLabelString(tasksCategory.label);
            assert.ok(
                tasksLabel.includes('(4)'),
                `VS Code Tasks should show count (4), got: ${tasksLabel}`
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

    suite('Filtering Verification', () => {
        test('text filter reduces visible tasks', async function() {
            this.timeout(10000);

            // Get initial count
            const rootsBefore = await getTreeChildren(provider);
            const totalBefore = countAllTasks(rootsBefore);

            // Apply filter
            provider.setTextFilter('build');
            const rootsAfter = await getTreeChildren(provider);
            const totalAfter = countAllTasks(rootsAfter);

            // Clear filter
            provider.clearFilters();

            assert.ok(totalAfter < totalBefore, `Filtering should reduce tasks: ${totalAfter} < ${totalBefore}`);
            assert.ok(totalAfter > 0, 'Filtering for "build" should still show some tasks');
        });

        test('filter shows only matching tasks', async function() {
            this.timeout(10000);

            provider.setTextFilter('deploy');
            const roots = await getTreeChildren(provider);

            const allTasks: TaskTreeItem[] = [];
            for (const category of roots) {
                allTasks.push(...flattenTaskItems(category.children));
            }

            provider.clearFilters();

            // All visible tasks should contain "deploy" in label, path, or description
            for (const task of allTasks) {
                const taskData = task.task;
                if (!taskData) {
                    continue;
                }
                const label = taskData.label.toLowerCase();
                const path = taskData.filePath.toLowerCase();
                const desc = (taskData.description ?? '').toLowerCase();
                const cat = taskData.category.toLowerCase();

                const matches = label.includes('deploy') ||
                    path.includes('deploy') ||
                    desc.includes('deploy') ||
                    cat.includes('deploy');

                assert.ok(matches, `Task "${taskData.label}" should match filter "deploy"`);
            }
        });

        test('clearing filter restores all tasks', async function() {
            this.timeout(10000);

            // Get initial count
            const rootsBefore = await getTreeChildren(provider);
            const totalBefore = countAllTasks(rootsBefore);

            // Apply and clear filter
            provider.setTextFilter('xyz-nonexistent');
            provider.clearFilters();

            const rootsAfter = await getTreeChildren(provider);
            const totalAfter = countAllTasks(rootsAfter);

            assert.strictEqual(totalAfter, totalBefore, 'Clearing filter should restore all tasks');
        });

        test('filter with no matches shows empty categories or hides them', async function() {
            this.timeout(10000);

            provider.setTextFilter('xyz-definitely-no-match-12345');
            const roots = await getTreeChildren(provider);
            const total = countAllTasks(roots);

            provider.clearFilters();

            assert.strictEqual(total, 0, 'Non-matching filter should show 0 tasks');
        });

        test('hasFilter returns correct state', function() {
            this.timeout(10000);

            provider.clearFilters();
            assert.strictEqual(provider.hasFilter(), false, 'hasFilter should be false when no filter');

            provider.setTextFilter('test');
            assert.strictEqual(provider.hasFilter(), true, 'hasFilter should be true after setTextFilter');

            provider.clearFilters();
            assert.strictEqual(provider.hasFilter(), false, 'hasFilter should be false after clearFilters');

            provider.setTagFilter('build');
            assert.strictEqual(provider.hasFilter(), true, 'hasFilter should be true after setTagFilter');

            provider.clearFilters();
        });
    });

    suite('Tag Filtering Verification', () => {
        test('tag filter reduces visible tasks', async function() {
            this.timeout(10000);

            const rootsBefore = await getTreeChildren(provider);
            const totalBefore = countAllTasks(rootsBefore);

            provider.setTagFilter('build');
            const rootsAfter = await getTreeChildren(provider);
            const totalAfter = countAllTasks(rootsAfter);

            provider.clearFilters();

            // Tag filter should reduce tasks (unless all tasks have 'build' tag)
            assert.ok(totalAfter <= totalBefore, `Tag filtering should not increase tasks: ${totalAfter} <= ${totalBefore}`);
        });

        test('filtered tasks have the correct tag', async function() {
            this.timeout(10000);

            provider.setTagFilter('build');
            const roots = await getTreeChildren(provider);

            const allTasks: TaskTreeItem[] = [];
            for (const category of roots) {
                allTasks.push(...flattenTaskItems(category.children));
            }

            provider.clearFilters();

            for (const task of allTasks) {
                const taskData = task.task;
                assert.ok(taskData, 'Task should have task data');
                assert.ok(
                    taskData.tags.includes('build'),
                    `Task "${taskData.label}" should have 'build' tag when filtered by build`
                );
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

/**
 * Counts all tasks across all categories
 */
function countAllTasks(roots: TaskTreeItem[]): number {
    let count = 0;
    for (const category of roots) {
        count += flattenTaskItems(category.children).length;
    }
    return count;
}
