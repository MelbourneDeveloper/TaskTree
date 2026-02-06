import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Success variant of Result.
 */
export interface Ok<T> {
    readonly ok: true;
    readonly value: T;
}

/**
 * Error variant of Result.
 */
export interface Err<E> {
    readonly ok: false;
    readonly error: E;
}

/**
 * Result type for operations that can fail.
 * Use instead of throwing errors.
 */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Creates a success result.
 */
export function ok<T>(value: T): Ok<T> {
    return { ok: true, value };
}

/**
 * Creates an error result.
 */
export function err<E>(error: E): Err<E> {
    return { ok: false, error };
}

/**
 * Task type identifiers.
 */
export type TaskType =
    | 'shell'
    | 'npm'
    | 'make'
    | 'launch'
    | 'vscode'
    | 'python'
    | 'powershell'
    | 'gradle'
    | 'cargo'
    | 'maven'
    | 'ant'
    | 'just'
    | 'taskfile'
    | 'deno'
    | 'rake'
    | 'composer'
    | 'docker';

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
 * Tree node for the CommandTree view.
 */
export class CommandTreeItem extends vscode.TreeItem {
    constructor(
        public readonly task: TaskItem | null,
        public readonly categoryLabel: string | null,
        public readonly children: CommandTreeItem[] = [],
        parentId?: string
    ) {
        super(
            task?.label ?? categoryLabel ?? '',
            children.length > 0
                ? vscode.TreeItemCollapsibleState.Collapsed
                : vscode.TreeItemCollapsibleState.None
        );

        // Set unique id for proper tree rendering and indentation
        if (task !== null) {
            this.id = task.id;
            this.contextValue = task.tags.includes('quick') ? 'task-quick' : 'task';
            this.tooltip = this.buildTooltip(task);
            this.iconPath = this.getIcon(task.type);
            const tagStr = task.tags.length > 0 ? ` [${task.tags.join(', ')}]` : '';
            this.description = `${task.category}${tagStr}`;
            this.command = {
                command: 'vscode.open',
                title: 'Open File',
                arguments: [vscode.Uri.file(task.filePath)]
            };
        } else if (categoryLabel !== null && categoryLabel !== '') {
            this.id = parentId !== undefined ? `${parentId}/${categoryLabel}` : categoryLabel;
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
                return new vscode.ThemeIcon('terminal', new vscode.ThemeColor('terminal.ansiGreen'));
            }
            case 'npm': {
                return new vscode.ThemeIcon('package', new vscode.ThemeColor('terminal.ansiMagenta'));
            }
            case 'make': {
                return new vscode.ThemeIcon('tools', new vscode.ThemeColor('terminal.ansiYellow'));
            }
            case 'launch': {
                return new vscode.ThemeIcon('debug-alt', new vscode.ThemeColor('debugIcon.startForeground'));
            }
            case 'vscode': {
                return new vscode.ThemeIcon('gear', new vscode.ThemeColor('terminal.ansiBlue'));
            }
            case 'python': {
                return new vscode.ThemeIcon('symbol-misc', new vscode.ThemeColor('terminal.ansiCyan'));
            }
            case 'powershell': {
                return new vscode.ThemeIcon('terminal-powershell', new vscode.ThemeColor('terminal.ansiBlue'));
            }
            case 'gradle': {
                return new vscode.ThemeIcon('symbol-property', new vscode.ThemeColor('terminal.ansiGreen'));
            }
            case 'cargo': {
                return new vscode.ThemeIcon('package', new vscode.ThemeColor('terminal.ansiRed'));
            }
            case 'maven': {
                return new vscode.ThemeIcon('library', new vscode.ThemeColor('terminal.ansiRed'));
            }
            case 'ant': {
                return new vscode.ThemeIcon('symbol-constructor', new vscode.ThemeColor('terminal.ansiYellow'));
            }
            case 'just': {
                return new vscode.ThemeIcon('checklist', new vscode.ThemeColor('terminal.ansiMagenta'));
            }
            case 'taskfile': {
                return new vscode.ThemeIcon('tasklist', new vscode.ThemeColor('terminal.ansiCyan'));
            }
            case 'deno': {
                return new vscode.ThemeIcon('symbol-namespace', new vscode.ThemeColor('terminal.ansiWhite'));
            }
            case 'rake': {
                return new vscode.ThemeIcon('ruby', new vscode.ThemeColor('terminal.ansiRed'));
            }
            case 'composer': {
                return new vscode.ThemeIcon('symbol-interface', new vscode.ThemeColor('terminal.ansiYellow'));
            }
            case 'docker': {
                return new vscode.ThemeIcon('server-environment', new vscode.ThemeColor('terminal.ansiBlue'));
            }
        }
    }

    private getCategoryIcon(category: string): vscode.ThemeIcon {
        const lower = category.toLowerCase();
        if (lower.includes('shell')) {
            return new vscode.ThemeIcon('terminal', new vscode.ThemeColor('terminal.ansiGreen'));
        }
        if (lower.includes('npm')) {
            return new vscode.ThemeIcon('package', new vscode.ThemeColor('terminal.ansiMagenta'));
        }
        if (lower.includes('make')) {
            return new vscode.ThemeIcon('tools', new vscode.ThemeColor('terminal.ansiYellow'));
        }
        if (lower.includes('launch')) {
            return new vscode.ThemeIcon('debug-alt', new vscode.ThemeColor('debugIcon.startForeground'));
        }
        if (lower.includes('task')) {
            return new vscode.ThemeIcon('gear', new vscode.ThemeColor('terminal.ansiBlue'));
        }
        if (lower.includes('python')) {
            return new vscode.ThemeIcon('symbol-misc', new vscode.ThemeColor('terminal.ansiCyan'));
        }
        if (lower.includes('powershell') || lower.includes('batch')) {
            return new vscode.ThemeIcon('terminal-powershell', new vscode.ThemeColor('terminal.ansiBlue'));
        }
        if (lower.includes('gradle')) {
            return new vscode.ThemeIcon('symbol-property', new vscode.ThemeColor('terminal.ansiGreen'));
        }
        if (lower.includes('cargo') || lower.includes('rust')) {
            return new vscode.ThemeIcon('package', new vscode.ThemeColor('terminal.ansiRed'));
        }
        if (lower.includes('maven')) {
            return new vscode.ThemeIcon('library', new vscode.ThemeColor('terminal.ansiRed'));
        }
        if (lower.includes('ant')) {
            return new vscode.ThemeIcon('symbol-constructor', new vscode.ThemeColor('terminal.ansiYellow'));
        }
        if (lower.includes('just')) {
            return new vscode.ThemeIcon('checklist', new vscode.ThemeColor('terminal.ansiMagenta'));
        }
        if (lower.includes('taskfile')) {
            return new vscode.ThemeIcon('tasklist', new vscode.ThemeColor('terminal.ansiCyan'));
        }
        if (lower.includes('deno')) {
            return new vscode.ThemeIcon('symbol-namespace', new vscode.ThemeColor('terminal.ansiWhite'));
        }
        if (lower.includes('rake') || lower.includes('ruby')) {
            return new vscode.ThemeIcon('ruby', new vscode.ThemeColor('terminal.ansiRed'));
        }
        if (lower.includes('composer') || lower.includes('php')) {
            return new vscode.ThemeIcon('symbol-interface', new vscode.ThemeColor('terminal.ansiYellow'));
        }
        if (lower.includes('docker')) {
            return new vscode.ThemeIcon('server-environment', new vscode.ThemeColor('terminal.ansiBlue'));
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
