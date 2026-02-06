import * as path from 'path';
import type { TaskItem } from '../models/TaskItem';
import { TaskTreeItem } from '../models/TaskItem';

/**
 * Represents a node in the directory tree.
 */
interface DirNode {
    readonly dir: string;
    readonly tasks: TaskItem[];
    readonly subdirs: DirNode[];
}

/**
 * Groups tasks by their full relative directory path.
 */
function groupByFullDir(tasks: TaskItem[], workspaceRoot: string): Map<string, TaskItem[]> {
    const groups = new Map<string, TaskItem[]>();
    for (const task of tasks) {
        const relDir = path.relative(workspaceRoot, path.dirname(task.filePath));
        const key = relDir === '' || relDir === '.' ? '' : relDir.split(path.sep).join('/');
        const existing = groups.get(key) ?? [];
        existing.push(task);
        groups.set(key, existing);
    }
    return groups;
}

/**
 * Finds the closest parent directory among a set of directories.
 */
function findClosestParent(dir: string, allDirs: readonly string[]): string | null {
    let closest: string | null = null;
    for (const other of allDirs) {
        const isParent = other !== dir && dir.startsWith(other + '/');
        if (isParent && (closest === null || other.length > closest.length)) {
            closest = other;
        }
    }
    return closest;
}

/**
 * Builds parent-to-children directory mapping.
 */
function buildChildrenMap(sortedDirs: readonly string[]): Map<string | null, string[]> {
    const childrenMap = new Map<string | null, string[]>();
    for (const dir of sortedDirs) {
        const parent = findClosestParent(dir, sortedDirs);
        const siblings = childrenMap.get(parent) ?? [];
        siblings.push(dir);
        childrenMap.set(parent, siblings);
    }
    return childrenMap;
}

/**
 * Recursively builds a DirNode from directory maps.
 */
function buildNode(
    dir: string,
    groups: Map<string, TaskItem[]>,
    childrenMap: Map<string | null, string[]>
): DirNode {
    const tasks = groups.get(dir) ?? [];
    const childDirs = childrenMap.get(dir) ?? [];
    return {
        dir,
        tasks,
        subdirs: childDirs.map(d => buildNode(d, groups, childrenMap))
    };
}

/**
 * Builds nested directory tree from flat task list.
 */
function buildDirTree(groups: Map<string, TaskItem[]>): DirNode[] {
    const sortedDirs = Array.from(groups.keys()).sort();
    const childrenMap = buildChildrenMap(sortedDirs);
    const rootDirs = childrenMap.get(null) ?? [];
    return rootDirs.map(d => buildNode(d, groups, childrenMap));
}

/**
 * Simplifies a relative directory path for display.
 */
function simplifyDirLabel(relDir: string): string {
    if (relDir === '' || relDir === '.') {
        return 'Root';
    }
    const parts = relDir.split('/');
    if (parts.length <= 3) {
        return relDir;
    }
    const first = parts[0];
    const last = parts[parts.length - 1];
    return first !== undefined && last !== undefined ? `${first}/.../${last}` : relDir;
}

/**
 * Gets display label for a nested folder node.
 */
function getFolderLabel(dir: string, parentDir: string): string {
    if (parentDir === '') {
        return simplifyDirLabel(dir);
    }
    return dir.substring(parentDir.length + 1);
}

/**
 * Renders a DirNode as a folder TaskTreeItem.
 */
function renderFolder({
    node,
    parentDir,
    parentTreeId,
    sortTasks
}: {
    node: DirNode;
    parentDir: string;
    parentTreeId: string;
    sortTasks: (tasks: TaskItem[]) => TaskItem[];
}): TaskTreeItem {
    const label = getFolderLabel(node.dir, parentDir);
    const folderId = `${parentTreeId}/${label}`;
    const taskItems = sortTasks(node.tasks).map(t => new TaskTreeItem(t, null, [], folderId));
    const subItems = node.subdirs.map(sub => renderFolder({
        node: sub,
        parentDir: node.dir,
        parentTreeId: folderId,
        sortTasks
    }));
    return new TaskTreeItem(null, label, [...taskItems, ...subItems], parentTreeId);
}

/**
 * Decides whether a root-level DirNode needs a folder wrapper.
 */
function needsFolderWrapper(node: DirNode, totalRootNodes: number): boolean {
    if (node.subdirs.length > 0) {
        return true;
    }
    if (node.tasks.length > 1) {
        return true;
    }
    if (totalRootNodes === 1 && node.tasks.length === 1) {
        return false;
    }
    return false;
}

/**
 * Builds nested folder tree items from a flat list of tasks.
 */
export function buildNestedFolderItems({
    tasks,
    workspaceRoot,
    categoryId,
    sortTasks
}: {
    tasks: TaskItem[];
    workspaceRoot: string;
    categoryId: string;
    sortTasks: (tasks: TaskItem[]) => TaskItem[];
}): TaskTreeItem[] {
    const groups = groupByFullDir(tasks, workspaceRoot);
    const rootNodes = buildDirTree(groups);
    const result: TaskTreeItem[] = [];

    for (const node of rootNodes) {
        if (needsFolderWrapper(node, rootNodes.length)) {
            result.push(renderFolder({
                node,
                parentDir: '',
                parentTreeId: categoryId,
                sortTasks
            }));
        } else {
            const items = sortTasks(node.tasks).map(t => new TaskTreeItem(t, null, [], categoryId));
            result.push(...items);
        }
    }

    return result;
}
