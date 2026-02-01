import * as vscode from 'vscode';
import type { TaskItem } from './models/TaskItem';
import { TaskTreeItem } from './models/TaskItem';
import { TagConfig } from './config/TagConfig';

const QUICK_TASK_MIME_TYPE = 'application/vnd.tasktree.quicktask';

/**
 * Provider for the Quick Tasks view - shows tasks tagged as "quick".
 * Supports drag-and-drop reordering.
 */
export class QuickTasksProvider implements vscode.TreeDataProvider<TaskTreeItem>, vscode.TreeDragAndDropController<TaskTreeItem> {
    private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<TaskTreeItem | undefined>();
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
        await this.tagConfig.load();
        this.allTasks = this.tagConfig.applyTags(tasks);
        this.onDidChangeTreeDataEmitter.fire(undefined);
    }

    /**
     * Adds a task to the quick list.
     */
    async addToQuick(task: TaskItem): Promise<void> {
        await this.tagConfig.addTaskToTag(task, 'quick');
        await this.tagConfig.load();
        this.allTasks = this.tagConfig.applyTags(this.allTasks);
        this.onDidChangeTreeDataEmitter.fire(undefined);
    }

    /**
     * Removes a task from the quick list.
     */
    async removeFromQuick(task: TaskItem): Promise<void> {
        await this.tagConfig.removeTaskFromTag(task, 'quick');
        await this.tagConfig.load();
        this.allTasks = this.tagConfig.applyTags(this.allTasks);
        this.onDidChangeTreeDataEmitter.fire(undefined);
    }

    /**
     * Refreshes the view.
     */
    refresh(): void {
        this.onDidChangeTreeDataEmitter.fire(undefined);
    }

    getTreeItem(element: TaskTreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: TaskTreeItem): TaskTreeItem[] {
        if (element !== undefined) {
            return element.children;
        }

        const quickTasks = this.allTasks.filter(task => task.tags.includes('quick'));

        if (quickTasks.length === 0) {
            return [new TaskTreeItem(null, 'No quick tasks - star tasks to add them here', [])];
        }

        // Sort by the order in the tag patterns array for deterministic ordering
        const quickPatterns = this.tagConfig.getTagPatterns('quick');
        const sortedTasks = [...quickTasks].sort((a, b) => {
            const indexA = quickPatterns.indexOf(a.label);
            const indexB = quickPatterns.indexOf(b.label);
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

        return sortedTasks.map(task => new TaskTreeItem(task, null, []));
    }

    /**
     * Called when dragging starts.
     */
    handleDrag(source: readonly TaskTreeItem[], dataTransfer: vscode.DataTransfer): void {
        const taskItem = source[0];
        if (taskItem?.task === null) {
            return;
        }
        dataTransfer.set(QUICK_TASK_MIME_TYPE, new vscode.DataTransferItem(taskItem?.task?.label ?? ''));
    }

    /**
     * Called when dropping.
     */
    async handleDrop(target: TaskTreeItem | undefined, dataTransfer: vscode.DataTransfer): Promise<void> {
        const transferItem = dataTransfer.get(QUICK_TASK_MIME_TYPE);
        if (transferItem === undefined) {
            return;
        }

        const draggedLabel = transferItem.value as string;
        if (draggedLabel === '') {
            return;
        }

        // Find the dragged task
        const draggedTask = this.allTasks.find(t => t.label === draggedLabel && t.tags.includes('quick'));
        if (draggedTask === undefined) {
            return;
        }

        // Determine drop position
        const quickPatterns = this.tagConfig.getTagPatterns('quick');
        let newIndex: number;

        const targetTask = target?.task;
        if (targetTask === undefined || targetTask === null) {
            // Dropped on empty area or placeholder - move to end
            newIndex = quickPatterns.length;
        } else {
            // Dropped on a task - insert before it
            const targetIndex = quickPatterns.indexOf(targetTask.label);
            newIndex = targetIndex === -1 ? quickPatterns.length : targetIndex;
        }

        // Move the task
        await this.tagConfig.moveTaskInTag(draggedTask, 'quick', newIndex);
        await this.tagConfig.load();
        this.allTasks = this.tagConfig.applyTags(this.allTasks);
        this.onDidChangeTreeDataEmitter.fire(undefined);
    }
}
