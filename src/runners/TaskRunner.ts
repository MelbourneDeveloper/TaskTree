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
 * Execution mode for tasks.
 */
export type RunMode = 'newTerminal' | 'currentTerminal';

/**
 * Executes tasks based on their type.
 */
export class TaskRunner {
    /**
     * Runs a task, prompting for parameters if needed.
     */
    async run(task: TaskItem, mode: RunMode = 'newTerminal'): Promise<void> {
        const params = await this.collectParams(task.params);
        if (params === null) {
            return;
        }

        if (task.type === 'launch') {
            await this.runLaunch(task);
            return;
        }

        if (task.type === 'vscode') {
            await this.runVsCodeTask(task);
            return;
        }

        switch (mode) {
            case 'newTerminal': {
                this.runInNewTerminal(task, params);
                break;
            }
            case 'currentTerminal': {
                this.runInCurrentTerminal(task, params);
                break;
            }
        }
    }

    /**
     * Collects parameter values from user.
     */
    private async collectParams(
        params?: readonly ParamDef[]
    ): Promise<Map<string, string> | null> {
        const values = new Map<string, string>();
        if (params === undefined || params.length === 0) {
            return values;
        }

        for (const param of params) {
            let value: string | undefined;

            if (param.options !== undefined && param.options.length > 0) {
                value = await vscode.window.showQuickPick([...param.options], {
                    placeHolder: param.description ?? `Select ${param.name}`,
                    title: param.name
                });
            } else {
                const inputOptions: vscode.InputBoxOptions = {
                    prompt: param.description ?? `Enter ${param.name}`,
                    title: param.name
                };
                if (param.default !== undefined) {
                    inputOptions.value = param.default;
                }
                value = await vscode.window.showInputBox(inputOptions);
            }

            if (value === undefined) {
                return null;
            }
            values.set(param.name, value);
        }

        return values;
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
            showError(`Task not found: ${task.label}`);
        }
    }

    /**
     * Runs a task in a new terminal.
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
        terminal.sendText(command);
    }

    /**
     * Runs a task in the current (active) terminal.
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

        if (task.cwd !== undefined && task.cwd !== '') {
            terminal.sendText(`cd "${task.cwd}"`);
        }

        terminal.sendText(command);
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
