import * as vscode from 'vscode';
import type { TaskItem, ParamDef } from '../models/TaskItem';

/**
 * SPEC: command-execution, parameterized-commands
 *
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
     * Collects parameter values from user with their definitions.
     */
    private async collectParams(
        params?: readonly ParamDef[]
    ): Promise<Array<{ def: ParamDef; value: string }> | null> {
        const collected: Array<{ def: ParamDef; value: string }> = [];
        if (params === undefined || params.length === 0) { return collected; }
        for (const param of params) {
            const value = await this.promptForParam(param);
            if (value === undefined) { return null; }
            collected.push({ def: param, value });
        }
        return collected;
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
    private runInNewTerminal(
        task: TaskItem,
        params: Array<{ def: ParamDef; value: string }>
    ): void {
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
    private runInCurrentTerminal(
        task: TaskItem,
        params: Array<{ def: ParamDef; value: string }>
    ): void {
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
     * Builds the full command string with formatted parameters.
     */
    private buildCommand(
        task: TaskItem,
        params: Array<{ def: ParamDef; value: string }>
    ): string {
        let command = task.command;
        const parts: string[] = [];

        for (const { def, value } of params) {
            if (value === '') { continue; }
            const formatted = this.formatParam(def, value);
            if (formatted !== '') { parts.push(formatted); }
        }

        if (parts.length > 0) {
            command = `${command} ${parts.join(' ')}`;
        }
        return command;
    }

    /**
     * Formats a parameter value according to its format type.
     */
    private formatParam(def: ParamDef, value: string): string {
        const format = def.format ?? 'positional';

        switch (format) {
            case 'positional': {
                return `"${value}"`;
            }
            case 'flag': {
                const flagName = def.flag ?? `--${def.name}`;
                return `${flagName} "${value}"`;
            }
            case 'flag-equals': {
                const flagName = def.flag ?? `--${def.name}`;
                return `${flagName}=${value}`;
            }
            case 'dashdash-args': {
                return `-- ${value}`;
            }
        }
    }
}
