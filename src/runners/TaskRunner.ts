import * as vscode from 'vscode';
import type { TaskItem, ParamDef } from '../models/TaskItem';

/**
 * Execution mode for tasks.
 */
export type RunMode = 'task' | 'newTerminal' | 'currentTerminal';

/**
 * Executes tasks based on their type.
 */
export class TaskRunner {
    /**
     * Runs a task, prompting for parameters if needed.
     */
    async run(task: TaskItem, mode: RunMode = 'task'): Promise<void> {
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
            case 'task': {
                await this.runAsTask(task, params);
                break;
            }
        }
    }

    /**
     * Runs task as a VS Code task (default behavior).
     */
    private async runAsTask(task: TaskItem, params: Map<string, string>): Promise<void> {
        switch (task.type) {
            case 'shell': {
                await this.runShell(task, params);
                break;
            }
            case 'npm': {
                await this.runNpm(task);
                break;
            }
            case 'make': {
                await this.runMake(task);
                break;
            }
            case 'python': {
                await this.runPython(task, params);
                break;
            }
            case 'launch':
            case 'vscode': {
                // Already handled above
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
     * Runs a shell script.
     */
    private async runShell(task: TaskItem, params: Map<string, string>): Promise<void> {
        let command = task.command;
        if (params.size > 0) {
            const args = Array.from(params.values())
                .map(v => `"${v}"`)
                .join(' ');
            command = `${command} ${args}`;
        }

        const shellOptions: vscode.ShellExecutionOptions = {};
        if (task.cwd !== undefined) {
            shellOptions.cwd = task.cwd;
        }
        const execution = new vscode.ShellExecution(command, shellOptions);

        const vscodeTask = new vscode.Task(
            { type: 'tasktree', task: task.id },
            vscode.TaskScope.Workspace,
            task.label,
            'TaskTree',
            execution
        );

        await vscode.tasks.executeTask(vscodeTask);
    }

    /**
     * Runs an npm script.
     */
    private async runNpm(task: TaskItem): Promise<void> {
        const shellOptions: vscode.ShellExecutionOptions = {};
        if (task.cwd !== undefined) {
            shellOptions.cwd = task.cwd;
        }
        const execution = new vscode.ShellExecution(task.command, shellOptions);

        const vscodeTask = new vscode.Task(
            { type: 'npm', script: task.label },
            vscode.TaskScope.Workspace,
            task.label,
            'npm',
            execution
        );

        await vscode.tasks.executeTask(vscodeTask);
    }

    /**
     * Runs a make target.
     */
    private async runMake(task: TaskItem): Promise<void> {
        const shellOptions: vscode.ShellExecutionOptions = {};
        if (task.cwd !== undefined) {
            shellOptions.cwd = task.cwd;
        }
        const execution = new vscode.ShellExecution(task.command, shellOptions);

        const vscodeTask = new vscode.Task(
            { type: 'make', target: task.label },
            vscode.TaskScope.Workspace,
            task.label,
            'make',
            execution
        );

        await vscode.tasks.executeTask(vscodeTask);
    }

    /**
     * Runs a Python script.
     */
    private async runPython(task: TaskItem, params: Map<string, string>): Promise<void> {
        let command = `python "${task.command}"`;
        if (params.size > 0) {
            const args = Array.from(params.values())
                .map(v => `"${v}"`)
                .join(' ');
            command = `${command} ${args}`;
        }

        const shellOptions: vscode.ShellExecutionOptions = {};
        if (task.cwd !== undefined) {
            shellOptions.cwd = task.cwd;
        }
        const execution = new vscode.ShellExecution(command, shellOptions);

        const vscodeTask = new vscode.Task(
            { type: 'tasktree', task: task.id },
            vscode.TaskScope.Workspace,
            task.label,
            'TaskTree',
            execution
        );

        await vscode.tasks.executeTask(vscodeTask);
    }

    /**
     * Runs a VS Code debug configuration.
     */
    private async runLaunch(task: TaskItem): Promise<void> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (workspaceFolder === undefined) {
            void vscode.window.showErrorMessage('No workspace folder found');
            return;
        }

        const started = await vscode.debug.startDebugging(
            workspaceFolder,
            task.command
        );

        if (!started) {
            void vscode.window.showErrorMessage(`Failed to start: ${task.label}`);
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
            void vscode.window.showErrorMessage(`Task not found: ${task.label}`);
        }
    }

    /**
     * Runs a task in a new terminal.
     */
    private runInNewTerminal(task: TaskItem, params: Map<string, string>): void {
        const command = this.buildCommand(task, params);
        const terminalOptions: vscode.TerminalOptions = {
            name: `TaskTree: ${task.label}`
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
                name: `TaskTree: ${task.label}`
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
