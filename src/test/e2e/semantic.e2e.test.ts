/**
 * VECTOR EMBEDDING SEARCH — FULL E2E TESTS
 *
 * The extension generates summaries (Copilot) and embeddings (HuggingFace)
 * BY ITSELF. Tests drive search via the command UI surface and verify
 * the tree view shows correctly filtered, semantically relevant results.
 *
 * Pipeline: Copilot summary → MiniLM embedding → SQLite BLOB → cosine similarity
 *
 * These tests FAIL without GitHub Copilot — that is correct.
 * A failing test that enforces real behaviour is valid per CLAUDE.md.
 */

import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
    activateExtension,
    sleep,
    getFixturePath,
    getCommandTreeProvider
} from '../helpers/helpers';
import type { CommandTreeProvider, CommandTreeItem } from '../helpers/helpers';
import type { TaskItem } from '../../models/TaskItem';

const COMMANDTREE_DIR = '.commandtree';
const DB_FILENAME = 'commandtree.sqlite3';
const MIN_DB_SIZE_BYTES = 8192;
const SEARCH_SETTLE_MS = 2000;
const SHORT_SETTLE_MS = 1000;
const INPUT_BOX_RENDER_MS = 1000;

/**
 * Recursively collects every leaf TaskItem from the tree view.
 */
async function collectLeafTasks(
    provider: CommandTreeProvider
): Promise<TaskItem[]> {
    const out: TaskItem[] = [];
    for (const root of await provider.getChildren()) {
        await walkNode(provider, root, out);
    }
    return out;
}

async function walkNode(
    provider: CommandTreeProvider,
    node: CommandTreeItem,
    out: TaskItem[]
): Promise<void> {
    if (node.task !== null) { out.push(node.task); }
    for (const child of await provider.getChildren(node)) {
        await walkNode(provider, child, out);
    }
}

/**
 * Recursively collects every leaf CommandTreeItem for UI inspection.
 */
async function collectLeafItems(
    provider: CommandTreeProvider
): Promise<CommandTreeItem[]> {
    const out: CommandTreeItem[] = [];
    for (const root of await provider.getChildren()) {
        await walkNodeItems(provider, root, out);
    }
    return out;
}

async function walkNodeItems(
    provider: CommandTreeProvider,
    node: CommandTreeItem,
    out: CommandTreeItem[]
): Promise<void> {
    if (node.task !== null) { out.push(node); }
    for (const child of await provider.getChildren(node)) {
        await walkNodeItems(provider, child, out);
    }
}

/**
 * Extracts tooltip text from a CommandTreeItem.
 */
function getTooltipText(item: CommandTreeItem): string {
    if (item.tooltip instanceof vscode.MarkdownString) {
        return item.tooltip.value;
    }
    if (typeof item.tooltip === 'string') {
        return item.tooltip;
    }
    return '';
}

suite('Vector Embedding Search E2E', () => {
    let provider: CommandTreeProvider;
    let totalTaskCount: number;

    suiteSetup(async function () {
        this.timeout(300000); // 5 min — Copilot + model download
        await activateExtension();
        provider = getCommandTreeProvider();
        await sleep(3000);

        // Snapshot total task count before any filtering
        totalTaskCount = (await collectLeafTasks(provider)).length;
        assert.ok(totalTaskCount > 0, 'Fixture workspace must have discovered tasks');

        // Enable AI — extension uses Copilot + HuggingFace by itself
        await vscode.workspace.getConfiguration('commandtree')
            .update('enableAiSummaries', true, vscode.ConfigurationTarget.Workspace);
        await sleep(SHORT_SETTLE_MS);

        // Trigger the REAL pipeline: Copilot summaries → MiniLM embeddings → SQLite
        await vscode.commands.executeCommand('commandtree.generateSummaries');
        await sleep(5000);
    });

    suiteTeardown(async function () {
        this.timeout(15000);
        await vscode.commands.executeCommand('commandtree.clearFilter');
        await vscode.workspace.getConfiguration('commandtree')
            .update('enableAiSummaries', false, vscode.ConfigurationTarget.Workspace);

        // Clean up generated DB
        const dir = getFixturePath(COMMANDTREE_DIR);
        if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }
    });

    test('generateSummaries creates SQLite database with embeddings', function () {
        this.timeout(10000);
        const dbPath = getFixturePath(path.join(COMMANDTREE_DIR, DB_FILENAME));
        assert.ok(fs.existsSync(dbPath), 'SQLite database should exist');

        const stats = fs.statSync(dbPath);
        assert.ok(stats.size > 0, 'SQLite database should not be empty');
        assert.ok(
            stats.size >= MIN_DB_SIZE_BYTES,
            `SQLite DB should contain real data (${stats.size} bytes, need >=${MIN_DB_SIZE_BYTES})`
        );
    });

    test('tasks have AI-generated summaries after pipeline', async function () {
        this.timeout(15000);

        const tasks = await collectLeafTasks(provider);
        const withSummary = tasks.filter(
            t => t.summary !== undefined && t.summary !== ''
        );

        assert.ok(
            withSummary.length > 0,
            `At least one task should have an AI summary, got 0 out of ${tasks.length}`
        );
        for (const task of withSummary) {
            assert.ok(
                typeof task.summary === 'string' && task.summary.length > 5,
                `Summary for "${task.label}" should be a meaningful string, got: "${task.summary}"`
            );
        }
    });

    test('tree items show summaries in tooltips as markdown blockquotes', async function () {
        this.timeout(15000);

        const items = await collectLeafItems(provider);
        const withSummaryTooltip = items.filter(item => {
            const tip = getTooltipText(item);
            return tip.includes('> ');
        });

        assert.ok(
            withSummaryTooltip.length > 0,
            'At least one tree item should show summary as markdown blockquote in tooltip'
        );

        for (const item of withSummaryTooltip) {
            const tip = getTooltipText(item);
            assert.ok(
                tip.includes(`**${item.task?.label}**`),
                `Tooltip should contain the task label "${item.task?.label}"`
            );
            assert.ok(
                item.tooltip instanceof vscode.MarkdownString,
                'Tooltip should be a MarkdownString for rich display'
            );
        }
    });

    test('semantic search filters tree to relevant results', async function () {
        this.timeout(120000);

        await vscode.commands.executeCommand(
            'commandtree.semanticSearch', 'run tests'
        );
        await sleep(SEARCH_SETTLE_MS);

        assert.ok(provider.hasFilter(), 'Semantic filter should be active');

        const visible = await collectLeafTasks(provider);
        assert.ok(visible.length > 0, 'Search should return at least one result');
        assert.ok(
            visible.length < totalTaskCount,
            `Filter should reduce tasks (${visible.length} visible < ${totalTaskCount} total)`
        );

        await vscode.commands.executeCommand('commandtree.clearFilter');
    });

    test('clear filter restores all tasks after search', async function () {
        this.timeout(30000);

        // Apply a filter first
        await vscode.commands.executeCommand(
            'commandtree.semanticSearch', 'build'
        );
        await sleep(SEARCH_SETTLE_MS);
        assert.ok(provider.hasFilter(), 'Filter should be active before clearing');

        // Clear it
        await vscode.commands.executeCommand('commandtree.clearFilter');
        await sleep(SHORT_SETTLE_MS);

        assert.ok(!provider.hasFilter(), 'Filter should be cleared');
        const restored = await collectLeafTasks(provider);
        assert.strictEqual(
            restored.length, totalTaskCount,
            'All tasks should be visible after clearing filter'
        );
    });

    test('deploy query surfaces deploy-related tasks', async function () {
        this.timeout(120000);

        await vscode.commands.executeCommand(
            'commandtree.semanticSearch', 'deploy application to production server'
        );
        await sleep(SEARCH_SETTLE_MS);

        const results = await collectLeafTasks(provider);
        assert.ok(
            results.length > 0,
            '"deploy" query must return results'
        );
        assert.ok(
            results.length < totalTaskCount,
            `"deploy" query should not return all tasks (${results.length} < ${totalTaskCount})`
        );

        const labels = results.map(t => t.label.toLowerCase());
        const hasDeployResult = labels.some(l => l.includes('deploy'));
        assert.ok(
            hasDeployResult,
            `"deploy" query should include deploy tasks, got: [${labels.join(', ')}]`
        );

        await vscode.commands.executeCommand('commandtree.clearFilter');
    });

    test('build query surfaces build-related tasks', async function () {
        this.timeout(120000);

        await vscode.commands.executeCommand(
            'commandtree.semanticSearch', 'compile and build the project'
        );
        await sleep(SEARCH_SETTLE_MS);

        const results = await collectLeafTasks(provider);
        assert.ok(
            results.length > 0,
            '"build" query must return results'
        );

        const labels = results.map(t => t.label.toLowerCase());
        const hasBuildResult = labels.some(l => l.includes('build'));
        assert.ok(
            hasBuildResult,
            `"build" query should include build tasks, got: [${labels.join(', ')}]`
        );

        await vscode.commands.executeCommand('commandtree.clearFilter');
    });

    test('different queries produce different result sets', async function () {
        this.timeout(120000);

        // Search "build"
        await vscode.commands.executeCommand(
            'commandtree.semanticSearch', 'build project'
        );
        await sleep(SEARCH_SETTLE_MS);
        const buildResults = await collectLeafTasks(provider);
        const buildIds = new Set(buildResults.map(t => t.id));
        assert.ok(buildIds.size > 0, 'Build search should have results');

        // Search "deploy"
        await vscode.commands.executeCommand('commandtree.clearFilter');
        await sleep(500);
        await vscode.commands.executeCommand(
            'commandtree.semanticSearch', 'deploy to production'
        );
        await sleep(SEARCH_SETTLE_MS);
        const deployResults = await collectLeafTasks(provider);
        const deployIds = new Set(deployResults.map(t => t.id));
        assert.ok(deployIds.size > 0, 'Deploy search should have results');

        const identical = buildIds.size === deployIds.size
            && [...buildIds].every(id => deployIds.has(id));
        assert.ok(!identical, 'Different queries should produce different result sets');

        await vscode.commands.executeCommand('commandtree.clearFilter');
    });

    test('empty query does not activate filter', async function () {
        this.timeout(15000);

        await vscode.commands.executeCommand('commandtree.semanticSearch', '');
        await sleep(SHORT_SETTLE_MS);

        assert.ok(!provider.hasFilter(), 'Empty query should not activate filter');
        const tasks = await collectLeafTasks(provider);
        assert.strictEqual(
            tasks.length, totalTaskCount,
            'All tasks should remain visible after empty query'
        );
    });

    test('test query surfaces test-related tasks', async function () {
        this.timeout(120000);

        await vscode.commands.executeCommand(
            'commandtree.semanticSearch', 'run the test suite'
        );
        await sleep(SEARCH_SETTLE_MS);

        const results = await collectLeafTasks(provider);
        assert.ok(
            results.length > 0,
            '"test" query must return results'
        );

        const labels = results.map(t => t.label.toLowerCase());
        const hasTestResult = labels.some(
            l => l.includes('test') || l.includes('spec') || l.includes('check')
        );
        assert.ok(
            hasTestResult,
            `"test" query should include test tasks, got: [${labels.join(', ')}]`
        );

        await vscode.commands.executeCommand('commandtree.clearFilter');
    });

    test('search command without args opens input box and cancellation is clean', async function () {
        this.timeout(30000);

        // Trigger search without query arg → opens VS Code input box
        const searchPromise = vscode.commands.executeCommand(
            'commandtree.semanticSearch'
        );
        await sleep(INPUT_BOX_RENDER_MS);

        // Dismiss the input box (simulates user pressing Escape)
        await vscode.commands.executeCommand('workbench.action.closeQuickOpen');
        await searchPromise;
        await sleep(SHORT_SETTLE_MS);

        // Cancelling input box should not activate any filter
        assert.ok(
            !provider.hasFilter(),
            'Cancelling input box should not activate semantic filter'
        );

        // All tasks should still be visible after cancellation
        const tasks = await collectLeafTasks(provider);
        assert.strictEqual(
            tasks.length, totalTaskCount,
            'All tasks should remain visible after cancelling search input'
        );
    });

    test('filtered tree items retain correct UI properties', async function () {
        this.timeout(120000);

        await vscode.commands.executeCommand(
            'commandtree.semanticSearch', 'build'
        );
        await sleep(SEARCH_SETTLE_MS);

        const items = await collectLeafItems(provider);
        assert.ok(items.length > 0, 'Filtered tree should have items');

        for (const item of items) {
            assert.ok(
                item.task !== null,
                'Leaf items should have a task'
            );
            assert.ok(
                typeof item.label === 'string' || typeof item.label === 'object',
                'Tree item should have a label'
            );
            assert.ok(
                item.tooltip !== undefined,
                `Tree item "${item.task.label}" should have a tooltip`
            );
            assert.ok(
                item.iconPath !== undefined,
                `Tree item "${item.task.label}" should have an icon`
            );
            assert.ok(
                item.contextValue === 'task' || item.contextValue === 'task-quick',
                `Leaf item should have task context value, got: "${item.contextValue}"`
            );
        }

        await vscode.commands.executeCommand('commandtree.clearFilter');
    });
});
