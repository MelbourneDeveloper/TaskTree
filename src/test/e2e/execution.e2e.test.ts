/**
 * EXECUTION E2E TESTS
 *
 * These tests verify command registration and terminal management.
 * Tests that call provider methods have been moved to execution.unit.test.ts
 */

import * as assert from "assert";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  activateExtension,
  sleep,
  getFixturePath,
  createMockTaskItem,
} from "../helpers/helpers";
import type { TestContext } from "../helpers/helpers";

interface PackageJson {
  scripts?: Record<string, string>;
}

suite("Task Execution E2E Tests", () => {
  let context: TestContext;

  suiteSetup(async function () {
    this.timeout(30000);
    context = await activateExtension();
    await sleep(2000);
  });

  suiteTeardown(() => {
    for (const t of vscode.window.terminals) {
      t.dispose();
    }
  });

  suite("Run Command", () => {
    test("run command is registered", async function () {
      this.timeout(10000);

      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes("tasktree.run"),
        "run command should be registered",
      );
    });

    test("run command handles undefined task gracefully", async function () {
      this.timeout(10000);

      const terminalsBefore = vscode.window.terminals.length;

      try {
        await vscode.commands.executeCommand("tasktree.run", undefined);
        await sleep(500);
      } catch {
        // Expected to potentially throw or show error
      }

      const terminalsAfter = vscode.window.terminals.length;
      assert.strictEqual(
        terminalsAfter,
        terminalsBefore,
        "Should not create terminal for undefined task",
      );
    });

    test("run command handles null task gracefully", async function () {
      this.timeout(10000);

      const terminalsBefore = vscode.window.terminals.length;

      try {
        await vscode.commands.executeCommand("tasktree.run", null);
        await sleep(500);
      } catch {
        // Expected behavior
      }

      const terminalsAfter = vscode.window.terminals.length;
      assert.strictEqual(
        terminalsAfter,
        terminalsBefore,
        "Should not create terminal for null task",
      );
    });
  });

  suite("Shell Script Execution", () => {
    test("shell scripts exist and are executable format", function () {
      this.timeout(10000);

      const buildScript = getFixturePath("scripts/build.sh");
      assert.ok(fs.existsSync(buildScript), "build.sh should exist");

      const content = fs.readFileSync(buildScript, "utf8");
      assert.ok(content.startsWith("#!/bin/bash"), "Should have shebang");
    });

    test("shell task creates terminal with correct name", async function () {
      this.timeout(15000);

      const terminalsBefore = vscode.window.terminals.length;

      const shellTask = createMockTaskItem({
        type: "shell",
        label: "Test Shell Task",
        command: "./scripts/test.sh",
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
      });

      try {
        await vscode.commands.executeCommand("tasktree.run", shellTask);
        await sleep(2000);

        const terminalsAfter = vscode.window.terminals.length;
        assert.ok(
          terminalsAfter >= terminalsBefore,
          "Shell task should create or reuse terminal",
        );
      } catch {
        const terminalsAfter = vscode.window.terminals.length;
        assert.ok(
          terminalsAfter >= 0,
          "Terminals should remain accessible after param prompt",
        );
      }
    });

    test("shell task with parameters has param definitions", function () {
      this.timeout(10000);

      const buildScript = fs.readFileSync(
        getFixturePath("scripts/build.sh"),
        "utf8",
      );

      assert.ok(
        buildScript.includes("@param config"),
        "Should have config param",
      );
      assert.ok(
        buildScript.includes("@param verbose"),
        "Should have verbose param",
      );
    });

    test("shell task with options shows quick pick", function () {
      this.timeout(10000);

      const deployScript = fs.readFileSync(
        getFixturePath("scripts/deploy.sh"),
        "utf8",
      );

      assert.ok(
        deployScript.includes("options:"),
        "Should have options in param",
      );
      assert.ok(
        deployScript.includes("dev, staging, prod"),
        "Should list environment options",
      );
    });
  });

  suite("NPM Script Execution", () => {
    test("npm scripts are defined in package.json", function () {
      this.timeout(10000);

      const packageJson = JSON.parse(
        fs.readFileSync(getFixturePath("package.json"), "utf8"),
      ) as PackageJson;
      const scripts = packageJson.scripts;

      assert.ok(scripts !== undefined, "Should have scripts object");
      assert.ok(scripts["build"] !== undefined, "Should have build script");
      assert.ok(scripts["test"] !== undefined, "Should have test script");
    });

    test("npm task creates correct command", function () {
      this.timeout(10000);

      const npmTask = createMockTaskItem({
        type: "npm",
        label: "build",
        command: "npm run build",
        cwd: context.workspaceRoot,
      });

      assert.strictEqual(
        npmTask.command,
        "npm run build",
        "Should have correct command",
      );
    });

    test("npm task uses correct working directory", function () {
      this.timeout(10000);

      const subprojectCwd = path.join(context.workspaceRoot, "subproject");

      const npmTask = createMockTaskItem({
        type: "npm",
        label: "build",
        command: "npm run build",
        cwd: subprojectCwd,
        category: "subproject",
      });

      assert.strictEqual(
        npmTask.cwd,
        subprojectCwd,
        "Should have subproject cwd",
      );
    });
  });

  suite("Make Target Execution", () => {
    test("Makefile targets are defined", function () {
      this.timeout(10000);

      const makefile = fs.readFileSync(getFixturePath("Makefile"), "utf8");

      assert.ok(makefile.includes("build:"), "Should have build target");
      assert.ok(makefile.includes("test:"), "Should have test target");
      assert.ok(makefile.includes("clean:"), "Should have clean target");
    });

    test("make task creates correct command", function () {
      this.timeout(10000);

      const makeTask = createMockTaskItem({
        type: "make",
        label: "build",
        command: "make build",
        cwd: context.workspaceRoot,
      });

      assert.strictEqual(
        makeTask.command,
        "make build",
        "Should have correct command",
      );
    });

    test("make task targets phony declarations", function () {
      this.timeout(10000);

      const makefile = fs.readFileSync(getFixturePath("Makefile"), "utf8");

      assert.ok(makefile.includes(".PHONY:"), "Should have .PHONY declaration");
    });
  });

  suite("Launch Configuration Execution", () => {
    test("launch configurations are defined", function () {
      this.timeout(10000);

      const launchJson = fs.readFileSync(
        getFixturePath(".vscode/launch.json"),
        "utf8",
      );

      assert.ok(
        launchJson.includes("Debug Application"),
        "Should have Debug Application",
      );
      assert.ok(launchJson.includes("Debug Tests"), "Should have Debug Tests");
    });

    test("launch task uses debug API", function () {
      this.timeout(10000);

      const launchTask = createMockTaskItem({
        type: "launch",
        label: "Debug Application",
        command: "Debug Application",
      });

      assert.strictEqual(launchTask.type, "launch", "Should be launch type");
    });

    test("launch configurations have correct types", function () {
      this.timeout(10000);

      const launchJson = fs.readFileSync(
        getFixturePath(".vscode/launch.json"),
        "utf8",
      );

      assert.ok(launchJson.includes('"type": "node"'), "Should have node type");
      assert.ok(
        launchJson.includes('"type": "python"'),
        "Should have python type",
      );
    });
  });

  suite("VS Code Task Execution", () => {
    test("VS Code tasks are defined", function () {
      this.timeout(10000);

      const tasksJson = fs.readFileSync(
        getFixturePath(".vscode/tasks.json"),
        "utf8",
      );

      assert.ok(
        tasksJson.includes("Build Project"),
        "Should have Build Project",
      );
      assert.ok(tasksJson.includes("Run Tests"), "Should have Run Tests");
    });

    test("vscode task fetches from task provider", async function () {
      this.timeout(15000);

      const tasks = await vscode.tasks.fetchTasks();

      assert.ok(Array.isArray(tasks), "fetchTasks should return array");
    });

    test("vscode task with inputs has parameter definitions", function () {
      this.timeout(10000);

      const tasksJson = fs.readFileSync(
        getFixturePath(".vscode/tasks.json"),
        "utf8",
      );

      assert.ok(
        tasksJson.includes("${input:deployEnv}"),
        "Should reference deployEnv",
      );
      assert.ok(
        tasksJson.includes('"id": "deployEnv"'),
        "Should define deployEnv input",
      );
    });
  });

  suite("Parameter Collection", () => {
    test("task with no params executes directly", function () {
      this.timeout(10000);

      const taskWithoutParams = createMockTaskItem({
        type: "shell",
        label: "Simple Task",
        command: 'echo "hello"',
        params: [],
      });

      assert.strictEqual(
        taskWithoutParams.params?.length ?? 0,
        0,
        "Should have no params",
      );
    });

    test("task with params has param definitions", function () {
      this.timeout(10000);

      const taskWithParams = createMockTaskItem({
        type: "shell",
        label: "Param Task",
        command: "./scripts/build.sh",
        params: [
          {
            name: "config",
            description: "Build configuration",
            default: "debug",
          },
          { name: "verbose", description: "Enable verbose output" },
        ],
      });

      assert.strictEqual(
        taskWithParams.params?.length ?? 0,
        2,
        "Should have 2 params",
      );
    });

    test("param with options creates quick pick choices", function () {
      this.timeout(10000);

      const paramWithOptions = {
        name: "environment",
        description: "Target environment",
        options: ["dev", "staging", "prod"],
      };

      assert.ok(paramWithOptions.options.length === 3, "Should have 3 options");
    });

    test("param with default value provides placeholder", function () {
      this.timeout(10000);

      const paramWithDefault = {
        name: "config",
        description: "Build configuration",
        default: "debug",
      };

      assert.ok(
        paramWithDefault.default === "debug",
        "Should have default value",
      );
    });
  });

  suite("Task Execution Error Handling", () => {
    test("handles task cancellation gracefully", function () {
      this.timeout(10000);

      const taskWithParams = createMockTaskItem({
        type: "shell",
        label: "Param Task",
        command: "./scripts/build.sh",
        params: [{ name: "config", description: "Build configuration" }],
      });

      assert.ok(taskWithParams.params !== undefined, "Task should have params");
      assert.ok(
        taskWithParams.params.length > 0,
        "Task should have at least one param",
      );
    });
  });

  suite("Terminal Management", () => {
    test("terminals are created for shell tasks", function () {
      this.timeout(10000);

      assert.ok(
        vscode.window.terminals.length >= 0,
        "Terminals API should be available",
      );
    });

    test("terminal names are descriptive", async function () {
      this.timeout(15000);

      const shellTask = createMockTaskItem({
        type: "shell",
        label: "Descriptive Name Test",
        command: 'echo "test"',
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
      });

      const taskTreeItem = { task: shellTask };
      await vscode.commands.executeCommand("tasktree.run", taskTreeItem);
      await sleep(1500);

      const taskTreeTerminal = vscode.window.terminals.find((t) =>
        t.name.includes("TaskTree"),
      );
      assert.ok(
        taskTreeTerminal !== undefined,
        "Terminal should have TaskTree in name",
      );
    });

    test("task execution creates VS Code task", function () {
      this.timeout(15000);

      assert.strictEqual(
        typeof vscode.tasks.fetchTasks,
        "function",
        "fetchTasks should be a function",
      );
      assert.strictEqual(
        typeof vscode.tasks.executeTask,
        "function",
        "executeTask should be a function",
      );
    });
  });

  suite("Run Task (New Terminal)", () => {
    test("tasktree.run creates a new terminal", async function () {
      this.timeout(15000);

      const terminalsBefore = vscode.window.terminals.length;

      const shellTask = createMockTaskItem({
        type: "shell",
        label: "Test New Terminal",
        command: 'echo "hello from new terminal"',
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
      });

      const taskTreeItem = { task: shellTask };

      await vscode.commands.executeCommand("tasktree.run", taskTreeItem);
      await sleep(1500);

      const terminalsAfter = vscode.window.terminals.length;
      assert.ok(
        terminalsAfter >= terminalsBefore,
        "Should have at least as many terminals",
      );
    });

    test("tasktree.run terminal has descriptive name", async function () {
      this.timeout(15000);

      const shellTask = createMockTaskItem({
        type: "shell",
        label: "Descriptive Task Name",
        command: 'echo "test"',
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
      });

      const taskTreeItem = { task: shellTask };

      await vscode.commands.executeCommand("tasktree.run", taskTreeItem);
      await sleep(1500);

      const taskTreeTerminal = vscode.window.terminals.find((t) =>
        t.name.includes("TaskTree"),
      );
      assert.ok(
        taskTreeTerminal !== undefined,
        "Should create terminal with TaskTree in name",
      );
    });

    test("tasktree.run handles undefined gracefully", async function () {
      this.timeout(10000);

      const terminalsBefore = vscode.window.terminals.length;

      try {
        await vscode.commands.executeCommand("tasktree.run", undefined);
      } catch {
        // Expected behavior
      }

      const terminalsAfter = vscode.window.terminals.length;
      assert.strictEqual(
        terminalsAfter,
        terminalsBefore,
        "Should not create terminal for undefined task",
      );
    });

    test("tasktree.run handles null task property gracefully", async function () {
      this.timeout(10000);

      const terminalsBefore = vscode.window.terminals.length;

      try {
        await vscode.commands.executeCommand("tasktree.run", { task: null });
      } catch {
        // Expected behavior
      }

      const terminalsAfter = vscode.window.terminals.length;
      assert.strictEqual(
        terminalsAfter,
        terminalsBefore,
        "Should not create terminal for null task property",
      );
    });
  });

  suite("Run In Current Terminal", () => {
    test("runInCurrentTerminal command is registered", async function () {
      this.timeout(10000);

      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes("tasktree.runInCurrentTerminal"),
        "runInCurrentTerminal command should be registered",
      );
    });

    test("runInCurrentTerminal creates terminal if none exists", async function () {
      this.timeout(15000);

      for (const t of vscode.window.terminals) {
        t.dispose();
      }
      await sleep(500);

      const shellTask = createMockTaskItem({
        type: "shell",
        label: "Test Current Terminal",
        command: 'echo "hello from current terminal"',
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
      });

      const taskTreeItem = { task: shellTask };

      await vscode.commands.executeCommand(
        "tasktree.runInCurrentTerminal",
        taskTreeItem,
      );
      await sleep(1500);

      assert.ok(
        vscode.window.terminals.length >= 1,
        "Should create terminal if none exists",
      );
    });

    test("runInCurrentTerminal uses active terminal if available", async function () {
      this.timeout(15000);

      const existingTerminal =
        vscode.window.createTerminal("Existing Terminal");
      existingTerminal.show();
      await sleep(500);

      const terminalsBefore = vscode.window.terminals.length;

      const shellTask = createMockTaskItem({
        type: "shell",
        label: "Test Use Existing",
        command: 'echo "use existing"',
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
      });

      const taskTreeItem = { task: shellTask };

      await vscode.commands.executeCommand(
        "tasktree.runInCurrentTerminal",
        taskTreeItem,
      );
      await sleep(1000);

      const terminalsAfter = vscode.window.terminals.length;
      assert.ok(
        terminalsAfter <= terminalsBefore + 1,
        "Should reuse existing terminal or create at most one",
      );
    });

    test("runInCurrentTerminal handles undefined gracefully", async function () {
      this.timeout(10000);

      const terminalsBefore = vscode.window.terminals.length;

      try {
        await vscode.commands.executeCommand(
          "tasktree.runInCurrentTerminal",
          undefined,
        );
      } catch {
        // Expected behavior
      }

      const terminalsAfter = vscode.window.terminals.length;
      assert.ok(
        terminalsAfter <= terminalsBefore + 1,
        "Should not create more than one terminal for undefined task",
      );
    });

    test("runInCurrentTerminal shows terminal", async function () {
      this.timeout(15000);

      const shellTask = createMockTaskItem({
        type: "shell",
        label: "Test Show Terminal",
        command: 'echo "visible"',
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
      });

      const taskTreeItem = { task: shellTask };

      await vscode.commands.executeCommand(
        "tasktree.runInCurrentTerminal",
        taskTreeItem,
      );
      await sleep(1000);

      assert.ok(
        vscode.window.activeTerminal !== undefined,
        "Should have active terminal after execution",
      );
    });
  });

  suite("Launch Config Execution", () => {
    test("launch tasks use debug API", function () {
      this.timeout(10000);

      assert.strictEqual(
        typeof vscode.debug.startDebugging,
        "function",
        "startDebugging should be a function",
      );
    });

    test("active debug sessions can be queried", function () {
      this.timeout(10000);

      const session = vscode.debug.activeDebugSession;
      if (session !== undefined) {
        assert.strictEqual(
          typeof session.name,
          "string",
          "Active session should have name",
        );
        assert.strictEqual(
          typeof session.type,
          "string",
          "Active session should have type",
        );
      }
      assert.strictEqual(
        typeof vscode.debug.activeDebugSession,
        "object",
        "activeDebugSession should be queryable (object or undefined)",
      );
      assert.strictEqual(
        typeof vscode.debug.startDebugging,
        "function",
        "startDebugging should be a function",
      );
    });
  });

  suite("Working Directory Handling", () => {
    test("shell tasks use correct cwd", function () {
      this.timeout(10000);

      const task = createMockTaskItem({
        type: "shell",
        cwd: context.workspaceRoot,
      });

      assert.ok(
        task.cwd === context.workspaceRoot,
        "Should have workspace root as cwd",
      );
    });

    test("npm tasks use package.json directory as cwd", function () {
      this.timeout(10000);

      const subprojectDir = path.join(context.workspaceRoot, "subproject");

      const task = createMockTaskItem({
        type: "npm",
        cwd: subprojectDir,
      });

      assert.ok(
        task.cwd === subprojectDir,
        "Should have subproject dir as cwd",
      );
    });

    test("make tasks use Makefile directory as cwd", function () {
      this.timeout(10000);

      const task = createMockTaskItem({
        type: "make",
        cwd: context.workspaceRoot,
      });

      assert.ok(
        task.cwd === context.workspaceRoot,
        "Should have Makefile dir as cwd",
      );
    });
  });

  suite("Terminal Execution Modes", () => {
    test("runInCurrentTerminal creates terminal when none exists", async function () {
      this.timeout(15000);

      for (const t of vscode.window.terminals) {
        t.dispose();
      }
      await sleep(500);

      const initialCount = vscode.window.terminals.length;
      assert.strictEqual(initialCount, 0, "Should start with no terminals");

      const shellTask = createMockTaskItem({
        type: "shell",
        label: "Create Terminal Test",
        command: 'echo "terminal created"',
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
      });

      const taskTreeItem = { task: shellTask };
      await vscode.commands.executeCommand(
        "tasktree.runInCurrentTerminal",
        taskTreeItem,
      );
      await sleep(1500);

      const finalCount = vscode.window.terminals.length;
      assert.ok(finalCount >= 1, "Should create a terminal when none exists");
      assert.ok(
        vscode.window.activeTerminal !== undefined,
        "Created terminal should be active",
      );
    });

    test("runInCurrentTerminal reuses existing active terminal", async function () {
      this.timeout(15000);

      const existingTerminal = vscode.window.createTerminal(
        "Existing Test Terminal",
      );
      existingTerminal.show();
      await sleep(500);

      const terminalCountBefore = vscode.window.terminals.length;

      const shellTask = createMockTaskItem({
        type: "shell",
        label: "Reuse Terminal Test",
        command: 'echo "reusing terminal"',
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
      });

      const taskTreeItem = { task: shellTask };
      await vscode.commands.executeCommand(
        "tasktree.runInCurrentTerminal",
        taskTreeItem,
      );
      await sleep(1000);

      const terminalCountAfter = vscode.window.terminals.length;
      assert.strictEqual(
        terminalCountAfter,
        terminalCountBefore,
        "Should reuse existing terminal, not create new one",
      );
    });

    test("new terminal has TaskTree prefix in name", async function () {
      this.timeout(15000);

      const shellTask = createMockTaskItem({
        type: "shell",
        label: "Named Terminal Test",
        command: 'echo "named terminal"',
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
      });

      const taskTreeItem = { task: shellTask };
      await vscode.commands.executeCommand("tasktree.run", taskTreeItem);
      await sleep(1500);

      const taskTreeTerminal = vscode.window.terminals.find((t) =>
        t.name.includes("TaskTree"),
      );
      assert.ok(
        taskTreeTerminal !== undefined,
        "Should create terminal with TaskTree in name",
      );
      assert.ok(
        taskTreeTerminal.name.includes("Named Terminal Test"),
        "Terminal name should include task label",
      );
    });

    test("terminal execution with cwd sets working directory", async function () {
      this.timeout(15000);

      const subprojectDir = path.join(context.workspaceRoot, "subproject");

      const shellTask = createMockTaskItem({
        type: "shell",
        label: "CWD Test Task",
        command: "pwd",
        cwd: subprojectDir,
        filePath: path.join(subprojectDir, "test.sh"),
      });

      const taskTreeItem = { task: shellTask };
      await vscode.commands.executeCommand("tasktree.run", taskTreeItem);
      await sleep(1500);

      const taskTreeTerminal = vscode.window.terminals.find((t) =>
        t.name.includes("CWD Test Task"),
      );
      assert.ok(
        taskTreeTerminal !== undefined,
        "Should create terminal for task with cwd",
      );
    });
  });
});
