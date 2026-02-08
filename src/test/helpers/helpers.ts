import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { CommandTreeProvider } from '../../CommandTreeProvider';
import { QuickTasksProvider } from '../../QuickTasksProvider';
import { CommandTreeItem } from '../../models/TaskItem';
import type { TaskItem, TaskType } from '../../models/TaskItem';

export const EXTENSION_ID = 'nimblesite.commandtree';
export const TREE_VIEW_ID = 'commandtree';

export interface TestContext {
    extension: vscode.Extension<unknown>;
    workspaceRoot: string;
}

export async function activateExtension(): Promise<TestContext> {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    if (!extension) {
        throw new Error(`Extension ${EXTENSION_ID} not found`);
    }

    if (!extension.isActive) {
        await extension.activate();
    }

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error('No workspace folder open');
    }

    const firstFolder = workspaceFolders[0];
    if (!firstFolder) {
        throw new Error('No workspace folder open');
    }

    return {
        extension,
        workspaceRoot: firstFolder.uri.fsPath
    };
}

export function getTreeView(): vscode.TreeView<unknown> | undefined {
    // The tree view is registered internally, we interact via commands
    return undefined;
}

export async function executeCommand<T>(command: string, ...args: unknown[]): Promise<T> {
    return await vscode.commands.executeCommand<T>(command, ...args);
}

export async function refreshTasks(): Promise<void> {
    await executeCommand('commandtree.refresh');
    // Wait for async discovery to complete
    await sleep(500);
}

export async function filterTasks(_filterText: string): Promise<void> {
    // We need to mock the input box since we can't interact with UI in tests
    // Instead, we'll test the filtering logic through the provider directly
    await executeCommand('commandtree.filter');
}

export async function filterByTag(_tag: string): Promise<void> {
    // _tag is used for API compatibility - the actual tag filtering happens via UI
    await executeCommand('commandtree.filterByTag');
}

export async function clearFilter(): Promise<void> {
    await executeCommand('commandtree.clearFilter');
}

export async function runTask(taskItem: unknown): Promise<void> {
    await executeCommand('commandtree.run', taskItem);
}

export async function sleep(ms: number): Promise<void> {
    await new Promise<void>(resolve => { setTimeout(resolve, ms); });
}

export function getFixturePath(relativePath: string): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        throw new Error('No workspace folder open');
    }
    const firstFolder = workspaceFolders[0];
    if (!firstFolder) {
        throw new Error('No workspace folder open');
    }
    return path.join(firstFolder.uri.fsPath, relativePath);
}

export function getExtensionPath(relativePath: string): string {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    if (!extension) {
        throw new Error(`Extension ${EXTENSION_ID} not found`);
    }
    return path.join(extension.extensionPath, relativePath);
}

export function writeFile(filePath: string, content: string): void {
    const fullPath = getFixturePath(filePath);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(fullPath, content, 'utf8');
}

export function deleteFile(filePath: string): void {
    const fullPath = getFixturePath(filePath);
    if (fs.existsSync(fullPath)) {
        fs.unlinkSync(fullPath);
    }
}

export function readFile(filePath: string): string {
    const fullPath = getFixturePath(filePath);
    return fs.readFileSync(fullPath, 'utf8');
}

export function fileExists(filePath: string): boolean {
    const fullPath = getFixturePath(filePath);
    return fs.existsSync(fullPath);
}

export async function waitForCondition(
    condition: () => Promise<boolean>,
    timeout = 5000,
    interval = 100
): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
        if (await condition()) {
            return;
        }
        await sleep(interval);
    }
    throw new Error(`Condition not met within ${timeout}ms`);
}

export function getCommandTreeProvider(): CommandTreeProvider {
    // Access the tree data provider through the extension's exports
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    if (extension === undefined) {
        throw new Error('Extension not found');
    }
    if (!extension.isActive) {
        throw new Error('Extension not active');
    }
    const extensionExports = extension.exports as { commandTreeProvider?: CommandTreeProvider } | undefined;
    const provider = extensionExports?.commandTreeProvider;
    if (!provider) {
        throw new Error('CommandTreeProvider not exported from extension');
    }
    return provider;
}

export async function getTreeChildren(provider: CommandTreeProvider, parent?: CommandTreeItem): Promise<CommandTreeItem[]> {
    return await provider.getChildren(parent);
}

export function getQuickTasksProvider(): QuickTasksProvider {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    if (extension === undefined) {
        throw new Error('Extension not found');
    }
    if (!extension.isActive) {
        throw new Error('Extension not active');
    }
    const extensionExports = extension.exports as { quickTasksProvider?: QuickTasksProvider } | undefined;
    const provider = extensionExports?.quickTasksProvider;
    if (!provider) {
        throw new Error('QuickTasksProvider not exported from extension');
    }
    return provider;
}

export { CommandTreeProvider, CommandTreeItem, QuickTasksProvider };

export function getLabelString(label: string | vscode.TreeItemLabel | undefined): string {
    if (label === undefined) {
        return "";
    }
    if (typeof label === "string") {
        return label;
    }
    return label.label;
}

export async function collectLeafItems(
    p: CommandTreeProvider,
): Promise<CommandTreeItem[]> {
    const out: CommandTreeItem[] = [];
    async function walk(node: CommandTreeItem): Promise<void> {
        if (node.task !== null) {
            out.push(node);
        }
        for (const child of await p.getChildren(node)) {
            await walk(child);
        }
    }
    for (const root of await p.getChildren()) {
        await walk(root);
    }
    return out;
}

export async function collectLeafTasks(p: CommandTreeProvider): Promise<TaskItem[]> {
    const items = await collectLeafItems(p);
    return items.map((i) => i.task).filter((t): t is TaskItem => t !== null);
}

export function getTooltipText(item: CommandTreeItem): string {
    if (item.tooltip instanceof vscode.MarkdownString) {
        return item.tooltip.value;
    }
    if (typeof item.tooltip === "string") {
        return item.tooltip;
    }
    return "";
}

export async function captureTerminalOutput(terminalName: string, timeout = 5000): Promise<string> {
    // Find the terminal by name
    const terminal = vscode.window.terminals.find(t => t.name === terminalName);
    if (!terminal) {
        throw new Error(`Terminal "${terminalName}" not found`);
    }
    // Note: VS Code API doesn't provide direct access to terminal output
    // This is a limitation of the VS Code API
    await sleep(timeout);
    return '';
}

export function createMockTaskItem(overrides: Partial<{
    id: string;
    label: string;
    type: TaskType;
    command: string;
    cwd: string;
    filePath: string;
    category: string;
    description: string;
    params: Array<{ name: string; description: string; default?: string; options?: string[] }>;
    tags: string[];
}> = {}): TaskItem {
    const base = {
        id: overrides.id ?? 'test-task-id',
        label: overrides.label ?? 'Test Command',
        type: overrides.type ?? 'shell',
        command: overrides.command ?? 'echo test',
        filePath: overrides.filePath ?? '/tmp/test.sh',
        category: overrides.category ?? 'Test Category',
        description: overrides.description ?? 'A test command',
        params: overrides.params ?? [],
        tags: overrides.tags ?? []
    };
    return overrides.cwd !== undefined ? { ...base, cwd: overrides.cwd } : base;
}
