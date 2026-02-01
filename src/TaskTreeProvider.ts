import * as vscode from 'vscode';
import type { TaskItem } from './models/TaskItem';
import { TaskTreeItem } from './models/TaskItem';
import type { DiscoveryResult } from './discovery';
import { discoverAllTasks, flattenTasks, getExcludePatterns } from './discovery';
import { TagConfig } from './config/TagConfig';

type GroupedTasks = Map<string, TaskItem[]>;
type SortOrder = 'folder' | 'name' | 'type';

/**
 * Tree data provider for TaskTree view.
 */
export class TaskTreeProvider implements vscode.TreeDataProvider<TaskTreeItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<TaskTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private tasks: TaskItem[] = [];
    private discoveryResult: DiscoveryResult | null = null;
    private textFilter = '';
    private tagFilter: string | null = null;
    private readonly tagConfig: TagConfig;
    private readonly workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.tagConfig = new TagConfig(workspaceRoot);
    }

    /**
     * Refreshes all tasks.
     */
    async refresh(): Promise<void> {
        await this.tagConfig.load();
        const excludePatterns = getExcludePatterns();
        this.discoveryResult = await discoverAllTasks(this.workspaceRoot, excludePatterns);
        this.tasks = this.tagConfig.applyTags(flattenTasks(this.discoveryResult));
        this._onDidChangeTreeData.fire(undefined);
    }

    /**
     * Sets text filter and refreshes tree.
     */
    setTextFilter(filter: string): void {
        this.textFilter = filter.toLowerCase();
        this._onDidChangeTreeData.fire(undefined);
    }

    /**
     * Sets tag filter and refreshes tree.
     */
    setTagFilter(tag: string | null): void {
        this.tagFilter = tag;
        this._onDidChangeTreeData.fire(undefined);
    }

    /**
     * Clears all filters.
     */
    clearFilters(): void {
        this.textFilter = '';
        this.tagFilter = null;
        this._onDidChangeTreeData.fire(undefined);
    }

    /**
     * Returns whether any filter is active.
     */
    hasFilter(): boolean {
        return this.textFilter.length > 0 || this.tagFilter !== null;
    }

    /**
     * Gets all unique tags.
     */
    getAllTags(): string[] {
        const tags = new Set<string>();
        for (const task of this.tasks) {
            for (const tag of task.tags) {
                tags.add(tag);
            }
        }
        // Also include tags from config that might not be applied yet
        for (const tag of this.tagConfig.getTagNames()) {
            tags.add(tag);
        }
        return Array.from(tags).sort();
    }

    /**
     * Opens the tag config file.
     */
    async editTags(): Promise<void> {
        await this.tagConfig.openConfig();
    }

    getTreeItem(element: TaskTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TaskTreeItem): Promise<TaskTreeItem[]> {
        if (!this.discoveryResult) {
            await this.refresh();
        }

        // Root level - show categories
        if (!element) {
            return this.buildRootCategories();
        }

        // Category or folder level - return children
        return element.children;
    }

    /**
     * Builds the root category nodes.
     */
    private buildRootCategories(): TaskTreeItem[] {
        const filtered = this.applyFilters(this.tasks);
        const showEmpty = vscode.workspace
            .getConfiguration('tasktree')
            .get<boolean>('showEmptyCategories', false);

        const categories: TaskTreeItem[] = [];

        // Shell Scripts - grouped by folder
        const shellTasks = filtered.filter(t => t.type === 'shell');
        if (shellTasks.length > 0 || showEmpty) {
            categories.push(this.buildCategoryWithFolders('Shell Scripts', shellTasks));
        }

        // NPM Scripts - grouped by package location
        const npmTasks = filtered.filter(t => t.type === 'npm');
        if (npmTasks.length > 0 || showEmpty) {
            categories.push(this.buildCategoryWithFolders('NPM Scripts', npmTasks));
        }

        // Make Targets - grouped by Makefile location
        const makeTasks = filtered.filter(t => t.type === 'make');
        if (makeTasks.length > 0 || showEmpty) {
            categories.push(this.buildCategoryWithFolders('Make Targets', makeTasks));
        }

        // VS Code Launch - flat list
        const launchTasks = filtered.filter(t => t.type === 'launch');
        if (launchTasks.length > 0 || showEmpty) {
            categories.push(this.buildFlatCategory('VS Code Launch', launchTasks));
        }

        // VS Code Tasks - flat list
        const vscodeTasks = filtered.filter(t => t.type === 'vscode');
        if (vscodeTasks.length > 0 || showEmpty) {
            categories.push(this.buildFlatCategory('VS Code Tasks', vscodeTasks));
        }

        return categories;
    }

    /**
     * Builds a category with tasks grouped by folder.
     */
    private buildCategoryWithFolders(name: string, tasks: TaskItem[]): TaskTreeItem {
        const grouped = this.groupByCategory(tasks);
        const sortedEntries = this.sortGroupedTasks(grouped);
        const children: TaskTreeItem[] = [];

        for (const [folder, folderTasks] of sortedEntries) {
            const firstTask = folderTasks[0];
            if (folderTasks.length === 1 && sortedEntries.length === 1 && firstTask) {
                // Single task in single folder - no need for folder node
                children.push(new TaskTreeItem(firstTask, null, []));
            } else if (folderTasks.length === 1 && firstTask) {
                // Single task - show with folder in description
                children.push(new TaskTreeItem(firstTask, null, []));
            } else {
                // Multiple tasks - create folder node
                const taskItems = folderTasks.map(t => new TaskTreeItem(t, null, []));
                children.push(new TaskTreeItem(null, folder, taskItems));
            }
        }

        return new TaskTreeItem(null, `${name} (${tasks.length})`, children);
    }

    /**
     * Builds a flat category without folder grouping.
     */
    private buildFlatCategory(name: string, tasks: TaskItem[]): TaskTreeItem {
        const sorted = this.sortTasks(tasks);
        const children = sorted.map(t => new TaskTreeItem(t, null, []));
        return new TaskTreeItem(null, `${name} (${tasks.length})`, children);
    }

    /**
     * Groups tasks by their category (folder path).
     */
    private groupByCategory(tasks: TaskItem[]): GroupedTasks {
        const grouped = new Map<string, TaskItem[]>();

        for (const task of tasks) {
            const existing = grouped.get(task.category) ?? [];
            existing.push(task);
            grouped.set(task.category, existing);
        }

        return grouped;
    }

    /**
     * Gets the configured sort order.
     */
    private getSortOrder(): SortOrder {
        return vscode.workspace
            .getConfiguration('tasktree')
            .get<SortOrder>('sortOrder', 'folder');
    }

    /**
     * Sorts tasks based on the configured sort order.
     */
    private sortTasks(tasks: TaskItem[]): TaskItem[] {
        const sortOrder = this.getSortOrder();
        const sorted = [...tasks];

        sorted.sort((a, b) => {
            switch (sortOrder) {
                case 'folder': {
                    // Sort by folder first, then by name
                    const folderCmp = a.category.localeCompare(b.category);
                    if (folderCmp !== 0) {
                        return folderCmp;
                    }
                    return a.label.localeCompare(b.label);
                }

                case 'name':
                    // Sort alphabetically by name
                    return a.label.localeCompare(b.label);

                case 'type': {
                    // Sort by type first, then by name
                    const typeCmp = a.type.localeCompare(b.type);
                    if (typeCmp !== 0) {
                        return typeCmp;
                    }
                    return a.label.localeCompare(b.label);
                }

                default:
                    return a.label.localeCompare(b.label);
            }
        });

        return sorted;
    }

    /**
     * Sorts folder entries alphabetically.
     */
    private sortGroupedTasks(grouped: GroupedTasks): Array<[string, TaskItem[]]> {
        const entries = Array.from(grouped.entries());
        // Sort folders alphabetically
        entries.sort((a, b) => a[0].localeCompare(b[0]));
        // Sort tasks within each folder
        for (const entry of entries) {
            entry[1] = this.sortTasks(entry[1]);
        }
        return entries;
    }

    /**
     * Applies text and tag filters.
     */
    private applyFilters(tasks: TaskItem[]): TaskItem[] {
        let result = tasks;

        // Apply text filter
        if (this.textFilter !== '') {
            result = result.filter(t =>
                t.label.toLowerCase().includes(this.textFilter) ||
                t.category.toLowerCase().includes(this.textFilter) ||
                t.filePath.toLowerCase().includes(this.textFilter) ||
                (t.description?.toLowerCase().includes(this.textFilter) ?? false)
            );
        }

        // Apply tag filter
        if (this.tagFilter !== null && this.tagFilter !== '') {
            const filterTag = this.tagFilter;
            result = result.filter(t => t.tags.includes(filterTag));
        }

        return result;
    }
}
