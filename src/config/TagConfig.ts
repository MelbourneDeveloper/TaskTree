import * as vscode from 'vscode';
import * as path from 'path';
import type { TaskItem } from '../models/TaskItem';

type TagDefinition = Record<string, string[]>;

interface TaskTreeConfig {
    tags?: TagDefinition;
}

/**
 * Manages task tags from .vscode/tasktree.json
 */
export class TagConfig {
    private config: TaskTreeConfig = {};
    private readonly configPath: string;

    constructor(workspaceRoot: string) {
        this.configPath = path.join(workspaceRoot, '.vscode', 'tasktree.json');
    }

    /**
     * Loads tag configuration from file.
     */
    async load(): Promise<void> {
        try {
            const uri = vscode.Uri.file(this.configPath);
            const bytes = await vscode.workspace.fs.readFile(uri);
            const content = new TextDecoder().decode(bytes);
            this.config = JSON.parse(content) as TaskTreeConfig;
        } catch {
            // No config file or invalid - use defaults
            this.config = {};
        }
    }

    /**
     * Applies tags to a list of tasks based on glob patterns.
     */
    applyTags(tasks: TaskItem[]): TaskItem[] {
        if (this.config.tags === undefined) {
            return tasks;
        }

        const tags = this.config.tags;
        return tasks.map(task => {
            const matchedTags: string[] = [];

            for (const [tagName, patterns] of Object.entries(tags)) {
                for (const pattern of patterns) {
                    if (this.matchesPattern(task, pattern)) {
                        matchedTags.push(tagName);
                        break;
                    }
                }
            }

            if (matchedTags.length > 0) {
                return { ...task, tags: matchedTags };
            }
            return task;
        });
    }

    /**
     * Gets all defined tag names.
     */
    getTagNames(): string[] {
        return Object.keys(this.config.tags ?? {});
    }

    /**
     * Opens the config file in editor.
     */
    async openConfig(): Promise<void> {
        const uri = vscode.Uri.file(this.configPath);

        try {
            await vscode.workspace.fs.stat(uri);
        } catch {
            // File doesn't exist - create with template
            const template = JSON.stringify(
                {
                    tags: {
                        build: ['Build:*', 'npm:compile', 'make:build'],
                        test: ['Test:*', 'npm:test'],
                        docker: ['**/Dependencies/**']
                    }
                },
                null,
                2
            );
            await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(template));
        }

        const doc = await vscode.workspace.openTextDocument(uri);
        await vscode.window.showTextDocument(doc);
    }

    /**
     * Adds a task to a specific tag by adding its label pattern.
     */
    async addTaskToTag(task: TaskItem, tagName: string): Promise<void> {
        this.config.tags ??= {};

        const pattern = task.label;
        const existingPatterns = this.config.tags[tagName] ?? [];

        if (!existingPatterns.includes(pattern)) {
            this.config.tags[tagName] = [...existingPatterns, pattern];
            await this.save();
        }
    }

    /**
     * Removes a task from a specific tag.
     */
    async removeTaskFromTag(task: TaskItem, tagName: string): Promise<void> {
        if (this.config.tags?.[tagName] === undefined) {
            return;
        }

        const pattern = task.label;
        const patterns = this.config.tags[tagName];
        const filtered = patterns.filter(p => p !== pattern);

        if (filtered.length === 0) {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete this.config.tags[tagName];
        } else {
            this.config.tags[tagName] = filtered;
        }

        await this.save();
    }

    /**
     * Gets the patterns for a specific tag in order.
     */
    getTagPatterns(tagName: string): string[] {
        return this.config.tags?.[tagName] ?? [];
    }

    /**
     * Moves a task to a new position within a tag's pattern list.
     */
    async moveTaskInTag(task: TaskItem, tagName: string, newIndex: number): Promise<void> {
        if (this.config.tags?.[tagName] === undefined) {
            return;
        }

        const pattern = task.label;
        const patterns = [...this.config.tags[tagName]];
        const currentIndex = patterns.indexOf(pattern);

        if (currentIndex === -1) {
            return;
        }

        // Remove from current position
        patterns.splice(currentIndex, 1);

        // Insert at new position
        const insertAt = newIndex > currentIndex ? newIndex - 1 : newIndex;
        patterns.splice(Math.max(0, Math.min(insertAt, patterns.length)), 0, pattern);

        this.config.tags[tagName] = patterns;
        await this.save();
    }

    /**
     * Saves the current configuration to file.
     */
    private async save(): Promise<void> {
        const uri = vscode.Uri.file(this.configPath);
        const content = JSON.stringify(this.config, null, 2);
        await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
    }

    /**
     * Checks if a task matches a glob-like pattern.
     */
    private matchesPattern(task: TaskItem, pattern: string): boolean {
        // Direct label match
        if (this.globMatch(task.label, pattern)) {
            return true;
        }

        // Path match
        if (this.globMatch(task.filePath, pattern)) {
            return true;
        }

        // Category match
        if (this.globMatch(task.category, pattern)) {
            return true;
        }

        // Type:name match (e.g., "npm:test")
        const typeLabel = `${task.type}:${task.label}`;
        if (this.globMatch(typeLabel, pattern)) {
            return true;
        }

        return false;
    }

    /**
     * Simple glob matching supporting * and **
     */
    private globMatch(text: string, pattern: string): boolean {
        // Convert glob to regex
        const regex = pattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape special chars
            .replace(/\*\*/g, '.*') // ** matches anything
            .replace(/\*/g, '[^/]*'); // * matches within segment

        try {
            return new RegExp(`^${regex}$`, 'i').test(text);
        } catch {
            return false;
        }
    }
}
