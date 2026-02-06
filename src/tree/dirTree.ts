import * as path from 'path';

/**
 * Minimal task info needed for directory grouping.
 */
export interface DirTaskInfo {
    readonly filePath: string;
}

/**
 * Represents a node in the directory tree.
 */
export interface DirNode<T extends DirTaskInfo> {
    readonly dir: string;
    readonly tasks: T[];
    readonly subdirs: Array<DirNode<T>>;
}

/**
 * Groups tasks by their full relative directory path.
 */
export function groupByFullDir<T extends DirTaskInfo>(
    tasks: T[],
    workspaceRoot: string
): Map<string, T[]> {
    const groups = new Map<string, T[]>();
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
        const isParent = other !== dir && dir.startsWith(`${other}/`);
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
function buildNode<T extends DirTaskInfo>(
    dir: string,
    groups: Map<string, T[]>,
    childrenMap: Map<string | null, string[]>
): DirNode<T> {
    const tasks = groups.get(dir) ?? [];
    const childDirs = childrenMap.get(dir) ?? [];
    return {
        dir,
        tasks,
        subdirs: childDirs.map(d => buildNode(d, groups, childrenMap))
    };
}

/**
 * Builds nested directory tree from grouped tasks.
 */
export function buildDirTree<T extends DirTaskInfo>(groups: Map<string, T[]>): Array<DirNode<T>> {
    const sortedDirs = Array.from(groups.keys()).sort();
    const childrenMap = buildChildrenMap(sortedDirs);
    const rootDirs = childrenMap.get(null) ?? [];
    return rootDirs.map(d => buildNode(d, groups, childrenMap));
}

/**
 * Decides whether a root-level DirNode needs a folder wrapper.
 */
export function needsFolderWrapper<T extends DirTaskInfo>(
    node: DirNode<T>,
    totalRootNodes: number
): boolean {
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
 * Simplifies a relative directory path for display.
 */
export function simplifyDirLabel(relDir: string): string {
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
export function getFolderLabel(dir: string, parentDir: string): string {
    if (parentDir === '') {
        return simplifyDirLabel(dir);
    }
    return dir.substring(parentDir.length + 1);
}
