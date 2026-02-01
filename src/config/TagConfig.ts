import * as vscode from 'vscode';
import * as path from 'path';
import type { TaskItem, Result } from '../models/TaskItem';
import { ok, err } from '../models/TaskItem';
import { logger } from '../utils/logger';

type TagDefinition = Record<string, Array<string | TagPattern>>;

/**
 * Structured tag pattern for matching tasks.
 */
interface TagPattern {
    id?: string;
    type?: string;
    label?: string;
}

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
     * Applies tags to a list of tasks based on glob patterns.
     */
    applyTags(tasks: TaskItem[]): TaskItem[] {
        logger.tag('applyTags called', { taskCount: tasks.length });

        if (this.config.tags === undefined) {
            logger.tag('No tags configured', {});
            return tasks;
        }

        const tags = this.config.tags;
        const result = tasks.map(task => {
            const matchedTags: string[] = [];

            for (const [tagName, patterns] of Object.entries(tags)) {
                for (const pattern of patterns) {
                    // String = exact ID match
                    const matches = typeof pattern === 'string'
                        ? task.id === pattern
                        : this.matchesPattern(task, pattern);

                    if (matches) {
                        logger.tag('Pattern matched', {
                            tagName,
                            taskId: task.id,
                            taskLabel: task.label,
                            pattern
                        });
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

        const taggedCount = result.filter(t => t.tags.length > 0).length;
        logger.tag('applyTags complete', {
            taskCount: tasks.length,
            taggedCount,
            result: result.map(t => ({ id: t.id, label: t.label, tags: t.tags }))
        });

        return result;
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
     * Adds a task to a specific tag by adding its full task ID.
     * Uses the full ID (type:filePath:name) to uniquely identify the task.
     */
    async addTaskToTag(task: TaskItem, tagName: string): Promise<Result<void, string>> {
        this.config.tags ??= {};

        // Use the full task ID for unique identification
        const pattern = task.id;
        const existingPatterns = this.config.tags[tagName] ?? [];

        if (!existingPatterns.includes(pattern)) {
            this.config.tags[tagName] = [...existingPatterns, pattern];
            return await this.save();
        }
        return ok(undefined);
    }

    /**
     * Removes a task from a specific tag.
     * Uses the full task ID for precise matching.
     */
    async removeTaskFromTag(task: TaskItem, tagName: string): Promise<Result<void, string>> {
        if (this.config.tags?.[tagName] === undefined) {
            return ok(undefined);
        }

        // Use the full task ID for precise removal
        const pattern = task.id;
        const patterns = this.config.tags[tagName];
        const filtered = patterns.filter(p => p !== pattern);

        if (filtered.length === 0) {
            // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
            delete this.config.tags[tagName];
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
     * Moves a task to a new position within a tag's pattern list.
     * Uses the full task ID for precise matching.
     */
    async moveTaskInTag(task: TaskItem, tagName: string, newIndex: number): Promise<Result<void, string>> {
        if (this.config.tags?.[tagName] === undefined) {
            return ok(undefined);
        }

        // Use the full task ID for precise matching
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
     * Checks if a task matches a structured pattern object.
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
