import * as assert from 'assert';
import type { TaskItem } from '../../models/TaskItem';

/**
 * PURE UNIT TESTS for tree hierarchy building logic.
 * Tests the folder grouping behavior extracted from TaskTreeProvider.buildCategoryWithFolders.
 * NO VS Code - tests pure functions only.
 */
suite('Tree Hierarchy Unit Tests', function () {
    this.timeout(10000);

    function createMockTask(overrides: Partial<TaskItem>): TaskItem {
        const base: TaskItem = {
            id: 'shell:/project/script.sh:run',
            label: 'run',
            type: 'shell',
            command: './run.sh',
            cwd: '/project',
            filePath: '/project/script.sh',
            category: 'Root',
            tags: []
        };

        if (overrides.description !== undefined) {
            return { ...base, ...overrides, description: overrides.description };
        }

        const restOverrides = { ...overrides };
        delete (restOverrides as { description?: string }).description;
        return { ...base, ...restOverrides };
    }

    /**
     * Represents a built tree node (mirrors TaskTreeItem structure without VS Code dependency).
     */
    interface TreeNode {
        readonly label: string;
        readonly isFolder: boolean;
        readonly children: TreeNode[];
        readonly task: TaskItem | null;
    }

    /**
     * Pure logic extracted from TaskTreeProvider.buildCategoryWithFolders.
     * Groups tasks by category and builds a tree hierarchy.
     */
    function buildCategoryWithFolders(tasks: TaskItem[]): TreeNode {
        const grouped = new Map<string, TaskItem[]>();
        for (const task of tasks) {
            const existing = grouped.get(task.category) ?? [];
            existing.push(task);
            grouped.set(task.category, existing);
        }

        const sortedEntries = Array.from(grouped.entries())
            .sort((a, b) => a[0].localeCompare(b[0]));

        const children: TreeNode[] = [];
        const hasManyFolders = sortedEntries.length > 1;

        for (const [folder, folderTasks] of sortedEntries) {
            const firstTask = folderTasks[0];
            if (folderTasks.length === 1 && !hasManyFolders && firstTask) {
                // Single task in single folder - no folder node needed
                children.push({
                    label: firstTask.label,
                    isFolder: false,
                    children: [],
                    task: firstTask
                });
            } else {
                // Wrap in folder node so all children are at the same tree level
                const taskNodes = folderTasks.map(t => ({
                    label: t.label,
                    isFolder: false,
                    children: [],
                    task: t
                }));
                children.push({
                    label: folder,
                    isFolder: true,
                    children: taskNodes,
                    task: null
                });
            }
        }

        return {
            label: `Shell Scripts (${tasks.length})`,
            isFolder: true,
            children,
            task: null
        };
    }

    suite('Folder grouping', () => {
        test('single task in single folder should NOT create folder node', () => {
            const tasks = [
                createMockTask({ label: 'start.sh', category: 'Samples' })
            ];

            const root = buildCategoryWithFolders(tasks);

            assert.strictEqual(root.children.length, 1, 'Should have exactly 1 child');
            assert.strictEqual(root.children[0]?.isFolder, false, 'Single task in single folder should be a task node, not a folder');
            assert.strictEqual(root.children[0]?.label, 'start.sh', 'Child should be the task itself');
        });

        test('multiple tasks in single folder should create folder node', () => {
            const tasks = [
                createMockTask({ id: 'a', label: 'start.sh', category: 'Samples/.../Dependencies' }),
                createMockTask({ id: 'b', label: 'stop.sh', category: 'Samples/.../Dependencies' })
            ];

            const root = buildCategoryWithFolders(tasks);

            assert.strictEqual(root.children.length, 1, 'Should have 1 folder child');
            assert.strictEqual(root.children[0]?.isFolder, true, 'Child should be a folder node');
            assert.strictEqual(root.children[0]?.children.length, 2, 'Folder should contain 2 tasks');
        });

        test('single-task folder alongside multi-task folder MUST be wrapped in folder node', () => {
            // This is the exact bug scenario:
            // import.sh is alone in Samples/.../CreateDb
            // start.sh + stop.sh are in Samples/.../Dependencies
            // Without fix: import.sh renders bare, Dependencies folder looks nested under it
            const tasks = [
                createMockTask({
                    id: 'shell:import',
                    label: 'import.sh',
                    category: 'Samples/.../CreateDb'
                }),
                createMockTask({
                    id: 'shell:start',
                    label: 'start.sh',
                    category: 'Samples/.../Dependencies'
                }),
                createMockTask({
                    id: 'shell:stop',
                    label: 'stop.sh',
                    category: 'Samples/.../Dependencies'
                })
            ];

            const root = buildCategoryWithFolders(tasks);

            // ALL children of the category MUST be folder nodes
            assert.strictEqual(root.children.length, 2, 'Should have 2 folder children');

            const createDbFolder = root.children[0];
            const dependenciesFolder = root.children[1];

            // The single-task folder MUST still be a folder node
            assert.strictEqual(
                createDbFolder?.isFolder, true,
                'Single-task folder MUST be wrapped in a folder node when other folders exist'
            );
            assert.strictEqual(createDbFolder?.label, 'Samples/.../CreateDb');
            assert.strictEqual(createDbFolder?.children.length, 1, 'CreateDb folder should have 1 task');
            assert.strictEqual(createDbFolder?.children[0]?.label, 'import.sh');

            // The multi-task folder should also be a folder node
            assert.strictEqual(dependenciesFolder?.isFolder, true, 'Multi-task folder MUST be a folder node');
            assert.strictEqual(dependenciesFolder?.label, 'Samples/.../Dependencies');
            assert.strictEqual(dependenciesFolder?.children.length, 2, 'Dependencies folder should have 2 tasks');
        });

        test('multiple single-task folders should all be wrapped in folder nodes', () => {
            const tasks = [
                createMockTask({ id: 'a', label: 'build.sh', category: 'Samples/build' }),
                createMockTask({ id: 'b', label: 'deploy.sh', category: 'Samples/deploy' }),
                createMockTask({ id: 'c', label: 'test.sh', category: 'Samples/test' })
            ];

            const root = buildCategoryWithFolders(tasks);

            assert.strictEqual(root.children.length, 3, 'Should have 3 folder children');
            for (const child of root.children) {
                assert.strictEqual(
                    child.isFolder, true,
                    `"${child.label}" MUST be a folder node when multiple folders exist`
                );
                assert.strictEqual(child.children.length, 1, 'Each folder should have 1 task');
            }
        });
    });
});
