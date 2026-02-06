import * as vscode from 'vscode';
import type { TaskItem, Result } from './models/TaskItem';
import { CommandTreeItem } from './models/TaskItem';
import type { DiscoveryResult } from './discovery';
import { discoverAllTasks, flattenTasks, getExcludePatterns } from './discovery';
import { TagConfig } from './config/TagConfig';
import { logger } from './utils/logger';
import { buildNestedFolderItems } from './tree/folderTree';

type SortOrder = 'folder' | 'name' | 'type';

/**
 * Tree data provider for CommandTree view.
 */
export class CommandTreeProvider implements vscode.TreeDataProvider<CommandTreeItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<CommandTreeItem | undefined>();
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
        logger.filter('setTagFilter', { tagFilter: tag });
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

    /**
     * Adds a task to a tag.
     */
    async addTaskToTag(task: TaskItem, tagName: string): Promise<Result<void, string>> {
        const result = await this.tagConfig.addTaskToTag(task, tagName);
        if (result.ok) {
            await this.refresh();
        }
        return result;
    }

    /**
     * Removes a task from a tag.
     */
    async removeTaskFromTag(task: TaskItem, tagName: string): Promise<Result<void, string>> {
        const result = await this.tagConfig.removeTaskFromTag(task, tagName);
        if (result.ok) {
            await this.refresh();
        }
        return result;
    }

    /**
     * Gets all discovered tasks (without filters applied).
     */
    getAllTasks(): TaskItem[] {
        return this.tasks;
    }

    getTreeItem(element: CommandTreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: CommandTreeItem): Promise<CommandTreeItem[]> {
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
    private buildRootCategories(): CommandTreeItem[] {
        const filtered = this.applyFilters(this.tasks);
        const categories: CommandTreeItem[] = [];

        // Shell Scripts - grouped by folder
        const shellTasks = filtered.filter(t => t.type === 'shell');
        if (shellTasks.length > 0) {
            categories.push(this.buildCategoryWithFolders('Shell Scripts', shellTasks));
        }

        // NPM Scripts - grouped by package location
        const npmTasks = filtered.filter(t => t.type === 'npm');
        if (npmTasks.length > 0) {
            categories.push(this.buildCategoryWithFolders('NPM Scripts', npmTasks));
        }

        // Make Targets - grouped by Makefile location
        const makeTasks = filtered.filter(t => t.type === 'make');
        if (makeTasks.length > 0) {
            categories.push(this.buildCategoryWithFolders('Make Targets', makeTasks));
        }

        // VS Code Launch - flat list
        const launchTasks = filtered.filter(t => t.type === 'launch');
        if (launchTasks.length > 0) {
            categories.push(this.buildFlatCategory('VS Code Launch', launchTasks));
        }

        // VS Code Tasks - flat list
        const vscodeTasks = filtered.filter(t => t.type === 'vscode');
        if (vscodeTasks.length > 0) {
            categories.push(this.buildFlatCategory('VS Code Tasks', vscodeTasks));
        }

        // Python Scripts - grouped by folder
        const pythonTasks = filtered.filter(t => t.type === 'python');
        if (pythonTasks.length > 0) {
            categories.push(this.buildCategoryWithFolders('Python Scripts', pythonTasks));
        }

        // PowerShell/Batch Scripts - grouped by folder
        const powershellTasks = filtered.filter(t => t.type === 'powershell');
        if (powershellTasks.length > 0) {
            categories.push(this.buildCategoryWithFolders('PowerShell/Batch', powershellTasks));
        }

        // Gradle Tasks - grouped by project
        const gradleTasks = filtered.filter(t => t.type === 'gradle');
        if (gradleTasks.length > 0) {
            categories.push(this.buildCategoryWithFolders('Gradle Tasks', gradleTasks));
        }

        // Cargo Tasks - grouped by project
        const cargoTasks = filtered.filter(t => t.type === 'cargo');
        if (cargoTasks.length > 0) {
            categories.push(this.buildCategoryWithFolders('Cargo (Rust)', cargoTasks));
        }

        // Maven Goals - grouped by project
        const mavenTasks = filtered.filter(t => t.type === 'maven');
        if (mavenTasks.length > 0) {
            categories.push(this.buildCategoryWithFolders('Maven Goals', mavenTasks));
        }

        // Ant Targets - grouped by project
        const antTasks = filtered.filter(t => t.type === 'ant');
        if (antTasks.length > 0) {
            categories.push(this.buildCategoryWithFolders('Ant Targets', antTasks));
        }

        // Just Recipes - grouped by location
        const justTasks = filtered.filter(t => t.type === 'just');
        if (justTasks.length > 0) {
            categories.push(this.buildCategoryWithFolders('Just Recipes', justTasks));
        }

        // Taskfile Tasks - grouped by location
        const taskfileTasks = filtered.filter(t => t.type === 'taskfile');
        if (taskfileTasks.length > 0) {
            categories.push(this.buildCategoryWithFolders('Taskfile', taskfileTasks));
        }

        // Deno Tasks - grouped by project
        const denoTasks = filtered.filter(t => t.type === 'deno');
        if (denoTasks.length > 0) {
            categories.push(this.buildCategoryWithFolders('Deno Tasks', denoTasks));
        }

        // Rake Tasks - grouped by project
        const rakeTasks = filtered.filter(t => t.type === 'rake');
        if (rakeTasks.length > 0) {
            categories.push(this.buildCategoryWithFolders('Rake Tasks', rakeTasks));
        }

        // Composer Scripts - grouped by project
        const composerTasks = filtered.filter(t => t.type === 'composer');
        if (composerTasks.length > 0) {
            categories.push(this.buildCategoryWithFolders('Composer Scripts', composerTasks));
        }

        // Docker Compose - grouped by project
        const dockerTasks = filtered.filter(t => t.type === 'docker');
        if (dockerTasks.length > 0) {
            categories.push(this.buildCategoryWithFolders('Docker Compose', dockerTasks));
        }

        return categories;
    }

    /**
     * Builds a category with tasks grouped into nested folder hierarchy.
     */
    private buildCategoryWithFolders(name: string, tasks: TaskItem[]): CommandTreeItem {
        const children = buildNestedFolderItems({
            tasks,
            workspaceRoot: this.workspaceRoot,
            categoryId: name,
            sortTasks: (t) => this.sortTasks(t)
        });
        return new CommandTreeItem(null, `${name} (${tasks.length})`, children);
    }

    /**
     * Builds a flat category without folder grouping.
     */
    private buildFlatCategory(name: string, tasks: TaskItem[]): CommandTreeItem {
        const sorted = this.sortTasks(tasks);
        const categoryId = name;
        const children = sorted.map(t => new CommandTreeItem(t, null, [], categoryId));
        return new CommandTreeItem(null, `${name} (${tasks.length})`, children);
    }

    /**
     * Gets the configured sort order.
     */
    private getSortOrder(): SortOrder {
        return vscode.workspace
            .getConfiguration('commandtree')
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
     * Applies text and tag filters.
     */
    private applyFilters(tasks: TaskItem[]): TaskItem[] {
        logger.filter('applyFilters START', {
            textFilter: this.textFilter,
            tagFilter: this.tagFilter,
            inputCount: tasks.length
        });

        let result = tasks;

        // Apply text filter
        if (this.textFilter !== '') {
            result = result.filter(t =>
                t.label.toLowerCase().includes(this.textFilter) ||
                t.category.toLowerCase().includes(this.textFilter) ||
                t.filePath.toLowerCase().includes(this.textFilter) ||
                (t.description?.toLowerCase().includes(this.textFilter) ?? false)
            );
            logger.filter('After text filter', { outputCount: result.length });
        }

        // Apply tag filter
        if (this.tagFilter !== null && this.tagFilter !== '') {
            const filterTag = this.tagFilter;
            logger.filter('Applying tag filter', {
                tagFilter: filterTag,
                tasksWithTags: tasks.map(t => ({ id: t.id, label: t.label, tags: t.tags }))
            });
            result = result.filter(t => t.tags.includes(filterTag));
            logger.filter('After tag filter', {
                outputCount: result.length,
                matchedTasks: result.map(t => ({ id: t.id, label: t.label, tags: t.tags }))
            });
        }

        logger.filter('applyFilters END', { outputCount: result.length });
        return result;
    }
}
