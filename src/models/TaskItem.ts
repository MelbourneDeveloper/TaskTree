import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Task type identifiers.
 */
export type TaskType = 'shell' | 'npm' | 'make' | 'launch' | 'vscode' | 'python';

/**
 * Parameter definition for tasks requiring input.
 */
export interface ParamDef {
    readonly name: string;
    readonly description?: string;
    readonly default?: string;
    readonly options?: readonly string[];
}

/**
 * Mutable parameter definition for building during discovery.
 */
export interface MutableParamDef {
    name: string;
    description?: string;
    default?: string;
    options?: string[];
}

/**
 * Represents a discovered task.
 */
export interface TaskItem {
    readonly id: string;
    readonly label: string;
    readonly type: TaskType;
    readonly category: string;
    readonly command: string;
    readonly cwd?: string;
    readonly filePath: string;
    readonly tags: readonly string[];
    readonly params?: readonly ParamDef[];
    readonly description?: string;
}

/**
 * Mutable task item for building during discovery.
 */
export interface MutableTaskItem {
    id: string;
    label: string;
    type: TaskType;
    category: string;
    command: string;
    cwd?: string;
    filePath: string;
    tags: string[];
    params?: ParamDef[];
    description?: string;
}

/**
 * Tree node for the TaskTree view.
 */
export class TaskTreeItem extends vscode.TreeItem {
    constructor(
        public readonly task: TaskItem | null,
        public readonly categoryLabel: string | null,
        public readonly children: TaskTreeItem[] = []
    ) {
        super(
            task?.label ?? categoryLabel ?? '',
            children.length > 0
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
        );

        if (task) {
            this.contextValue = 'task';
            this.tooltip = this.buildTooltip(task);
            this.iconPath = this.getIcon(task.type);
            const tagStr = task.tags.length > 0 ? ` [${task.tags.join(', ')}]` : '';
            this.description = `${task.category}${tagStr}`;
            this.command = {
                command: 'tasktree.run',
                title: 'Run Task',
                arguments: [this]
            };
        } else if (categoryLabel !== null && categoryLabel !== '') {
            this.contextValue = 'category';
            this.iconPath = this.getCategoryIcon(categoryLabel);
        }
    }

    private buildTooltip(task: TaskItem): vscode.MarkdownString {
        const md = new vscode.MarkdownString();
        md.appendMarkdown(`**${task.label}**\n\n`);
        md.appendMarkdown(`Type: \`${task.type}\`\n\n`);
        md.appendMarkdown(`Command: \`${task.command}\`\n\n`);
        if (task.cwd !== undefined && task.cwd !== '') {
            md.appendMarkdown(`Working Dir: \`${task.cwd}\`\n\n`);
        }
        if (task.tags.length > 0) {
            md.appendMarkdown(`Tags: ${task.tags.map(t => `\`${t}\``).join(', ')}\n\n`);
        }
        md.appendMarkdown(`Source: \`${task.filePath}\``);
        return md;
    }

    private getIcon(type: TaskType): vscode.ThemeIcon {
        switch (type) {
            case 'shell': {
                return new vscode.ThemeIcon('terminal');
            }
            case 'npm': {
                return new vscode.ThemeIcon('package');
            }
            case 'make': {
                return new vscode.ThemeIcon('tools');
            }
            case 'launch': {
                return new vscode.ThemeIcon('debug-alt');
            }
            case 'vscode': {
                return new vscode.ThemeIcon('gear');
            }
            case 'python': {
                return new vscode.ThemeIcon('symbol-misc');
            }
        }
    }

    private getCategoryIcon(category: string): vscode.ThemeIcon {
        const lower = category.toLowerCase();
        if (lower.includes('shell')) {
            return new vscode.ThemeIcon('terminal');
        }
        if (lower.includes('npm')) {
            return new vscode.ThemeIcon('package');
        }
        if (lower.includes('make')) {
            return new vscode.ThemeIcon('tools');
        }
        if (lower.includes('launch')) {
            return new vscode.ThemeIcon('debug-alt');
        }
        if (lower.includes('task')) {
            return new vscode.ThemeIcon('gear');
        }
        if (lower.includes('python')) {
            return new vscode.ThemeIcon('symbol-misc');
        }
        return new vscode.ThemeIcon('folder');
    }
}

/**
 * Simplifies a file path to a readable category.
 */
export function simplifyPath(filePath: string, workspaceRoot: string): string {
    const relative = path.relative(workspaceRoot, path.dirname(filePath));
    if (relative === '' || relative === '.') {
        return 'Root';
    }

    const parts = relative.split(path.sep);
    if (parts.length > 3) {
        const first = parts[0];
        const last = parts[parts.length - 1];
        if (first !== undefined && last !== undefined) {
            return `${first}/.../${last}`;
        }
    }
    return relative.replace(/\\/g, '/');
}

/**
 * Generates a unique ID for a task.
 */
export function generateTaskId(type: TaskType, filePath: string, name: string): string {
    return `${type}:${filePath}:${name}`;
}
