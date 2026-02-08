/**
 * SPEC: tagging
 * Tag configuration using exact command ID matching via junction table.
 * All tag data stored in SQLite tags table (junction table design).
 */

import type { TaskItem, Result } from '../models/TaskItem';
import { err } from '../models/TaskItem';
import { getDb } from '../semantic/lifecycle';
import {
    addTagToCommand,
    removeTagFromCommand,
    getCommandIdsByTag,
    getAllTagNames,
    reorderTagCommands
} from '../semantic/db';

export class TagConfig {
    private commandTagsMap = new Map<string, string[]>();

    /**
     * SPEC: tagging
     * Loads all tag assignments from SQLite junction table.
     */
    load(): void {
        const dbResult = getDb();
        if (!dbResult.ok) {
            this.commandTagsMap = new Map();
            return;
        }

        const tagNamesResult = getAllTagNames(dbResult.value);
        if (!tagNamesResult.ok) {
            this.commandTagsMap = new Map();
            return;
        }

        const map = new Map<string, string[]>();
        for (const tagName of tagNamesResult.value) {
            const commandIdsResult = getCommandIdsByTag({
                handle: dbResult.value,
                tagName
            });
            if (commandIdsResult.ok) {
                for (const commandId of commandIdsResult.value) {
                    const tags = map.get(commandId) ?? [];
                    tags.push(tagName);
                    map.set(commandId, tags);
                }
            }
        }
        this.commandTagsMap = map;
    }

    /**
     * SPEC: tagging
     * Applies tags to tasks using exact command ID matching (no patterns).
     */
    applyTags(tasks: TaskItem[]): TaskItem[] {
        return tasks.map(task => {
            const tags = this.commandTagsMap.get(task.id) ?? [];
            return { ...task, tags };
        });
    }

    /**
     * SPEC: tagging
     * Gets all tag names.
     */
    getTagNames(): string[] {
        const dbResult = getDb();
        if (!dbResult.ok) {
            return [];
        }
        const result = getAllTagNames(dbResult.value);
        return result.ok ? result.value : [];
    }

    /**
     * SPEC: tagging/management
     * Adds a task to a tag by creating junction record with exact command ID.
     */
    addTaskToTag(task: TaskItem, tagName: string): Result<void, string> {
        const dbResult = getDb();
        if (!dbResult.ok) {
            return err(dbResult.error);
        }

        const result = addTagToCommand({
            handle: dbResult.value,
            commandId: task.id,
            tagName
        });

        if (result.ok) {
            this.load();
        }
        return result;
    }

    /**
     * SPEC: tagging/management
     * Removes a task from a tag by deleting junction record.
     */
    removeTaskFromTag(task: TaskItem, tagName: string): Result<void, string> {
        const dbResult = getDb();
        if (!dbResult.ok) {
            return err(dbResult.error);
        }

        const result = removeTagFromCommand({
            handle: dbResult.value,
            commandId: task.id,
            tagName
        });

        if (result.ok) {
            this.load();
        }
        return result;
    }

    /**
     * SPEC: quick-launch
     * Gets ordered command IDs for a tag (ordered by display_order).
     */
    getOrderedCommandIds(tagName: string): string[] {
        const dbResult = getDb();
        if (!dbResult.ok) {
            return [];
        }
        const result = getCommandIdsByTag({
            handle: dbResult.value,
            tagName
        });
        return result.ok ? result.value : [];
    }

    /**
     * SPEC: quick-launch
     * Reorders commands for a tag by updating display_order in junction table.
     */
    reorderCommands(tagName: string, orderedCommandIds: string[]): Result<void, string> {
        const dbResult = getDb();
        if (!dbResult.ok) {
            return err(dbResult.error);
        }

        const result = reorderTagCommands({
            handle: dbResult.value,
            tagName,
            orderedCommandIds
        });

        if (result.ok) {
            this.load();
        }
        return result;
    }
}
