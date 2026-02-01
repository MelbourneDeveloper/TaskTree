import * as vscode from 'vscode';
import { TaskTreeProvider } from './TaskTreeProvider';
import type { TaskTreeItem } from './models/TaskItem';
import { TaskRunner } from './runners/TaskRunner';
import { QuickTasksProvider } from './QuickTasksProvider';

let treeProvider: TaskTreeProvider;
let quickTasksProvider: QuickTasksProvider;
let taskRunner: TaskRunner;

export interface ExtensionExports {
    taskTreeProvider: TaskTreeProvider;
    quickTasksProvider: QuickTasksProvider;
}

export async function activate(context: vscode.ExtensionContext): Promise<ExtensionExports | undefined> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot === undefined || workspaceRoot === '') {
        return;
    }

    // Initialize providers
    treeProvider = new TaskTreeProvider(workspaceRoot);
    quickTasksProvider = new QuickTasksProvider(workspaceRoot);
    taskRunner = new TaskRunner();

    // Register main tree view
    const treeView = vscode.window.createTreeView('tasktree', {
        treeDataProvider: treeProvider,
        showCollapseAll: true
    });
    context.subscriptions.push(treeView);

    // Register quick tasks tree view with drag-and-drop support
    const quickTreeView = vscode.window.createTreeView('tasktree-quick', {
        treeDataProvider: quickTasksProvider,
        showCollapseAll: true,
        dragAndDropController: quickTasksProvider
    });
    context.subscriptions.push(quickTreeView);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('tasktree.refresh', async () => {
            await treeProvider.refresh();
            await quickTasksProvider.updateTasks(treeProvider.getAllTasks());
            vscode.window.showInformationMessage('TaskTree refreshed');
        }),

        vscode.commands.registerCommand('tasktree.run', async (item: TaskTreeItem | undefined) => {
            if (item !== undefined && item.task !== null) {
                await taskRunner.run(item.task, 'task');
            }
        }),

        vscode.commands.registerCommand('tasktree.runInNewTerminal', async (item: TaskTreeItem | undefined) => {
            if (item !== undefined && item.task !== null) {
                await taskRunner.run(item.task, 'newTerminal');
            }
        }),

        vscode.commands.registerCommand('tasktree.runInCurrentTerminal', async (item: TaskTreeItem | undefined) => {
            if (item !== undefined && item.task !== null) {
                await taskRunner.run(item.task, 'currentTerminal');
            }
        }),

        vscode.commands.registerCommand('tasktree.debug', async (item: TaskTreeItem | undefined) => {
            if (item !== undefined && item.task !== null) {
                await taskRunner.run(item.task, 'debug');
            }
        }),

        vscode.commands.registerCommand('tasktree.filter', async () => {
            const filter = await vscode.window.showInputBox({
                prompt: 'Filter tasks by name, path, or description',
                placeHolder: 'Type to filter...',
                value: ''
            });

            if (filter !== undefined) {
                treeProvider.setTextFilter(filter);
                updateFilterContext();
            }
        }),

        vscode.commands.registerCommand('tasktree.filterByTag', async () => {
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

        vscode.commands.registerCommand('tasktree.clearFilter', () => {
            treeProvider.clearFilters();
            updateFilterContext();
        }),

        vscode.commands.registerCommand('tasktree.editTags', async () => {
            await treeProvider.editTags();
        }),

        vscode.commands.registerCommand('tasktree.addToQuick', async (item: TaskTreeItem | undefined) => {
            if (item !== undefined && item.task !== null) {
                await quickTasksProvider.addToQuick(item.task);
            }
        }),

        vscode.commands.registerCommand('tasktree.removeFromQuick', async (item: TaskTreeItem | undefined) => {
            if (item !== undefined && item.task !== null) {
                await quickTasksProvider.removeFromQuick(item.task);
            }
        }),

        vscode.commands.registerCommand('tasktree.refreshQuick', () => {
            quickTasksProvider.refresh();
        }),

        vscode.commands.registerCommand('tasktree.addTag', async (item: TaskTreeItem | undefined) => {
            if (item === undefined || item.task === null) {
                return;
            }

            const existingTags = treeProvider.getAllTags();
            const options: vscode.QuickPickItem[] = existingTags.map(t => ({
                label: `$(tag) ${t}`,
                description: 'Existing tag',
                tag: t
            } as vscode.QuickPickItem & { tag: string }));

            options.push({
                label: '$(add) Create new tag...',
                description: 'Create a new tag',
                alwaysShow: true
            });

            const selected = await vscode.window.showQuickPick(options, {
                placeHolder: `Add tag to "${item.task.label}"`
            });

            if (selected === undefined) {
                return;
            }

            let tagName: string;
            if (selected.label === '$(add) Create new tag...') {
                const newTag = await vscode.window.showInputBox({
                    prompt: 'Enter new tag name',
                    placeHolder: 'e.g., build, test, deploy'
                });
                if (newTag === undefined || newTag.trim() === '') {
                    return;
                }
                tagName = newTag.trim();
            } else {
                tagName = (selected as vscode.QuickPickItem & { tag: string }).tag;
            }

            await treeProvider.addTaskToTag(item.task, tagName);
            await quickTasksProvider.updateTasks(treeProvider.getAllTasks());
        }),

        vscode.commands.registerCommand('tasktree.removeTag', async (item: TaskTreeItem | undefined) => {
            if (item === undefined || item.task === null) {
                return;
            }

            const taskTags = item.task.tags;
            if (taskTags.length === 0) {
                vscode.window.showInformationMessage('This task has no tags');
                return;
            }

            const options = taskTags.map(t => ({
                label: `$(tag) ${t}`,
                tag: t
            }));

            const selected = await vscode.window.showQuickPick(options, {
                placeHolder: `Remove tag from "${item.task.label}"`
            });

            if (selected === undefined) {
                return;
            }

            await treeProvider.removeTaskFromTag(item.task, selected.tag);
            await quickTasksProvider.updateTasks(treeProvider.getAllTasks());
        })
    );

    // Watch for file changes that might affect tasks
    const watcher = vscode.workspace.createFileSystemWatcher(
        '**/{package.json,Makefile,makefile,tasks.json,launch.json,tasktree.json,*.sh}'
    );

    const syncQuickTasks = async (): Promise<void> => {
        await treeProvider.refresh();
        await quickTasksProvider.updateTasks(treeProvider.getAllTasks());
    };

    watcher.onDidChange(syncQuickTasks);
    watcher.onDidCreate(syncQuickTasks);
    watcher.onDidDelete(syncQuickTasks);
    context.subscriptions.push(watcher);

    // Initial load
    await syncQuickTasks();

    // Export for testing
    return {
        taskTreeProvider: treeProvider,
        quickTasksProvider
    };
}

function updateFilterContext(): void {
    vscode.commands.executeCommand(
        'setContext',
        'tasktree.hasFilter',
        treeProvider.hasFilter()
    );
}

export function deactivate(): void {
    // Cleanup handled by disposables
}
