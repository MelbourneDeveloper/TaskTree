import * as vscode from 'vscode';
import * as path from 'path';
import type { TaskItem, Result } from '../models/TaskItem';
import { ok, err } from '../models/TaskItem';
import { logger } from '../utils/logger';

type TagDefinition = Record<string, Array<string | TagPattern>>;

/**
 * Structured tag pattern for matching commands.
 */
interface TagPattern {
    id?: string;
    type?: string;
    label?: string;
}

interface CommandTreeConfig {
    tags?: TagDefinition;
}

/**
 * Manages command tags from .vscode/commandtree.json
 */
export class TagConfig {
    private config: CommandTreeConfig = {};
    private readonly configPath: string;

    constructor(workspaceRoot: string) {
        this.configPath = path.join(workspaceRoot, '.vscode', 'commandtree.json');
    }

    /**
     * Loads tag configuration from file.
     */
    async load(): Promise<void> {
        try {
            const uri = vscode.Uri.file(this.configPath);
            const bytes = await vscode.workspace.fs.readFile(uri);
            const content = new TextDecoder().decode(bytes);
            this.config = JSON.parse(content) as CommandTreeConfig;
            logger.config('Loaded config', {
                path: this.configPath,
                tags: this.config.tags as Record<string, unknown> | undefined
            });
        } catch (e) {
            // No config file or invalid - use defaults
            this.config = {};
            logger.config('Failed to load config (using defaults)', {
                path: this.configPath,
                error: e instanceof Error ? e.message : 'Unknown error'
            });
        }
    }

    /**
     * Applies tags to a list of commands based on patterns.
     */
    applyTags(tasks: TaskItem[]): TaskItem[] {
        logger.tag('applyTags called', { taskCount: tasks.length });
        if (this.config.tags === undefined) {
            logger.tag('No tags configured', {});
            return tasks;
        }
        const result = tasks.map(task => this.tagOneTask(task));
        const taggedCount = result.filter(t => t.tags.length > 0).length;
        logger.tag('applyTags complete', { taskCount: tasks.length, taggedCount });
        return result;
    }

    /**
     * Applies matching tag patterns to a single task.
     */
    private tagOneTask(task: TaskItem): TaskItem {
        if (this.config.tags === undefined) { return task; }
        const matchedTags: string[] = [];
        for (const [tagName, patterns] of Object.entries(this.config.tags)) {
            for (const pattern of patterns) {
                const matches = typeof pattern === 'string'
                    ? this.matchesStringPattern(task, pattern)
                    : this.matchesPattern(task, pattern);
                if (matches) {
                    matchedTags.push(tagName);
                    break;
                }
            }
        }
        return matchedTags.length > 0 ? { ...task, tags: matchedTags } : task;
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
     * Adds a command to a specific tag by adding its full ID.
     * Uses the full ID (type:filePath:name) to uniquely identify the command.
     */
    async addTaskToTag(task: TaskItem, tagName: string): Promise<Result<void, string>> {
        this.config.tags ??= {};

        // Use the full command ID for unique identification
        const pattern = task.id;
        const existingPatterns = this.config.tags[tagName] ?? [];

        if (!existingPatterns.includes(pattern)) {
            this.config.tags[tagName] = [...existingPatterns, pattern];
            return await this.save();
        }
        return ok(undefined);
    }

    /**
     * Removes a command from a specific tag.
     * Uses the full command ID for precise matching.
     */
    async removeTaskFromTag(task: TaskItem, tagName: string): Promise<Result<void, string>> {
        if (this.config.tags?.[tagName] === undefined) {
            return ok(undefined);
        }

        // Use the full command ID for precise removal
        const pattern = task.id;
        const patterns = this.config.tags[tagName];
        const filtered = patterns.filter(p => p !== pattern);

        if (filtered.length === 0) {
            const entries = Object.entries(this.config.tags).filter(([key]) => key !== tagName);
            this.config.tags = Object.fromEntries(entries);
        } else {
            this.config.tags[tagName] = filtered;
        }

        return await this.save();
    }

    /**
     * Gets the patterns for a specific tag in order.
     * Returns only string patterns (exact IDs).
     */
    getTagPatterns(tagName: string): string[] {
        const patterns = this.config.tags?.[tagName] ?? [];
        return patterns.filter((p): p is string => typeof p === 'string');
    }

    /**
     * Moves a command to a new position within a tag's pattern list.
     * Uses the full command ID for precise matching.
     */
    async moveTaskInTag(task: TaskItem, tagName: string, newIndex: number): Promise<Result<void, string>> {
        if (this.config.tags?.[tagName] === undefined) {
            return ok(undefined);
        }

        // Use the full command ID for precise matching
        const pattern = task.id;
        const patterns = [...this.config.tags[tagName]];
        const currentIndex = patterns.findIndex(p => p === pattern);

        if (currentIndex === -1) {
            return ok(undefined);
        }

        // Remove from current position
        patterns.splice(currentIndex, 1);

        // Insert at new position
        const insertAt = newIndex > currentIndex ? newIndex - 1 : newIndex;
        patterns.splice(Math.max(0, Math.min(insertAt, patterns.length)), 0, pattern);

        this.config.tags[tagName] = patterns;
        return await this.save();
    }

    /**
     * Saves the current configuration to file.
     */
    private async save(): Promise<Result<void, string>> {
        const uri = vscode.Uri.file(this.configPath);
        const content = JSON.stringify(this.config, null, 2);
        try {
            await vscode.workspace.fs.writeFile(uri, new TextEncoder().encode(content));
            return ok(undefined);
        } catch (e) {
            const message = e instanceof Error ? e.message : 'Unknown error saving config';
            return err(message);
        }
    }

    /**
     * Checks if a command matches a string pattern.
     * Supports exact ID match or type:label format.
     */
    private matchesStringPattern(task: TaskItem, pattern: string): boolean {
        // Exact ID match first
        if (task.id === pattern) {
            return true;
        }

        // Try type:label format (e.g., "npm:build")
        const colonIndex = pattern.indexOf(':');
        if (colonIndex > 0) {
            const patternType = pattern.substring(0, colonIndex);
            const patternLabel = pattern.substring(colonIndex + 1);
            return task.type === patternType && task.label === patternLabel;
        }

        return false;
    }

    /**
     * Checks if a command matches a structured pattern object.
     */
    private matchesPattern(task: TaskItem, pattern: TagPattern): boolean {
        // Match by exact ID if specified
        if (pattern.id !== undefined) {
            return task.id === pattern.id;
        }

        // Match by type and/or label
        const typeMatches = pattern.type === undefined || task.type === pattern.type;
        const labelMatches = pattern.label === undefined || task.label === pattern.label;

        return typeMatches && labelMatches;
    }
}
