import * as vscode from 'vscode';
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

    // Initialize semantic search SQLite database in .commandtree/
    const storeResult = await initSemanticStore(workspaceRoot);
    if (!storeResult.ok) {
        logger.warn('SQLite init failed, semantic search unavailable', { error: storeResult.error });
    }

    // Migrate legacy JSON store if present
    migrateIfNeeded({ workspaceRoot }).catch((e: unknown) => {
        logger.warn('Migration failed', { error: e instanceof Error ? e.message : 'Unknown' });
    });

    // Initialize providers
    treeProvider = new CommandTreeProvider(workspaceRoot);
    quickTasksProvider = new QuickTasksProvider(workspaceRoot);
    taskRunner = new TaskRunner();

    // Register main tree view
    const treeView = vscode.window.createTreeView('commandtree', {
        treeDataProvider: treeProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);

    // Register Quick Launch tree view with drag-and-drop support
    const quickTreeView = vscode.window.createTreeView('commandtree-quick', {
        treeDataProvider: quickTasksProvider,
        showCollapseAll: true,
        dragAndDropController: quickTasksProvider
    });
    context.subscriptions.push(quickTreeView);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('commandtree.refresh', async () => {
            await treeProvider.refresh();
            await quickTasksProvider.updateTasks(treeProvider.getAllTasks());
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
        }),

        vscode.commands.registerCommand('commandtree.filter', async () => {
            const filter = await vscode.window.showInputBox({
                prompt: 'Filter commands by name, path, or description',
                placeHolder: 'Type to filter...',
                value: ''
            });

            if (filter !== undefined) {
                treeProvider.setTextFilter(filter);
                updateFilterContext();
            }
        }),

        vscode.commands.registerCommand('commandtree.filterByTag', async () => {
            const tags = treeProvider.getAllTags();
            if (tags.length === 0) {
                const action = await vscode.window.showInformationMessage(
                    'No tags defined. Create tag configuration?',
                    'Create'
                );
                if (action === 'Create') {
                    await treeProvider.editTags();
                }
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
        }),

        vscode.commands.registerCommand('commandtree.clearFilter', () => {
            treeProvider.clearFilters();
            updateFilterContext();
        }),

        vscode.commands.registerCommand('commandtree.editTags', async () => {
            await treeProvider.editTags();
        }),

        vscode.commands.registerCommand('commandtree.addToQuick', async (item: CommandTreeItem | undefined) => {
            if (item !== undefined && item.task !== null) {
                await quickTasksProvider.addToQuick(item.task);
                await treeProvider.refresh();
                await quickTasksProvider.updateTasks(treeProvider.getAllTasks());
            }
        }),

        vscode.commands.registerCommand('commandtree.removeFromQuick', async (item: CommandTreeItem | undefined) => {
            if (item !== undefined && item.task !== null) {
                await quickTasksProvider.removeFromQuick(item.task);
                await treeProvider.refresh();
                await quickTasksProvider.updateTasks(treeProvider.getAllTasks());
            }
        }),

        vscode.commands.registerCommand('commandtree.refreshQuick', () => {
            quickTasksProvider.refresh();
        }),

        vscode.commands.registerCommand('commandtree.addTag', async (item: CommandTreeItem | undefined) => {
            const task = item?.task;
            if (task === undefined || task === null) {
                return;
            }

            const tagName = await pickOrCreateTag(treeProvider.getAllTags(), task.label);
            if (tagName === undefined) {
                return;
            }

            await treeProvider.addTaskToTag(task, tagName);
            await quickTasksProvider.updateTasks(treeProvider.getAllTasks());
        }),

        vscode.commands.registerCommand('commandtree.removeTag', async (item: CommandTreeItem | undefined) => {
            const task = item?.task;
            if (task === undefined || task === null) {
                return;
            }

            const taskTags = task.tags;
            if (taskTags.length === 0) {
                vscode.window.showInformationMessage('This command has no tags');
                return;
            }

            const options = taskTags.map(t => ({
                label: `$(tag) ${t}`,
                tag: t
            }));

            const selected = await vscode.window.showQuickPick(options, {
                placeHolder: `Remove tag from "${task.label}"`
            });

            if (selected === undefined) {
                return;
            }

            await treeProvider.removeTaskFromTag(task, selected.tag);
            await quickTasksProvider.updateTasks(treeProvider.getAllTasks());
        }),

        vscode.commands.registerCommand('commandtree.semanticSearch', async () => {
            const query = await vscode.window.showInputBox({
                prompt: 'Describe what you are looking for',
                placeHolder: 'e.g. "deploy to staging", "run tests"'
            });

            if (query === undefined || query === '') {
                return;
            }

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
        }),

        vscode.commands.registerCommand('commandtree.generateSummaries', async () => {
            await runSummarisation(workspaceRoot);
        })
    );

    // Watch for file changes that might affect commands
    const watcher = vscode.workspace.createFileSystemWatcher(
        '**/{package.json,Makefile,makefile,tasks.json,launch.json,commandtree.json,*.sh,*.py}'
    );

    const syncQuickTasks = async (): Promise<void> => {
        logger.info('syncQuickTasks START');
        await treeProvider.refresh();
        const allTasks = treeProvider.getAllTasks();
        logger.info('syncQuickTasks after refresh', {
            taskCount: allTasks.length,
            taskIds: allTasks.map(t => t.id)
        });
        await quickTasksProvider.updateTasks(allTasks);
        logger.info('syncQuickTasks END');

        // Re-summarise if AI summaries enabled
        if (isAiEnabled()) {
            runSummarisation(workspaceRoot).catch((e: unknown) => {
                logger.error('Re-summarisation failed', { error: e instanceof Error ? e.message : 'Unknown' });
            });
        }
    };

    watcher.onDidChange(syncQuickTasks);
    watcher.onDidCreate(syncQuickTasks);
    watcher.onDidDelete(syncQuickTasks);
    context.subscriptions.push(watcher);

    // Initial load
    await syncQuickTasks();

    // AI summaries: opt-in prompt and background summarisation
    initAiSummaries(context, workspaceRoot);

    // Export for testing
    return {
        commandTreeProvider: treeProvider,
        quickTasksProvider
    };
}

/**
 * Shows a QuickPick that accepts both existing tag selection AND typed new tag names.
 * Type a name and press Enter to create a new tag, or select an existing one.
 */
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

function initAiSummaries(_context: vscode.ExtensionContext, workspaceRoot: string): void {
    if (!isAiEnabled()) {
        return;
    }

    vscode.commands.executeCommand('setContext', 'commandtree.aiSummariesEnabled', true);
    runSummarisation(workspaceRoot).catch((e: unknown) => {
        logger.error('AI summarisation failed', { error: e instanceof Error ? e.message : 'Unknown' });
    });
}

async function runSummarisation(workspaceRoot: string): Promise<void> {
    const tasks = treeProvider.getAllTasks();
    if (tasks.length === 0) {
        return;
    }

    logger.info('Starting AI summarisation', { taskCount: tasks.length });

    const result = await summariseAllTasks({
        tasks,
        workspaceRoot,
        onProgress: (done, total) => {
            logger.info('Summarisation progress', { done, total });
        }
    });

    if (result.ok) {
        vscode.window.showInformationMessage(`CommandTree: Summarised ${result.value} commands`);
    } else {
        logger.error('Summarisation failed', { error: result.error });
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
