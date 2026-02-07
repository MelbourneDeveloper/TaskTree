import * as vscode from 'vscode';
import type { TaskItem, ParamDef } from '../models/TaskItem';

/**
 * Shows error message without blocking (fire and forget).
 */
function showError(message: string): void {
    vscode.window.showErrorMessage(message).then(
        () => { /* dismissed */ },
        () => { /* error showing message */ }
    );
}

/**
 * Execution mode for commands.
 */
export type RunMode = 'newTerminal' | 'currentTerminal';

const SHELL_INTEGRATION_TIMEOUT_MS = 500;

/**
 * Executes commands based on their type.
 */
export class TaskRunner {
    /**
     * Runs a command, prompting for parameters if needed.
     */
    async run(task: TaskItem, mode: RunMode = 'newTerminal'): Promise<void> {
        const params = await this.collectParams(task.params);
        if (params === null) { return; }
        if (task.type === 'launch') { await this.runLaunch(task); return; }
        if (task.type === 'vscode') { await this.runVsCodeTask(task); return; }
        if (mode === 'currentTerminal') {
            this.runInCurrentTerminal(task, params);
        } else {
            this.runInNewTerminal(task, params);
        }
    }

    /**
     * Collects parameter values from user.
     */
    private async collectParams(
        params?: readonly ParamDef[]
    ): Promise<Map<string, string> | null> {
        const values = new Map<string, string>();
        if (params === undefined || params.length === 0) { return values; }
        for (const param of params) {
            const value = await this.promptForParam(param);
            if (value === undefined) { return null; }
            values.set(param.name, value);
        }
        return values;
    }

    private async promptForParam(param: ParamDef): Promise<string | undefined> {
        if (param.options !== undefined && param.options.length > 0) {
            return await vscode.window.showQuickPick([...param.options], {
                placeHolder: param.description ?? `Select ${param.name}`,
                title: param.name
            });
        }
        const inputOptions: vscode.InputBoxOptions = {
            prompt: param.description ?? `Enter ${param.name}`,
            title: param.name
        };
        if (param.default !== undefined) {
            inputOptions.value = param.default;
        }
        return await vscode.window.showInputBox(inputOptions);
    }

    /**
     * Runs a VS Code debug configuration.
     */
    private async runLaunch(task: TaskItem): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder === undefined) {
            showError('No workspace folder found');
            return;
        }

        const started = await vscode.debug.startDebugging(
            workspaceFolder,
            task.command
        );

        if (!started) {
            showError(`Failed to start: ${task.label}`);
        }
    }

    /**
     * Runs a VS Code task from tasks.json.
     */
    private async runVsCodeTask(task: TaskItem): Promise<void> {
        const allTasks = await vscode.tasks.fetchTasks();
        const matchingTask = allTasks.find(t => t.name === task.command);

        if (matchingTask !== undefined) {
            await vscode.tasks.executeTask(matchingTask);
        } else {
            showError(`Command not found: ${task.label}`);
        }
    }

    /**
     * Runs a command in a new terminal.
     */
    private runInNewTerminal(task: TaskItem, params: Map<string, string>): void {
        const command = this.buildCommand(task, params);
        const terminalOptions: vscode.TerminalOptions = {
            name: `CommandTree: ${task.label}`
        };
        if (task.cwd !== undefined) {
            terminalOptions.cwd = task.cwd;
        }
        const terminal = vscode.window.createTerminal(terminalOptions);
        terminal.show();
        this.executeInTerminal(terminal, command);
    }

    /**
     * Runs a command in the current (active) terminal.
     */
    private runInCurrentTerminal(task: TaskItem, params: Map<string, string>): void {
        const command = this.buildCommand(task, params);
        let terminal = vscode.window.activeTerminal;

        if (terminal === undefined) {
            const terminalOptions: vscode.TerminalOptions = {
                name: `CommandTree: ${task.label}`
            };
            if (task.cwd !== undefined) {
                terminalOptions.cwd = task.cwd;
            }
            terminal = vscode.window.createTerminal(terminalOptions);
        }

        terminal.show();

        const fullCommand = task.cwd !== undefined && task.cwd !== ''
            ? `cd "${task.cwd}" && ${command}`
            : command;

        this.executeInTerminal(terminal, fullCommand);
    }

    /**
     * Executes a command in a terminal using shell integration when available.
     * Waits for shell integration to activate on new terminals, falling back
     * to sendText if it doesn't become available within the timeout.
     */
    private executeInTerminal(terminal: vscode.Terminal, command: string): void {
        if (terminal.shellIntegration !== undefined) {
            terminal.shellIntegration.executeCommand(command);
            return;
        }
        this.waitForShellIntegration(terminal, command);
    }

    private waitForShellIntegration(terminal: vscode.Terminal, command: string): void {
        let resolved = false;
        const listener = vscode.window.onDidChangeTerminalShellIntegration(
            ({ terminal: t, shellIntegration }) => {
                if (t === terminal && !resolved) {
                    resolved = true;
                    listener.dispose();
                    shellIntegration.executeCommand(command);
                }
            }
        );
        setTimeout(() => {
            if (!resolved) {
                resolved = true;
                listener.dispose();
                terminal.sendText(command);
            }
        }, SHELL_INTEGRATION_TIMEOUT_MS);
    }

    /**
     * Builds the full command string with parameters.
     */
    private buildCommand(task: TaskItem, params: Map<string, string>): string {
        let command = task.command;
        if (params.size > 0) {
            const args = Array.from(params.values())
                .map(v => `"${v}"`)
                .join(' ');
            command = `${command} ${args}`;
        }
        return command;
    }
}
