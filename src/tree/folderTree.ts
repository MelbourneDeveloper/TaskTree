import type { TaskItem } from '../models/TaskItem';
import { CommandTreeItem } from '../models/TaskItem';
import type { DirNode } from './dirTree';
import {
    groupByFullDir,
    buildDirTree,
    needsFolderWrapper,
    getFolderLabel
} from './dirTree';

/**
 * Renders a DirNode as a folder CommandTreeItem.
 */
function renderFolder({
    node,
    parentDir,
    parentTreeId,
    sortTasks
}: {
    node: DirNode<TaskItem>;
    parentDir: string;
    parentTreeId: string;
    sortTasks: (tasks: TaskItem[]) => TaskItem[];
}): CommandTreeItem {
    const label = getFolderLabel(node.dir, parentDir);
    const folderId = `${parentTreeId}/${label}`;
    const taskItems = sortTasks(node.tasks).map(t => new CommandTreeItem(t, null, [], folderId));
    const subItems = node.subdirs.map(sub => renderFolder({
        node: sub,
        parentDir: node.dir,
        parentTreeId: folderId,
        sortTasks
    }));
    return new CommandTreeItem(null, label, [...taskItems, ...subItems], parentTreeId);
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
}): CommandTreeItem[] {
    const groups = groupByFullDir(tasks, workspaceRoot);
    const rootNodes = buildDirTree(groups);
    const result: CommandTreeItem[] = [];

    for (const node of rootNodes) {
        if (needsFolderWrapper(node, rootNodes.length)) {
            result.push(renderFolder({
                node,
                parentDir: '',
                parentTreeId: categoryId,
                sortTasks
            }));
        } else {
            const items = sortTasks(node.tasks).map(t => new CommandTreeItem(t, null, [], categoryId));
            result.push(...items);
        }
    }

    return result;
}
