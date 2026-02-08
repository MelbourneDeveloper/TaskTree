import * as vscode from 'vscode';
import type { TaskItem, Result } from './models/TaskItem';
import { CommandTreeItem } from './models/TaskItem';
import type { DiscoveryResult } from './discovery';
import { discoverAllTasks, flattenTasks, getExcludePatterns } from './discovery';
import { TagConfig } from './config/TagConfig';
import { logger } from './utils/logger';
import { buildNestedFolderItems } from './tree/folderTree';
import { getAllEmbeddingRows } from './semantic';
import type { EmbeddingRow } from './semantic/db';

type SortOrder = 'folder' | 'name' | 'type';

interface CategoryDef {
    readonly type: string;
    readonly label: string;
    readonly flat?: boolean;
}

const CATEGORY_DEFS: readonly CategoryDef[] = [
    { type: 'shell', label: 'Shell Scripts' },
    { type: 'npm', label: 'NPM Scripts' },
    { type: 'make', label: 'Make Targets' },
    { type: 'launch', label: 'VS Code Launch', flat: true },
    { type: 'vscode', label: 'VS Code Tasks', flat: true },
    { type: 'python', label: 'Python Scripts' },
    { type: 'powershell', label: 'PowerShell/Batch' },
    { type: 'gradle', label: 'Gradle Tasks' },
    { type: 'cargo', label: 'Cargo (Rust)' },
    { type: 'maven', label: 'Maven Goals' },
    { type: 'ant', label: 'Ant Targets' },
    { type: 'just', label: 'Just Recipes' },
    { type: 'taskfile', label: 'Taskfile' },
    { type: 'deno', label: 'Deno Tasks' },
    { type: 'rake', label: 'Rake Tasks' },
    { type: 'composer', label: 'Composer Scripts' },
    { type: 'docker', label: 'Docker Compose' },
    { type: 'dotnet', label: '.NET Projects' },
    { type: 'markdown', label: 'Markdown Files' },
];

/**
 * Tree data provider for CommandTree view.
 */
export class CommandTreeProvider implements vscode.TreeDataProvider<CommandTreeItem> {
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<CommandTreeItem | undefined>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private tasks: TaskItem[] = [];
    private discoveryResult: DiscoveryResult | null = null;
    private tagFilter: string | null = null;
    private semanticFilter: ReadonlyMap<string, number> | null = null;
    private summaries: ReadonlyMap<string, EmbeddingRow> = new Map();
    private readonly tagConfig: TagConfig;
    private readonly workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        // SPEC.md **user-data-storage**: Tags stored in SQLite, not .vscode/commandtree.json
        this.tagConfig = new TagConfig();
    }

    /**
     * Refreshes all commands.
     */
    async refresh(): Promise<void> {
        this.tagConfig.load();
        const excludePatterns = getExcludePatterns();
        this.discoveryResult = await discoverAllTasks(this.workspaceRoot, excludePatterns);
        this.tasks = this.tagConfig.applyTags(flattenTasks(this.discoveryResult));
        this.loadSummaries();
        this.tasks = this.attachSummaries(this.tasks);
        this._onDidChangeTreeData.fire(undefined);
    }

    /**
     * Loads summaries from SQLite into memory.
     */
    private loadSummaries(): void {
        const result = getAllEmbeddingRows();
        if (!result.ok) {
            return;
        }
        const map = new Map<string, EmbeddingRow>();
        for (const row of result.value) {
            map.set(row.commandId, row);
        }
        this.summaries = map;
    }

    /**
     * Attaches loaded summaries to task items for tooltip display.
     */
    private attachSummaries(tasks: TaskItem[]): TaskItem[] {
        if (this.summaries.size === 0) {
            return tasks;
        }
        return tasks.map(task => {
            const record = this.summaries.get(task.id);
            if (record === undefined) {
                return task;
            }
            const warning = record.securityWarning;
            return {
                ...task,
                summary: record.summary,
                ...(warning !== null ? { securityWarning: warning } : {})
            };
        });
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
     * Sets semantic filter with command IDs and their similarity scores.
     * SPEC.md **ai-search-implementation**: Scores preserved for display.
     */
    setSemanticFilter(results: ReadonlyArray<{ readonly id: string; readonly score: number }>): void {
        const map = new Map<string, number>();
        for (const r of results) {
            map.set(r.id, r.score);
        }
        this.semanticFilter = map;
        this._onDidChangeTreeData.fire(undefined);
    }

    /**
     * Clears all filters.
     */
    clearFilters(): void {
        this.tagFilter = null;
        this.semanticFilter = null;
        this._onDidChangeTreeData.fire(undefined);
    }

    /**
     * Returns whether any filter is active.
     */
    hasFilter(): boolean {
        return this.tagFilter !== null || this.semanticFilter !== null;
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
     * Adds a command to a tag.
     */
    async addTaskToTag(task: TaskItem, tagName: string): Promise<Result<void, string>> {
        const result = this.tagConfig.addTaskToTag(task, tagName);
        if (result.ok) {
            await this.refresh();
        }
        return result;
    }

    /**
     * Removes a command from a tag.
     */
    async removeTaskFromTag(task: TaskItem, tagName: string): Promise<Result<void, string>> {
        const result = this.tagConfig.removeTaskFromTag(task, tagName);
        if (result.ok) {
            await this.refresh();
        }
        return result;
    }

    /**
     * Gets all discovered commands (without filters applied).
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
     * Builds the root category nodes from filtered tasks.
     */
    private buildRootCategories(): CommandTreeItem[] {
        const filtered = this.applyFilters(this.tasks);
        return CATEGORY_DEFS
            .map(def => this.buildCategoryIfNonEmpty(filtered, def))
            .filter((c): c is CommandTreeItem => c !== null);
    }

    /**
     * Builds a single category node if tasks of that type exist.
     */
    private buildCategoryIfNonEmpty(
        tasks: readonly TaskItem[],
        def: CategoryDef
    ): CommandTreeItem | null {
        const matched = tasks.filter(t => t.type === def.type);
        if (matched.length === 0) { return null; }
        return def.flat === true
            ? this.buildFlatCategory(def.label, matched)
            : this.buildCategoryWithFolders(def.label, matched);
    }

    /**
     * Builds a category with commands grouped into nested folder hierarchy.
     */
    private buildCategoryWithFolders(name: string, tasks: TaskItem[]): CommandTreeItem {
        const children = buildNestedFolderItems({
            tasks,
            workspaceRoot: this.workspaceRoot,
            categoryId: name,
            sortTasks: (t) => this.sortTasks(t),
            getScore: (id: string) => this.getSemanticScore(id)
        });
        return new CommandTreeItem(null, `${name} (${tasks.length})`, children);
    }

    /**
     * Builds a flat category without folder grouping.
     */
    private buildFlatCategory(name: string, tasks: TaskItem[]): CommandTreeItem {
        const sorted = this.sortTasks(tasks);
        const categoryId = name;
        const children = sorted.map(t => new CommandTreeItem(
            t,
            null,
            [],
            categoryId,
            this.getSemanticScore(t.id)
        ));
        return new CommandTreeItem(null, `${name} (${tasks.length})`, children);
    }

    /**
     * Gets similarity score for a task if semantic filtering is active.
     * SPEC.md **ai-search-implementation**: Scores displayed as percentages.
     */
    private getSemanticScore(taskId: string): number | undefined {
        return this.semanticFilter?.get(taskId);
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
     * Sorts commands based on the configured sort order.
     */
    private sortTasks(tasks: TaskItem[]): TaskItem[] {
        const comparator = this.getComparator();
        return [...tasks].sort(comparator);
    }

    private getComparator(): (a: TaskItem, b: TaskItem) => number {
        // SPEC.md **ai-search-implementation**: Sort by score when semantic filter is active
        if (this.semanticFilter !== null) {
            const scoreMap = this.semanticFilter;
            return (a, b) => {
                const scoreA = scoreMap.get(a.id) ?? 0;
                const scoreB = scoreMap.get(b.id) ?? 0;
                return scoreB - scoreA;
            };
        }
        const order = this.getSortOrder();
        if (order === 'folder') {
            return (a, b) => a.category.localeCompare(b.category) || a.label.localeCompare(b.label);
        }
        if (order === 'type') {
            return (a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label);
        }
        return (a, b) => a.label.localeCompare(b.label);
    }

    /**
     * Applies tag and semantic filters in sequence.
     */
    private applyFilters(tasks: TaskItem[]): TaskItem[] {
        logger.filter('applyFilters START', { inputCount: tasks.length });
        let result = tasks;
        result = this.applyTagFilter(result);
        result = this.applySemanticFilter(result);
        logger.filter('applyFilters END', { outputCount: result.length });
        return result;
    }

    private applyTagFilter(tasks: TaskItem[]): TaskItem[] {
        if (this.tagFilter === null || this.tagFilter === '') { return tasks; }
        const tag = this.tagFilter;
        return tasks.filter(t => t.tags.includes(tag));
    }

    private applySemanticFilter(tasks: TaskItem[]): TaskItem[] {
        if (this.semanticFilter === null) { return tasks; }
        const scoreMap = this.semanticFilter;
        return tasks.filter(t => scoreMap.has(t.id));
    }
}
