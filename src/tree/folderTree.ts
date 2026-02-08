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
    sortTasks,
    getScore
}: {
    node: DirNode<TaskItem>;
    parentDir: string;
    parentTreeId: string;
    sortTasks: (tasks: TaskItem[]) => TaskItem[];
    getScore: (id: string) => number | undefined;
}): CommandTreeItem {
    const label = getFolderLabel(node.dir, parentDir);
    const folderId = `${parentTreeId}/${label}`;
    const taskItems = sortTasks(node.tasks).map(t => new CommandTreeItem(
        t,
        null,
        [],
        folderId,
        getScore(t.id)
    ));
    const subItems = node.subdirs.map(sub => renderFolder({
        node: sub,
        parentDir: node.dir,
        parentTreeId: folderId,
        sortTasks,
        getScore
    }));
    return new CommandTreeItem(null, label, [...taskItems, ...subItems], parentTreeId);
}

/**
 * Builds nested folder tree items from a flat list of tasks.
 * SPEC.md **ai-search-implementation**: Displays similarity scores as percentages.
 */
export function buildNestedFolderItems({
    tasks,
    workspaceRoot,
    categoryId,
    sortTasks,
    getScore
}: {
    tasks: TaskItem[];
    workspaceRoot: string;
    categoryId: string;
    sortTasks: (tasks: TaskItem[]) => TaskItem[];
    getScore: (id: string) => number | undefined;
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
                sortTasks,
                getScore
            }));
        } else {
            const items = sortTasks(node.tasks).map(t => new CommandTreeItem(
                t,
                null,
                [],
                categoryId,
                getScore(t.id)
            ));
            result.push(...items);
        }
    }

    return result;
}
