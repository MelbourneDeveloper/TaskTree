/**
 * SPEC: tagging
 * E2E tests for junction table tagging system.
 * Tests exact command ID matching via SQLite junction table.
 *
 * Black-box testing through VS Code UI commands only.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import {
    activateExtension,
    sleep,
    getCommandTreeProvider,
} from '../helpers/helpers';
import type { CommandTreeProvider } from '../helpers/helpers';
import { getDb } from '../../semantic/lifecycle';
import { getCommandIdsByTag, getTagsForCommand } from '../../semantic/db';

// SPEC: tagging
suite('Junction Table Tagging E2E Tests', () => {
    let treeProvider: CommandTreeProvider;

    suiteSetup(async function () {
        this.timeout(30000);
        await activateExtension();
        treeProvider = getCommandTreeProvider();
        await sleep(2000);
    });

    // SPEC: database-schema/command-tags-junction
    test('E2E: Add tag via UI → exact ID stored in junction table', async function () {
        this.timeout(15000);

        const allTasks = treeProvider.getAllTasks();
        assert.ok(allTasks.length > 0, 'Must have tasks to test tagging');
        const task = allTasks[0];
        assert.ok(task !== undefined, 'First task must exist');

        const testTag = 'test-tag-e2e';

        // Add tag via UI command (passing tag name for automated testing)
        await vscode.commands.executeCommand('commandtree.addTag', task, testTag);
        await sleep(500);

        // Verify tag stored in database with exact command ID
        const dbResult = getDb();
        assert.ok(dbResult.ok, 'Database must be available');

        const tagsResult = getTagsForCommand({
            handle: dbResult.value,
            commandId: task.id
        });
        assert.ok(tagsResult.ok, 'Should get tags for command');
        assert.ok(tagsResult.value.length > 0, 'Task should have at least one tag');
        assert.ok(tagsResult.value.includes(testTag), `Task should have tag "${testTag}"`);

        // Clean up
        await vscode.commands.executeCommand('commandtree.removeTag', task, testTag);
        await sleep(500);
    });

    // SPEC: database-schema/command-tags-junction
    test('E2E: Remove tag via UI → junction record deleted', async function () {
        this.timeout(15000);

        const allTasks = treeProvider.getAllTasks();
        const task = allTasks[0];
        assert.ok(task !== undefined, 'First task must exist');

        const testTag = 'test-remove-tag';

        // Add tag first
        await vscode.commands.executeCommand('commandtree.addTag', task, testTag);
        await sleep(500);

        const dbResult = getDb();
        assert.ok(dbResult.ok, 'Database must be available');

        // Verify tag exists
        let tagsResult = getTagsForCommand({
            handle: dbResult.value,
            commandId: task.id
        });
        assert.ok(tagsResult.ok && tagsResult.value.length > 0, 'Tag should exist before removal');
        assert.ok(tagsResult.value.includes(testTag), `Task should have tag "${testTag}"`);

        // Remove tag via UI
        await vscode.commands.executeCommand('commandtree.removeTag', task, testTag);
        await sleep(500);

        // Verify tag removed from database
        tagsResult = getTagsForCommand({
            handle: dbResult.value,
            commandId: task.id
        });
        assert.ok(tagsResult.ok, 'Should get tags for command');
        assert.ok(
            !tagsResult.value.includes(testTag),
            `Tag "${testTag}" should be removed from command ${task.id}`
        );
    });

    // SPEC: database-schema/command-tags-junction
    test('E2E: Cannot add same tag twice (UNIQUE constraint)', async function () {
        this.timeout(15000);

        const allTasks = treeProvider.getAllTasks();
        const task = allTasks[0];
        assert.ok(task !== undefined, 'First task must exist');

        const testTag = 'test-unique-tag';

        // Add tag once
        await vscode.commands.executeCommand('commandtree.addTag', task, testTag);
        await sleep(500);

        const dbResult = getDb();
        assert.ok(dbResult.ok, 'Database must be available');

        const tagsResult1 = getTagsForCommand({
            handle: dbResult.value,
            commandId: task.id
        });
        assert.ok(tagsResult1.ok && tagsResult1.value.length > 0, 'Should have one tag');
        const initialCount = tagsResult1.value.length;

        // Try to add same tag again (should be ignored by INSERT OR IGNORE)
        await vscode.commands.executeCommand('commandtree.addTag', task, testTag);
        await sleep(500);

        const tagsResult2 = getTagsForCommand({
            handle: dbResult.value,
            commandId: task.id
        });
        assert.ok(tagsResult2.ok, 'Should get tags for command');
        assert.strictEqual(
            tagsResult2.value.length,
            initialCount,
            'Tag count should not increase when adding duplicate'
        );

        // Clean up
        await vscode.commands.executeCommand('commandtree.removeTag', task, testTag);
        await sleep(500);
    });

    // SPEC: database-schema/tag-operations
    test('E2E: Filter by tag → only exact ID matches shown', async function () {
        this.timeout(15000);

        const allTasks = treeProvider.getAllTasks();
        assert.ok(allTasks.length >= 2, 'Need at least 2 tasks for filtering test');

        const task1 = allTasks[0];
        const task2 = allTasks[1];
        assert.ok(task1 !== undefined && task2 !== undefined, 'Both tasks must exist');

        const testTag = 'filter-test-tag';

        // Tag only task1
        await vscode.commands.executeCommand('commandtree.addTag', task1, testTag);
        await sleep(500);

        // Verify database has exact ID for task1 only
        const dbResult = getDb();
        assert.ok(dbResult.ok, 'Database must be available');

        const commandIdsResult = getCommandIdsByTag({
            handle: dbResult.value,
            tagName: testTag
        });

        assert.ok(commandIdsResult.ok, 'Should get command IDs for tag');
        assert.ok(commandIdsResult.value.length > 0, 'Should have at least one tagged command');
        const taggedIds = commandIdsResult.value;
        assert.ok(
            taggedIds.includes(task1.id),
            `Tagged IDs should include task1 (${task1.id})`
        );
        assert.ok(
            !taggedIds.includes(task2.id),
            `Tagged IDs should NOT include task2 (${task2.id})`
        );

        // Clean up
        await vscode.commands.executeCommand('commandtree.removeTag', task1, testTag);
        await sleep(500);
    });
});
