/**
 * Tag configuration storage and pattern matching.
 * See SPEC.md **user-data-storage** and **ai-database-schema** for architecture.
 * All tag data stored in SQLite tags table, synced from .vscode/commandtree.json.
 */

import type { TaskItem, Result } from '../models/TaskItem';
import { err } from '../models/TaskItem';
import { getDb } from '../semantic/lifecycle';
import {
    getAllTagRows,
    addPatternToTag,
    removePatternFromTag,
    replaceTagPatterns
} from '../semantic/db';

/**
 * Structured tag pattern for matching tasks.
 * Patterns can be objects with type/label/id fields.
 */
export interface TagPattern {
    readonly id?: string;
    readonly type?: string;
    readonly label?: string;
}

export class TagConfig {
    private tagData = new Map<string, string[]>();

    /**
     * Loads tags from SQLite database.
     * SPEC.md **ai-database-schema**: tags table (tag_name, pattern, sort_order)
     * SPEC.md **user-data-storage**: All data in SQLite at {workspaceFolder}/.commandtree/
     */
    load(): void {
        const dbResult = getDb();
        if (!dbResult.ok) {
            this.tagData = new Map();
            return;
        }

        const rowsResult = getAllTagRows(dbResult.value);
        if (!rowsResult.ok) {
            this.tagData = new Map();
            return;
        }

        const map = new Map<string, string[]>();
        for (const row of rowsResult.value) {
            const patterns = map.get(row.tagName) ?? [];
            patterns.push(row.pattern);
            map.set(row.tagName, patterns);
        }
        this.tagData = map;
    }

    /**
     * Applies tags to tasks based on pattern matching.
     * SPEC.md **tagging/pattern-syntax**: patterns like "npm:build", "type:shell:*"
     */
    applyTags(tasks: TaskItem[]): TaskItem[] {
        return tasks.map(task => {
            const tags = this.getMatchingTags(task);
            return { ...task, tags };
        });
    }

    /**
     * Gets all tags that match a task based on patterns.
     */
    private getMatchingTags(task: TaskItem): string[] {
        const tags: string[] = [];
        for (const [tagName, patterns] of this.tagData.entries()) {
            if (patterns.some(p => this.matchesPattern(task, p))) {
                tags.push(tagName);
            }
        }
        return tags;
    }

    /**
     * Checks if a task matches a pattern.
     * SPEC.md **tagging/pattern-syntax**: supports object patterns, type:label format, wildcards
     */
    private matchesPattern(task: TaskItem, pattern: string): boolean {
        const objPattern = this.tryParseObjectPattern(pattern);
        if (objPattern !== null) {
            return this.matchesObjectPattern(task, objPattern);
        }
        return this.matchesStringPattern(task, pattern);
    }

    /**
     * Tries to parse a pattern as JSON object pattern.
     * Returns null if it's not a valid JSON object pattern.
     */
    private tryParseObjectPattern(pattern: string): TagPattern | null {
        if (!pattern.startsWith('{')) {
            return null;
        }
        try {
            const parsed = JSON.parse(pattern) as TagPattern;
            return parsed;
        } catch {
            return null;
        }
    }

    /**
     * Matches a task against an object pattern.
     */
    private matchesObjectPattern(task: TaskItem, pattern: TagPattern): boolean {
        if (pattern.id !== undefined) {
            return task.id === pattern.id;
        }
        const typeMatches = pattern.type === undefined || task.type === pattern.type;
        const labelMatches = pattern.label === undefined || task.label === pattern.label;
        return typeMatches && labelMatches;
    }

    /**
     * Matches a task against a string pattern.
     */
    private matchesStringPattern(task: TaskItem, pattern: string): boolean {
        if (pattern === task.id) {
            return true;
        }
        const colonIndex = pattern.indexOf(':');
        if (colonIndex > 0) {
            const patternType = pattern.substring(0, colonIndex);
            const patternLabel = pattern.substring(colonIndex + 1);
            return task.type === patternType && task.label === patternLabel;
        }
        const lower = pattern.toLowerCase();
        if (lower.includes('*')) {
            const regex = this.patternToRegex(lower);
            return regex.test(task.id.toLowerCase()) ||
                regex.test(task.label.toLowerCase()) ||
                regex.test(task.filePath.toLowerCase());
        }
        return task.id.toLowerCase().includes(lower) ||
            task.label.toLowerCase().includes(lower);
    }

    /**
     * Converts a wildcard pattern to a regex.
     */
    private patternToRegex(pattern: string): RegExp {
        const escaped = pattern
            .split('*')
            .map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
            .join('.*');
        return new RegExp(`^${escaped}$`);
    }

    /**
     * Gets all tag names.
     */
    getTagNames(): string[] {
        return Array.from(this.tagData.keys());
    }

    /**
     * Gets patterns for a specific tag.
     */
    getTagPatterns(tagName: string): string[] {
        return this.tagData.get(tagName) ?? [];
    }

    /**
     * Adds a task to a tag by adding its ID as a pattern.
     * SPEC.md **tagging/management**: tags stored in SQLite
     */
    addTaskToTag(task: TaskItem, tagName: string): Result<void, string> {
        const dbResult = getDb();
        if (!dbResult.ok) {
            return err(dbResult.error);
        }

        const result = addPatternToTag({
            handle: dbResult.value,
            tagName,
            pattern: task.id
        });

        if (result.ok) {
            this.load();
        }
        return result;
    }

    /**
     * Removes a task from a tag by removing its ID pattern.
     */
    removeTaskFromTag(task: TaskItem, tagName: string): Result<void, string> {
        const dbResult = getDb();
        if (!dbResult.ok) {
            return err(dbResult.error);
        }

        const result = removePatternFromTag({
            handle: dbResult.value,
            tagName,
            pattern: task.id
        });

        if (result.ok) {
            this.load();
        }
        return result;
    }

    /**
     * Moves a task to a new position within a tag (for drag-and-drop reordering).
     */
    moveTaskInTag(
        task: TaskItem,
        tagName: string,
        newIndex: number
    ): Result<void, string> {
        const patterns = this.getTagPatterns(tagName);
        const currentIndex = patterns.indexOf(task.id);
        if (currentIndex === -1) {
            return err('Task not in tag');
        }

        const reordered = [...patterns];
        reordered.splice(currentIndex, 1);
        reordered.splice(newIndex, 0, task.id);

        const dbResult = getDb();
        if (!dbResult.ok) {
            return err(dbResult.error);
        }

        const result = replaceTagPatterns({
            handle: dbResult.value,
            tagName,
            patterns: reordered
        });

        if (result.ok) {
            this.load();
        }
        return result;
    }
}
