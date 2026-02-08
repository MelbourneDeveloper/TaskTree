import * as vscode from 'vscode';
import * as path from 'path';
import { CommandTreeProvider } from './CommandTreeProvider';
import type { CommandTreeItem } from './models/TaskItem';
import { TaskRunner } from './runners/TaskRunner';
import { QuickTasksProvider } from './QuickTasksProvider';
import { logger } from './utils/logger';
import {
    isAiEnabled,
    summariseAllTasks,
    semanticSearch,
    initSemanticStore,
    disposeSemanticStore,
    migrateIfNeeded
} from './semantic';
import { initDb } from './semantic/lifecycle';
import { replaceTagPatterns } from './semantic/db';
import { createVSCodeFileSystem } from './semantic/vscodeAdapters';

let treeProvider: CommandTreeProvider;
let quickTasksProvider: QuickTasksProvider;
let taskRunner: TaskRunner;

export interface ExtensionExports {
    commandTreeProvider: CommandTreeProvider;
    quickTasksProvider: QuickTasksProvider;
}

export async function activate(context: vscode.ExtensionContext): Promise<ExtensionExports | undefined> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    logger.info('Extension activating', { workspaceRoot });
    if (workspaceRoot === undefined || workspaceRoot === '') {
        logger.warn('No workspace root found, extension not activating');
        return;
    }
    await initSemanticSubsystem(workspaceRoot);
    treeProvider = new CommandTreeProvider(workspaceRoot);
    // SPEC.md **user-data-storage**: Tags stored in SQLite, not .vscode/commandtree.json
    quickTasksProvider = new QuickTasksProvider();
    taskRunner = new TaskRunner();
    registerTreeViews(context);
    registerCommands(context, workspaceRoot);
    setupFileWatcher(context, workspaceRoot);
    await syncQuickTasks(workspaceRoot);
    initAiSummaries(workspaceRoot);
    return { commandTreeProvider: treeProvider, quickTasksProvider };
}

async function initSemanticSubsystem(workspaceRoot: string): Promise<void> {
    const storeResult = await initSemanticStore(workspaceRoot);
    if (!storeResult.ok) {
        logger.warn('SQLite init failed, semantic search unavailable', { error: storeResult.error });
    }
    migrateIfNeeded({ workspaceRoot }).catch((e: unknown) => {
        logger.warn('Migration failed', { error: e instanceof Error ? e.message : 'Unknown' });
    });
}

function registerTreeViews(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.window.createTreeView('commandtree', {
            treeDataProvider: treeProvider,
            showCollapseAll: true
        }),
        vscode.window.createTreeView('commandtree-quick', {
            treeDataProvider: quickTasksProvider,
            showCollapseAll: true,
            dragAndDropController: quickTasksProvider
        })
    );
}

function registerCommands(context: vscode.ExtensionContext, workspaceRoot: string): void {
    registerCoreCommands(context);
    registerFilterCommands(context, workspaceRoot);
    registerTagCommands(context);
    registerQuickCommands(context);
}

function registerCoreCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('commandtree.refresh', async () => {
            await treeProvider.refresh();
            quickTasksProvider.updateTasks(treeProvider.getAllTasks());
            vscode.window.showInformationMessage('CommandTree refreshed');
        }),
        vscode.commands.registerCommand('commandtree.run', async (item: CommandTreeItem | undefined) => {
            if (item !== undefined && item.task !== null) {
                await taskRunner.run(item.task, 'newTerminal');
            }
        }),
        vscode.commands.registerCommand('commandtree.runInCurrentTerminal', async (item: CommandTreeItem | undefined) => {
            if (item !== undefined && item.task !== null) {
                await taskRunner.run(item.task, 'currentTerminal');
            }
        })
    );
}

function registerFilterCommands(context: vscode.ExtensionContext, workspaceRoot: string): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('commandtree.filter', handleFilter),
        vscode.commands.registerCommand('commandtree.filterByTag', handleFilterByTag),
        vscode.commands.registerCommand('commandtree.clearFilter', () => {
            treeProvider.clearFilters();
            updateFilterContext();
        }),
        vscode.commands.registerCommand('commandtree.semanticSearch', async (q?: string) => { await handleSemanticSearch(q, workspaceRoot); }),
        vscode.commands.registerCommand('commandtree.generateSummaries', async () => { await runSummarisation(workspaceRoot); })
    );
}

function registerTagCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('commandtree.editTags', () => { treeProvider.editTags(); }),
        vscode.commands.registerCommand('commandtree.addTag', handleAddTag),
        vscode.commands.registerCommand('commandtree.removeTag', handleRemoveTag)
    );
}

function registerQuickCommands(context: vscode.ExtensionContext): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('commandtree.addToQuick', async (item: CommandTreeItem | undefined) => {
            if (item !== undefined && item.task !== null) {
                quickTasksProvider.addToQuick(item.task);
                await treeProvider.refresh();
                quickTasksProvider.updateTasks(treeProvider.getAllTasks());
            }
        }),
        vscode.commands.registerCommand('commandtree.removeFromQuick', async (item: CommandTreeItem | undefined) => {
            if (item !== undefined && item.task !== null) {
                quickTasksProvider.removeFromQuick(item.task);
                await treeProvider.refresh();
                quickTasksProvider.updateTasks(treeProvider.getAllTasks());
            }
        }),
        vscode.commands.registerCommand('commandtree.refreshQuick', () => {
            quickTasksProvider.refresh();
        })
    );
}

async function handleFilter(): Promise<void> {
    const filter = await vscode.window.showInputBox({
        prompt: 'Filter commands by name, path, or description',
        placeHolder: 'Type to filter...',
        value: ''
    });
    if (filter !== undefined) {
        treeProvider.setTextFilter(filter);
        updateFilterContext();
    }
}

async function handleFilterByTag(): Promise<void> {
    const tags = treeProvider.getAllTags();
    if (tags.length === 0) {
        const action = await vscode.window.showInformationMessage(
            'No tags defined. Create tag configuration?', 'Create'
        );
        if (action === 'Create') { treeProvider.editTags(); }
        return;
    }
    const items = [
        { label: '$(close) Clear tag filter', tag: null },
        ...tags.map(t => ({ label: `$(tag) ${t}`, tag: t }))
    ];
    const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select tag to filter by'
    });
    if (selected) {
        treeProvider.setTagFilter(selected.tag);
        updateFilterContext();
    }
}

async function handleAddTag(item: CommandTreeItem | undefined): Promise<void> {
    const task = item?.task;
    if (task === undefined || task === null) { return; }
    const tagName = await pickOrCreateTag(treeProvider.getAllTags(), task.label);
    if (tagName === undefined) { return; }
    await treeProvider.addTaskToTag(task, tagName);
    quickTasksProvider.updateTasks(treeProvider.getAllTasks());
}

async function handleRemoveTag(item: CommandTreeItem | undefined): Promise<void> {
    const task = item?.task;
    if (task === undefined || task === null) { return; }
    if (task.tags.length === 0) {
        vscode.window.showInformationMessage('This command has no tags');
        return;
    }
    const options = task.tags.map(t => ({ label: `$(tag) ${t}`, tag: t }));
    const selected = await vscode.window.showQuickPick(options, {
        placeHolder: `Remove tag from "${task.label}"`
    });
    if (selected === undefined) { return; }
    await treeProvider.removeTaskFromTag(task, selected.tag);
    quickTasksProvider.updateTasks(treeProvider.getAllTasks());
}

async function handleSemanticSearch(queryArg: string | undefined, workspaceRoot: string): Promise<void> {
    const query = queryArg ?? await vscode.window.showInputBox({
        prompt: 'Describe what you are looking for',
        placeHolder: 'e.g. "deploy to staging", "run tests"'
    });
    if (query === undefined || query === '') { return; }
    const result = await semanticSearch({ query, workspaceRoot });
    if (!result.ok) {
        vscode.window.showErrorMessage(`Semantic search failed: ${result.error}`);
        return;
    }
    if (result.value.length === 0) {
        vscode.window.showInformationMessage('No matching commands found');
        return;
    }
    treeProvider.setSemanticFilter(result.value);
    updateFilterContext();
}

function setupFileWatcher(context: vscode.ExtensionContext, workspaceRoot: string): void {
    const watcher = vscode.workspace.createFileSystemWatcher(
        '**/{package.json,Makefile,makefile,tasks.json,launch.json,commandtree.json,*.sh,*.py}'
    );
    let debounceTimer: NodeJS.Timeout | undefined;
    const onFileChange = (): void => {
        if (debounceTimer !== undefined) {
            clearTimeout(debounceTimer);
        }
        debounceTimer = setTimeout(() => {
            syncQuickTasks(workspaceRoot).catch((e: unknown) => {
                logger.error('Sync failed', { error: e instanceof Error ? e.message : 'Unknown' });
            });
        }, 2000);
    };
    watcher.onDidChange(onFileChange);
    watcher.onDidCreate(onFileChange);
    watcher.onDidDelete(onFileChange);
    context.subscriptions.push(watcher);
}

async function syncTagsFromJson(workspaceRoot: string): Promise<void> {
    const configPath = path.join(workspaceRoot, '.vscode', 'commandtree.json');
    try {
        const uri = vscode.Uri.file(configPath);
        const bytes = await vscode.workspace.fs.readFile(uri);
        const content = new TextDecoder().decode(bytes);
        const config = JSON.parse(content) as { tags?: Record<string, Array<string | Record<string, string>>> };
        if (config.tags === undefined) {
            logger.config('No tags in commandtree.json', {});
            return;
        }
        const dbResult = await initDb(workspaceRoot);
        if (!dbResult.ok) {
            logger.error('Failed to init DB for tag sync', { error: dbResult.error });
            return;
        }
        for (const [tagName, patterns] of Object.entries(config.tags)) {
            const stringPatterns = patterns.map(p => typeof p === 'string' ? p : JSON.stringify(p));
            const result = replaceTagPatterns({
                handle: dbResult.value,
                tagName,
                patterns: stringPatterns
            });
            if (!result.ok) {
                logger.error('Failed to sync tag patterns', { tagName, error: result.error });
            }
        }
        logger.config('Synced tags from commandtree.json to DB', {
            tags: config.tags
        });
    } catch (e) {
        logger.config('Failed to sync tags from commandtree.json', {
            path: configPath,
            error: e instanceof Error ? e.message : 'Unknown'
        });
    }
}

async function syncQuickTasks(workspaceRoot: string): Promise<void> {
    logger.info('syncQuickTasks START');
    await syncTagsFromJson(workspaceRoot);
    await treeProvider.refresh();
    const allTasks = treeProvider.getAllTasks();
    logger.info('syncQuickTasks after refresh', {
        taskCount: allTasks.length,
        taskIds: allTasks.map(t => t.id)
    });
    quickTasksProvider.updateTasks(allTasks);
    logger.info('syncQuickTasks END');
    const aiEnabled = vscode.workspace.getConfiguration('commandtree').get<boolean>('enableAiSummaries', false);
    if (isAiEnabled(aiEnabled)) {
        runSummarisation(workspaceRoot).catch((e: unknown) => {
            logger.error('Re-summarisation failed', { error: e instanceof Error ? e.message : 'Unknown' });
        });
    }
}

async function pickOrCreateTag(existingTags: string[], taskLabel: string): Promise<string | undefined> {
    return await new Promise<string | undefined>((resolve) => {
        const qp = vscode.window.createQuickPick();
        qp.placeholder = `Type new tag or select existing — "${taskLabel}"`;
        qp.items = existingTags.map(t => ({ label: t }));
        let resolved = false;
        const finish = (value: string | undefined): void => {
            if (resolved) { return; }
            resolved = true;
            resolve(value);
            qp.dispose();
        };
        qp.onDidAccept(() => {
            const selected = qp.selectedItems[0];
            const value = selected?.label ?? qp.value.trim();
            finish(value !== '' ? value : undefined);
        });
        qp.onDidHide(() => { finish(undefined); });
        qp.show();
    });
}

function initAiSummaries(workspaceRoot: string): void {
    const aiEnabled = vscode.workspace.getConfiguration('commandtree').get<boolean>('enableAiSummaries', false);
    if (!isAiEnabled(aiEnabled)) { return; }
    vscode.commands.executeCommand('setContext', 'commandtree.aiSummariesEnabled', true);
    runSummarisation(workspaceRoot).catch((e: unknown) => {
        logger.error('AI summarisation failed', { error: e instanceof Error ? e.message : 'Unknown' });
    });
}

async function runSummarisation(workspaceRoot: string): Promise<void> {
    const tasks = treeProvider.getAllTasks();
    if (tasks.length === 0) { return; }
    logger.info('Starting AI summarisation', { taskCount: tasks.length });
    const fs = createVSCodeFileSystem();
    const result = await summariseAllTasks({
        tasks,
        workspaceRoot,
        fs,
        onProgress: (done, total) => {
            logger.info('Summarisation progress', { done, total });
        }
    });
    if (result.ok) {
        if (result.value > 0) {
            await treeProvider.refresh();
            quickTasksProvider.updateTasks(treeProvider.getAllTasks());
        }
        vscode.window.showInformationMessage(`CommandTree: Summarised ${result.value} commands`);
    } else {
        logger.error('Summarisation failed', { error: result.error });
        vscode.window.showErrorMessage(`CommandTree: Summarisation failed — ${result.error}`);
    }
}

function updateFilterContext(): void {
    vscode.commands.executeCommand(
        'setContext',
        'commandtree.hasFilter',
        treeProvider.hasFilter()
    );
}

export async function deactivate(): Promise<void> {
    await disposeSemanticStore();
}
