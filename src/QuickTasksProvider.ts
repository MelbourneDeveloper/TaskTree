import * as vscode from 'vscode';
import type { TaskItem, Result } from './models/TaskItem';
import { CommandTreeItem } from './models/TaskItem';
import { TagConfig } from './config/TagConfig';
import { logger } from './utils/logger';

const QUICK_TASK_MIME_TYPE = 'application/vnd.commandtree.quicktask';

/**
 * Provider for the Quick Launch view - shows commands tagged as "quick".
 * Supports drag-and-drop reordering.
 */
export class QuickTasksProvider implements vscode.TreeDataProvider<CommandTreeItem>, vscode.TreeDragAndDropController<CommandTreeItem> {
    private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<CommandTreeItem | undefined>();
    readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

    readonly dropMimeTypes = [QUICK_TASK_MIME_TYPE];
    readonly dragMimeTypes = [QUICK_TASK_MIME_TYPE];

    private readonly tagConfig: TagConfig;
    private allTasks: TaskItem[] = [];

    constructor(
        workspaceRoot: string
    ) {
        this.tagConfig = new TagConfig(workspaceRoot);
    }

    /**
     * Updates the list of all tasks and refreshes the view.
     */
    async updateTasks(tasks: TaskItem[]): Promise<void> {
        logger.quick('updateTasks called', { taskCount: tasks.length });
        await this.tagConfig.load();
        this.allTasks = this.tagConfig.applyTags(tasks);
        const quickCount = this.allTasks.filter(t => t.tags.includes('quick')).length;
        logger.quick('updateTasks complete', {
            taskCount: this.allTasks.length,
            quickTaskCount: quickCount,
            quickTasks: this.allTasks.filter(t => t.tags.includes('quick')).map(t => t.id)
        });
        this.onDidChangeTreeDataEmitter.fire(undefined);
    }

    /**
     * Adds a command to the quick list.
     */
    async addToQuick(task: TaskItem): Promise<Result<void, string>> {
        const result = await this.tagConfig.addTaskToTag(task, 'quick');
        if (result.ok) {
            await this.tagConfig.load();
            this.allTasks = this.tagConfig.applyTags(this.allTasks);
            this.onDidChangeTreeDataEmitter.fire(undefined);
        }
        return result;
    }

    /**
     * Removes a command from the quick list.
     */
    async removeFromQuick(task: TaskItem): Promise<Result<void, string>> {
        const result = await this.tagConfig.removeTaskFromTag(task, 'quick');
        if (result.ok) {
            await this.tagConfig.load();
            this.allTasks = this.tagConfig.applyTags(this.allTasks);
            this.onDidChangeTreeDataEmitter.fire(undefined);
        }
        return result;
    }

    /**
     * Refreshes the view.
     */
    refresh(): void {
        this.onDidChangeTreeDataEmitter.fire(undefined);
    }

    getTreeItem(element: CommandTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: CommandTreeItem): CommandTreeItem[] {
        if (element !== undefined) {
            return element.children;
        }

        logger.quick('getChildren called', {
            allTasksCount: this.allTasks.length,
            allTasksWithTags: this.allTasks.map(t => ({ id: t.id, label: t.label, tags: t.tags }))
        });

        const quickTasks = this.allTasks.filter(task => task.tags.includes('quick'));

        logger.quick('Filtered quick tasks', {
            quickTaskCount: quickTasks.length,
            quickTaskIds: quickTasks.map(t => t.id)
        });

        if (quickTasks.length === 0) {
            logger.quick('No quick tasks found', {});
            return [new CommandTreeItem(null, 'No quick commands - star commands to add them here', [])];
        }

        // Sort by the order in the tag patterns array for deterministic ordering
        // Use task.id for matching since patterns now store full task IDs
        const quickPatterns = this.tagConfig.getTagPatterns('quick');
        logger.quick('Quick patterns from config', { patterns: quickPatterns });

        const sortedTasks = [...quickTasks].sort((a, b) => {
            const indexA = quickPatterns.indexOf(a.id);
            const indexB = quickPatterns.indexOf(b.id);
            // If not found in patterns, put at end sorted alphabetically
            if (indexA === -1 && indexB === -1) {
                return a.label.localeCompare(b.label);
            }
            if (indexA === -1) {
                return 1;
            }
            if (indexB === -1) {
                return -1;
            }
            return indexA - indexB;
        });

        logger.quick('Returning sorted quick tasks', {
            count: sortedTasks.length,
            tasks: sortedTasks.map(t => t.label)
        });

        return sortedTasks.map(task => new CommandTreeItem(task, null, []));
    }

    /**
     * Called when dragging starts.
     */
    handleDrag(source: readonly CommandTreeItem[], dataTransfer: vscode.DataTransfer): void {
        const taskItem = source[0];
        if (taskItem?.task === null) {
            return;
        }
        // Use task.id for unique identification during drag/drop
        dataTransfer.set(QUICK_TASK_MIME_TYPE, new vscode.DataTransferItem(taskItem?.task?.id ?? ''));
    }

    /**
     * Called when dropping.
     */
    async handleDrop(target: CommandTreeItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
        const transferItem = dataTransfer.get(QUICK_TASK_MIME_TYPE);
        if (transferItem === undefined) {
            return;
        }

        const draggedId = transferItem.value as string;
        if (draggedId === '') {
            return;
        }

        // Find the dragged task by ID for unique identification
        const draggedTask = this.allTasks.find(t => t.id === draggedId && t.tags.includes('quick'));
        if (draggedTask === undefined) {
            return;
        }

        // Determine drop position using task IDs
        const quickPatterns = this.tagConfig.getTagPatterns('quick');
        let newIndex: number;

        const targetTask = target?.task;
        if (targetTask === undefined || targetTask === null) {
            // Dropped on empty area or placeholder - move to end
            newIndex = quickPatterns.length;
        } else {
            // Dropped on a task - insert before it (using task ID)
            const targetIndex = quickPatterns.indexOf(targetTask.id);
            newIndex = targetIndex === -1 ? quickPatterns.length : targetIndex;
        }

        // Move the task
        const result = await this.tagConfig.moveTaskInTag(draggedTask, 'quick', newIndex);
        if (result.ok) {
            await this.tagConfig.load();
            this.allTasks = this.tagConfig.applyTags(this.allTasks);
            this.onDidChangeTreeDataEmitter.fire(undefined);
        }
    }
}
