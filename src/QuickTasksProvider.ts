import * as vscode from 'vscode';
import type { TaskItem, Result } from './models/TaskItem';
import { CommandTreeItem } from './models/TaskItem';
import { TagConfig } from './config/TagConfig';
import { logger } from './utils/logger';

const QUICK_TASK_MIME_TYPE = 'application/vnd.commandtree.quicktask';
const QUICK_TAG = 'quick';

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

    constructor() {
        // SPEC.md **user-data-storage**: Tags stored in SQLite, not .vscode/commandtree.json
        this.tagConfig = new TagConfig();
    }

    /**
     * Updates the list of all tasks and refreshes the view.
     */
    updateTasks(tasks: TaskItem[]): void {
        logger.quick('updateTasks called', { taskCount: tasks.length });
        this.tagConfig.load();
        this.allTasks = this.tagConfig.applyTags(tasks);
        const quickCount = this.allTasks.filter(t => t.tags.includes(QUICK_TAG)).length;
        logger.quick('updateTasks complete', {
            taskCount: this.allTasks.length,
            quickTaskCount: quickCount,
            quickTasks: this.allTasks.filter(t => t.tags.includes(QUICK_TAG)).map(t => t.id)
        });
        this.onDidChangeTreeDataEmitter.fire(undefined);
    }

    /**
     * Adds a command to the quick list.
     */
    addToQuick(task: TaskItem): Result<void, string> {
        const result = this.tagConfig.addTaskToTag(task, QUICK_TAG);
        if (result.ok) {
            this.tagConfig.load();
            this.allTasks = this.tagConfig.applyTags(this.allTasks);
            this.onDidChangeTreeDataEmitter.fire(undefined);
        }
        return result;
    }

    /**
     * Removes a command from the quick list.
     */
    removeFromQuick(task: TaskItem): Result<void, string> {
        const result = this.tagConfig.removeTaskFromTag(task, QUICK_TAG);
        if (result.ok) {
            this.tagConfig.load();
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
        if (element !== undefined) { return element.children; }
        logger.quick('getChildren called', {
            allTasksCount: this.allTasks.length,
            allTasksWithTags: this.allTasks.map(t => ({ id: t.id, label: t.label, tags: t.tags }))
        });
        const items = this.buildQuickItems();
        logger.quick('Returning quick tasks', { count: items.length });
        return items;
    }

    /**
     * Builds the quick task tree items with pattern-based ordering.
     */
    private buildQuickItems(): CommandTreeItem[] {
        const quickTasks = this.allTasks.filter(task => task.tags.includes(QUICK_TAG));
        logger.quick('Filtered quick tasks', { count: quickTasks.length });
        if (quickTasks.length === 0) {
            return [new CommandTreeItem(null, 'No quick commands - star commands to add them here', [])];
        }
        const patterns = this.tagConfig.getTagPatterns(QUICK_TAG);
        const sorted = this.sortByPatternOrder(quickTasks, patterns);
        return sorted.map(task => new CommandTreeItem(task, null, []));
    }

    /**
     * Sorts tasks to match the order defined in tag patterns.
     */
    private sortByPatternOrder(tasks: TaskItem[], patterns: string[]): TaskItem[] {
        return [...tasks].sort((a, b) => {
            const indexA = patterns.indexOf(a.id);
            const indexB = patterns.indexOf(b.id);
            if (indexA === -1 && indexB === -1) { return a.label.localeCompare(b.label); }
            if (indexA === -1) { return 1; }
            if (indexB === -1) { return -1; }
            return indexA - indexB;
        });
    }

    /**
     * Called when dragging starts.
     */
    handleDrag(source: readonly CommandTreeItem[], dataTransfer: vscode.DataTransfer): void {
        const taskItem = source[0];
        if (taskItem?.task === null) {
            return;
        }
        dataTransfer.set(QUICK_TASK_MIME_TYPE, new vscode.DataTransferItem(taskItem?.task?.id ?? ''));
    }

    /**
     * Called when dropping.
     */
    handleDrop(target: CommandTreeItem | undefined, dataTransfer: vscode.DataTransfer): void {
        const draggedTask = this.extractDraggedTask(dataTransfer);
        if (draggedTask === undefined) { return; }
        const newIndex = this.computeDropIndex(target);
        const result = this.tagConfig.moveTaskInTag(draggedTask, QUICK_TAG, newIndex);
        if (result.ok) {
            this.tagConfig.load();
            this.allTasks = this.tagConfig.applyTags(this.allTasks);
            this.onDidChangeTreeDataEmitter.fire(undefined);
        }
    }

    /**
     * Extracts the dragged task from a data transfer.
     */
    private extractDraggedTask(dataTransfer: vscode.DataTransfer): TaskItem | undefined {
        const transferItem = dataTransfer.get(QUICK_TASK_MIME_TYPE);
        if (transferItem === undefined) { return undefined; }
        const draggedId = transferItem.value as string;
        if (draggedId === '') { return undefined; }
        return this.allTasks.find(t => t.id === draggedId && t.tags.includes(QUICK_TAG));
    }

    /**
     * Computes the insertion index for a drop target.
     */
    private computeDropIndex(target: CommandTreeItem | undefined): number {
        const patterns = this.tagConfig.getTagPatterns(QUICK_TAG);
        const targetTask = target?.task;
        if (targetTask === undefined || targetTask === null) { return patterns.length; }
        const targetIndex = patterns.indexOf(targetTask.id);
        return targetIndex === -1 ? patterns.length : targetIndex;
    }
}
