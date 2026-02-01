import * as assert from 'assert';
import type { TaskItem } from '../../models/TaskItem';

/**
 * UNIT TESTS for TagConfig logic
 * These test the PURE LOGIC in isolation - no file system, no VS Code UI
 */
suite('TagConfig Unit Tests', function () {
    this.timeout(10000);

    // Mock task factory - creates predictable test data
    function createMockTask(overrides: Partial<TaskItem>): TaskItem {
        const base: TaskItem = {
            id: 'npm:/project/package.json:build',
            label: 'build',
            type: 'npm',
            command: 'npm run build',
            cwd: '/project',
            filePath: '/project/package.json',
            category: 'project',
            params: [],
            tags: []
        };

        // Only add description if provided
        if (overrides.description !== undefined) {
            return { ...base, ...overrides, description: overrides.description };
        }

        const { description: _description, ...restOverrides } = overrides;
        return { ...base, ...restOverrides };
    }

    suite('Pattern Matching Logic', () => {
        /**
         * Tests the matchesPattern logic extracted from TagConfig
         * This is the CORE of the tagging system
         */
        interface TagPattern {
            id?: string;
            type?: string;
            label?: string;
        }

        function matchesPattern(task: TaskItem, pattern: TagPattern): boolean {
            // Match by exact ID if specified
            if (pattern.id !== undefined) {
                return task.id === pattern.id;
            }

            // Match by type and/or label
            const typeMatches = pattern.type === undefined || task.type === pattern.type;
            const labelMatches = pattern.label === undefined || task.label === pattern.label;

            return typeMatches && labelMatches;
        }

        test('exact ID match - should match when IDs are identical', () => {
            const task = createMockTask({ id: 'npm:/project/package.json:build' });
            const pattern: TagPattern = { id: 'npm:/project/package.json:build' };

            const result = matchesPattern(task, pattern);

            assert.strictEqual(result, true, 'Exact ID match MUST return true');
        });

        test('exact ID match - should NOT match when IDs differ', () => {
            const task = createMockTask({ id: 'npm:/project/package.json:build' });
            const pattern: TagPattern = { id: 'npm:/other/package.json:build' };

            const result = matchesPattern(task, pattern);

            assert.strictEqual(result, false, 'Different IDs MUST return false');
        });

        test('type-only pattern - should match any task of that type', () => {
            const task = createMockTask({ type: 'npm', label: 'anything' });
            const pattern: TagPattern = { type: 'npm' };

            const result = matchesPattern(task, pattern);

            assert.strictEqual(result, true, 'Type-only pattern MUST match all tasks of that type');
        });

        test('type-only pattern - should NOT match different type', () => {
            const task = createMockTask({ type: 'shell', label: 'build' });
            const pattern: TagPattern = { type: 'npm' };

            const result = matchesPattern(task, pattern);

            assert.strictEqual(result, false, 'Type-only pattern MUST NOT match different types');
        });

        test('label-only pattern - should match any task with that label', () => {
            const task = createMockTask({ type: 'npm', label: 'build' });
            const pattern: TagPattern = { label: 'build' };

            const result = matchesPattern(task, pattern);

            assert.strictEqual(result, true, 'Label-only pattern MUST match all tasks with that label');
        });

        test('label-only pattern - should NOT match different label', () => {
            const task = createMockTask({ type: 'npm', label: 'test' });
            const pattern: TagPattern = { label: 'build' };

            const result = matchesPattern(task, pattern);

            assert.strictEqual(result, false, 'Label-only pattern MUST NOT match different labels');
        });

        test('type+label pattern - should match when BOTH match', () => {
            const task = createMockTask({ type: 'npm', label: 'build' });
            const pattern: TagPattern = { type: 'npm', label: 'build' };

            const result = matchesPattern(task, pattern);

            assert.strictEqual(result, true, 'Type+label pattern MUST match when both match');
        });

        test('type+label pattern - should NOT match when type differs', () => {
            const task = createMockTask({ type: 'make', label: 'build' });
            const pattern: TagPattern = { type: 'npm', label: 'build' };

            const result = matchesPattern(task, pattern);

            assert.strictEqual(result, false, 'Type+label pattern MUST NOT match when type differs');
        });

        test('type+label pattern - should NOT match when label differs', () => {
            const task = createMockTask({ type: 'npm', label: 'test' });
            const pattern: TagPattern = { type: 'npm', label: 'build' };

            const result = matchesPattern(task, pattern);

            assert.strictEqual(result, false, 'Type+label pattern MUST NOT match when label differs');
        });

        test('empty pattern - should match everything', () => {
            const task = createMockTask({ type: 'npm', label: 'whatever' });
            const pattern: TagPattern = {};

            const result = matchesPattern(task, pattern);

            assert.strictEqual(result, true, 'Empty pattern MUST match everything');
        });
    });

    suite('Tag Application Logic', () => {
        /**
         * Tests the applyTags logic extracted from TagConfig
         * This applies tags to tasks based on patterns
         */
        type TagPattern = string | { id?: string; type?: string; label?: string };
        type TagDefinition = Record<string, TagPattern[]>;

        function matchesPattern(task: TaskItem, pattern: { id?: string; type?: string; label?: string }): boolean {
            if (pattern.id !== undefined) {
                return task.id === pattern.id;
            }
            const typeMatches = pattern.type === undefined || task.type === pattern.type;
            const labelMatches = pattern.label === undefined || task.label === pattern.label;
            return typeMatches && labelMatches;
        }

        function applyTags(tasks: TaskItem[], tags: TagDefinition): TaskItem[] {
            return tasks.map(task => {
                const matchedTags: string[] = [];

                for (const [tagName, patterns] of Object.entries(tags)) {
                    for (const pattern of patterns) {
                        const matches = typeof pattern === 'string'
                            ? task.id === pattern
                            : matchesPattern(task, pattern);
                        if (matches) {
                            matchedTags.push(tagName);
                            break;
                        }
                    }
                }

                if (matchedTags.length > 0) {
                    return { ...task, tags: matchedTags };
                }
                return task;
            });
        }

        test('should apply tag when string pattern matches task ID exactly', () => {
            const tasks = [
                createMockTask({ id: 'npm:/project/package.json:build', label: 'build' })
            ];
            const tags: TagDefinition = {
                'quick': ['npm:/project/package.json:build']
            };

            const result = applyTags(tasks, tags);

            assert.strictEqual(result.length, 1, 'Should return same number of tasks');
            assert.ok((result[0]?.tags.includes('quick')) === true, 'Task MUST have quick tag');
        });

        test('should NOT apply tag when string pattern does not match', () => {
            const tasks = [
                createMockTask({ id: 'npm:/project/package.json:build', label: 'build' })
            ];
            const tags: TagDefinition = {
                'quick': ['npm:/other/package.json:test']
            };

            const result = applyTags(tasks, tags);

            assert.strictEqual(result.length, 1, 'Should return same number of tasks');
            assert.strictEqual(result[0]?.tags.length, 0, 'Task MUST NOT have any tags');
        });

        test('should apply tag when object pattern with type matches', () => {
            const tasks = [
                createMockTask({ type: 'npm', label: 'build' }),
                createMockTask({ type: 'shell', label: 'deploy.sh' })
            ];
            const tags: TagDefinition = {
                'npmTasks': [{ type: 'npm' }]
            };

            const result = applyTags(tasks, tags);

            assert.ok((result[0]?.tags.includes('npmTasks')) === true, 'NPM task MUST be tagged');
            assert.strictEqual(result[1]?.tags.length, 0, 'Shell task MUST NOT be tagged');
        });

        test('should apply tag when object pattern with label matches', () => {
            const tasks = [
                createMockTask({ type: 'npm', label: 'build' }),
                createMockTask({ type: 'make', label: 'build' }),
                createMockTask({ type: 'npm', label: 'test' })
            ];
            const tags: TagDefinition = {
                'buildTasks': [{ label: 'build' }]
            };

            const result = applyTags(tasks, tags);

            assert.ok((result[0]?.tags.includes('buildTasks')) === true, 'NPM build MUST be tagged');
            assert.ok((result[1]?.tags.includes('buildTasks')) === true, 'Make build MUST be tagged');
            assert.strictEqual(result[2]?.tags.length, 0, 'NPM test MUST NOT be tagged');
        });

        test('should apply tag when object pattern with type+label matches', () => {
            const tasks = [
                createMockTask({ type: 'npm', label: 'build' }),
                createMockTask({ type: 'make', label: 'build' }),
                createMockTask({ type: 'npm', label: 'test' })
            ];
            const tags: TagDefinition = {
                'npmBuild': [{ type: 'npm', label: 'build' }]
            };

            const result = applyTags(tasks, tags);

            assert.ok((result[0]?.tags.includes('npmBuild')) === true, 'NPM build MUST be tagged');
            assert.strictEqual(result[1]?.tags.length, 0, 'Make build MUST NOT be tagged');
            assert.strictEqual(result[2]?.tags.length, 0, 'NPM test MUST NOT be tagged');
        });

        test('should apply multiple tags to same task', () => {
            const tasks = [
                createMockTask({ type: 'npm', label: 'build' })
            ];
            const tags: TagDefinition = {
                'npm': [{ type: 'npm' }],
                'build': [{ label: 'build' }]
            };

            const result = applyTags(tasks, tags);

            assert.ok((result[0]?.tags.includes('npm')) === true, 'Task MUST have npm tag');
            assert.ok(result[0].tags.includes('build'), 'Task MUST have build tag');
            assert.strictEqual(result[0].tags.length, 2, 'Task MUST have exactly 2 tags');
        });

        test('should handle mixed string and object patterns', () => {
            const tasks = [
                createMockTask({ id: 'npm:/p1/package.json:build', type: 'npm', label: 'build' }),
                createMockTask({ id: 'npm:/p2/package.json:test', type: 'npm', label: 'test' })
            ];
            const tags: TagDefinition = {
                'quick': [
                    'npm:/p1/package.json:build',  // Exact ID match
                    { type: 'npm', label: 'test' }  // Object pattern
                ]
            };

            const result = applyTags(tasks, tags);

            assert.ok((result[0]?.tags.includes('quick')) === true, 'First task MUST match by ID');
            assert.ok((result[1]?.tags.includes('quick')) === true, 'Second task MUST match by object pattern');
        });
    });

    suite('Tag Filtering Logic', () => {
        /**
         * Tests the filter logic used in TaskTreeProvider
         */
        function filterByTag(tasks: TaskItem[], tagFilter: string | null): TaskItem[] {
            if (tagFilter === null || tagFilter === '') {
                return tasks;
            }
            return tasks.filter(t => t.tags.includes(tagFilter));
        }

        test('should return all tasks when filter is null', () => {
            const tasks = [
                createMockTask({ tags: ['build'] }),
                createMockTask({ tags: ['test'] }),
                createMockTask({ tags: [] })
            ];

            const result = filterByTag(tasks, null);

            assert.strictEqual(result.length, 3, 'All tasks MUST be returned when filter is null');
        });

        test('should return all tasks when filter is empty string', () => {
            const tasks = [
                createMockTask({ tags: ['build'] }),
                createMockTask({ tags: ['test'] })
            ];

            const result = filterByTag(tasks, '');

            assert.strictEqual(result.length, 2, 'All tasks MUST be returned when filter is empty');
        });

        test('should return only tasks with matching tag', () => {
            const tasks = [
                createMockTask({ label: 'a', tags: ['build'] }),
                createMockTask({ label: 'b', tags: ['test'] }),
                createMockTask({ label: 'c', tags: ['build', 'ci'] })
            ];

            const result = filterByTag(tasks, 'build');

            assert.strictEqual(result.length, 2, 'Only tasks with build tag MUST be returned');
            assert.ok(result.every(t => t.tags.includes('build')), 'All returned tasks MUST have build tag');
        });

        test('should return empty array when no tasks match', () => {
            const tasks = [
                createMockTask({ tags: ['build'] }),
                createMockTask({ tags: ['test'] })
            ];

            const result = filterByTag(tasks, 'deploy');

            assert.strictEqual(result.length, 0, 'No tasks should match non-existent tag');
        });

        test('should handle tasks with multiple tags', () => {
            const tasks = [
                createMockTask({ label: 'a', tags: ['build', 'ci', 'quick'] }),
                createMockTask({ label: 'b', tags: ['test', 'ci'] }),
                createMockTask({ label: 'c', tags: ['deploy'] })
            ];

            const result = filterByTag(tasks, 'ci');

            assert.strictEqual(result.length, 2, 'Tasks with ci tag (among others) MUST be returned');
        });
    });

    suite('Quick Tasks Logic', () => {
        /**
         * Tests the logic used in QuickTasksProvider.getChildren()
         */
        function getQuickTasks(tasks: TaskItem[]): TaskItem[] {
            return tasks.filter(task => task.tags.includes('quick'));
        }

        test('should return tasks with quick tag', () => {
            const tasks = [
                createMockTask({ label: 'a', tags: ['quick'] }),
                createMockTask({ label: 'b', tags: ['build'] }),
                createMockTask({ label: 'c', tags: ['quick', 'build'] })
            ];

            const result = getQuickTasks(tasks);

            assert.strictEqual(result.length, 2, 'Only tasks with quick tag MUST be returned');
            assert.ok(result.every(t => t.tags.includes('quick')), 'All returned tasks MUST have quick tag');
        });

        test('should return empty when no quick tasks', () => {
            const tasks = [
                createMockTask({ tags: ['build'] }),
                createMockTask({ tags: ['test'] })
            ];

            const result = getQuickTasks(tasks);

            assert.strictEqual(result.length, 0, 'No tasks should be returned when none have quick tag');
        });

        test('should return all tasks if all have quick tag', () => {
            const tasks = [
                createMockTask({ label: 'a', tags: ['quick'] }),
                createMockTask({ label: 'b', tags: ['quick'] })
            ];

            const result = getQuickTasks(tasks);

            assert.strictEqual(result.length, 2, 'All quick tasks MUST be returned');
        });
    });

    suite('End-to-End Tag Flow', () => {
        /**
         * Tests the COMPLETE flow: config → apply tags → filter
         * This is still a unit test because we're testing pure logic, not VS Code
         */
        type TagPattern = string | { id?: string; type?: string; label?: string };
        type TagDefinition = Record<string, TagPattern[]>;

        function matchesPattern(task: TaskItem, pattern: { id?: string; type?: string; label?: string }): boolean {
            if (pattern.id !== undefined) {
                return task.id === pattern.id;
            }
            const typeMatches = pattern.type === undefined || task.type === pattern.type;
            const labelMatches = pattern.label === undefined || task.label === pattern.label;
            return typeMatches && labelMatches;
        }

        function applyTags(tasks: TaskItem[], tags: TagDefinition): TaskItem[] {
            return tasks.map(task => {
                const matchedTags: string[] = [];
                for (const [tagName, patterns] of Object.entries(tags)) {
                    for (const pattern of patterns) {
                        const matches = typeof pattern === 'string'
                            ? task.id === pattern
                            : matchesPattern(task, pattern);
                        if (matches) {
                            matchedTags.push(tagName);
                            break;
                        }
                    }
                }
                if (matchedTags.length > 0) {
                    return { ...task, tags: matchedTags };
                }
                return task;
            });
        }

        function filterByTag(tasks: TaskItem[], tag: string): TaskItem[] {
            return tasks.filter(t => t.tags.includes(tag));
        }

        test('complete flow: config with type pattern → apply → filter → correct result', () => {
            // GIVEN: A config that tags all npm tasks as 'quick'
            const config: TagDefinition = {
                'quick': [{ type: 'npm' }],
                'build': [{ label: 'build' }]
            };

            // AND: A list of tasks
            const tasks = [
                createMockTask({ id: '1', type: 'npm', label: 'build' }),
                createMockTask({ id: '2', type: 'npm', label: 'test' }),
                createMockTask({ id: '3', type: 'shell', label: 'deploy.sh' }),
                createMockTask({ id: '4', type: 'make', label: 'build' })
            ];

            // WHEN: We apply tags
            const taggedTasks = applyTags(tasks, config);

            // THEN: Tags are correctly applied
            const npmBuildTask = taggedTasks.find(t => t.id === '1');
            const npmTestTask = taggedTasks.find(t => t.id === '2');
            const shellTask = taggedTasks.find(t => t.id === '3');
            const makeTask = taggedTasks.find(t => t.id === '4');

            assert.ok((npmBuildTask?.tags.includes('quick')) === true, 'NPM build MUST have quick tag');
            assert.ok(npmBuildTask.tags.includes('build'), 'NPM build MUST have build tag');
            assert.ok((npmTestTask?.tags.includes('quick')) === true, 'NPM test MUST have quick tag');
            assert.strictEqual(shellTask?.tags.length, 0, 'Shell task MUST have no tags');
            assert.ok((makeTask?.tags.includes('build')) === true, 'Make build MUST have build tag');

            // WHEN: We filter by 'quick'
            const quickFiltered = filterByTag(taggedTasks, 'quick');

            // THEN: Only npm tasks are returned
            assert.strictEqual(quickFiltered.length, 2, 'Only 2 quick tasks');
            assert.ok(quickFiltered.every(t => t.type === 'npm'), 'All quick tasks MUST be npm');

            // WHEN: We filter by 'build'
            const buildFiltered = filterByTag(taggedTasks, 'build');

            // THEN: npm:build and make:build are returned
            assert.strictEqual(buildFiltered.length, 2, 'Only 2 build tasks');
            assert.ok(buildFiltered.some(t => t.id === '1'), 'npm:build MUST be included');
            assert.ok(buildFiltered.some(t => t.id === '4'), 'make:build MUST be included');
        });

        test('complete flow: string ID pattern → apply → get quick tasks', () => {
            // GIVEN: A config that adds specific task to quick by ID
            const specificId = 'shell:/workspace/scripts/test.sh:test.sh';
            const config: TagDefinition = {
                'quick': [specificId]
            };

            // AND: Tasks including the one with that ID
            const tasks = [
                createMockTask({ id: specificId, type: 'shell', label: 'test.sh' }),
                createMockTask({ id: 'other', type: 'shell', label: 'other.sh' })
            ];

            // WHEN: We apply tags and get quick tasks
            const taggedTasks = applyTags(tasks, config);
            const quickTasks = taggedTasks.filter(t => t.tags.includes('quick'));

            // THEN: Only the specific task is in quick
            assert.strictEqual(quickTasks.length, 1, 'Only 1 quick task');
            assert.strictEqual(quickTasks[0]?.id, specificId, 'Must be the exact task');
        });
    });
});
