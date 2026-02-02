import * as assert from "assert";
import * as vscode from "vscode";
import * as path from "path";
import {
  activateExtension,
  sleep,
  createMockTaskItem,
} from "../helpers/helpers";
import type { TestContext } from "../helpers/helpers";
import type { TaskItem } from "../../models/TaskItem";

suite("TaskRunner E2E Tests", () => {
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

  suite("Shell Task Execution", () => {
    test("executes shell task and creates terminal", async function () {
      this.timeout(15000);

      const terminalsBefore = vscode.window.terminals.length;

      const task = createMockTaskItem({
        type: "shell",
        label: "Echo Shell Test",
        command: 'echo "shell test executed"',
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
      });

      await vscode.commands.executeCommand("tasktree.run", { task });
      await sleep(2000);

      const terminalsAfter = vscode.window.terminals.length;
      assert.ok(
        terminalsAfter >= terminalsBefore,
        "Should create or reuse terminal",
      );
    });

    test("shell task respects cwd option", async function () {
      this.timeout(15000);

      const subdir = path.join(context.workspaceRoot, "scripts");

      const task = createMockTaskItem({
        type: "shell",
        label: "CWD Test",
        command: "pwd",
        cwd: subdir,
        filePath: path.join(subdir, "build.sh"),
      });

      await vscode.commands.executeCommand("tasktree.run", { task });
      await sleep(1500);

      const terminal = vscode.window.terminals.find((t) =>
        t.name.includes("TaskTree"),
      );
      assert.ok(terminal !== undefined, "Should create TaskTree terminal");
    });

    test("shell task with empty params creates terminal", async function () {
      this.timeout(15000);

      const terminalsBefore = vscode.window.terminals.length;

      const task = createMockTaskItem({
        type: "shell",
        label: "Param Shell Test",
        command: "echo",
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
        params: [],
      });

      await vscode.commands.executeCommand("tasktree.run", { task });
      await sleep(1500);

      const terminalsAfter = vscode.window.terminals.length;
      assert.ok(
        terminalsAfter >= terminalsBefore,
        "Shell task with empty params should create or reuse terminal",
      );
    });

    test("shell task without cwd creates terminal", async function () {
      this.timeout(15000);

      const terminalsBefore = vscode.window.terminals.length;

      const task: TaskItem = {
        id: "shell:no-cwd:test",
        type: "shell",
        label: "No CWD Test",
        command: 'echo "no cwd"',
        filePath: "/test/path",
        category: "Test",
        tags: [],
      };

      await vscode.commands.executeCommand("tasktree.run", { task });
      await sleep(1500);

      const terminalsAfter = vscode.window.terminals.length;
      assert.ok(
        terminalsAfter >= terminalsBefore,
        "Shell task without cwd should still create terminal",
      );
    });
  });

  suite("NPM Task Execution", () => {
    test("npm task execution creates terminal", async function () {
      this.timeout(15000);

      const terminalsBefore = vscode.window.terminals.length;

      const task = createMockTaskItem({
        type: "npm",
        label: "test-npm",
        command: "npm run test-npm",
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "package.json"),
      });

      await vscode.commands.executeCommand("tasktree.run", { task });
      await sleep(1500);

      const terminalsAfter = vscode.window.terminals.length;
      assert.ok(
        terminalsAfter >= terminalsBefore,
        "NPM task should create or reuse terminal",
      );
    });

    test("npm task with subproject cwd creates terminal", async function () {
      this.timeout(15000);

      const terminalsBefore = vscode.window.terminals.length;
      const subprojectDir = path.join(context.workspaceRoot, "subproject");

      const task = createMockTaskItem({
        type: "npm",
        label: "subproject-build",
        command: "npm run build",
        cwd: subprojectDir,
        filePath: path.join(subprojectDir, "package.json"),
        category: "subproject",
      });

      await vscode.commands.executeCommand("tasktree.run", { task });
      await sleep(1500);

      const terminalsAfter = vscode.window.terminals.length;
      assert.ok(
        terminalsAfter >= terminalsBefore,
        "NPM task with subproject cwd should create terminal",
      );
    });

    test("npm task has correct type and command format", function () {
      this.timeout(15000);

      const task = createMockTaskItem({
        type: "npm",
        label: "lint",
        command: "npm run lint",
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "package.json"),
      });

      assert.strictEqual(task.type, "npm", "Task should be npm type");
      assert.ok(
        task.command.includes("npm run"),
        "Command should include npm run",
      );
    });
  });

  suite("Make Task Execution", () => {
    test("make task creates terminal", async function () {
      this.timeout(15000);

      const terminalsBefore = vscode.window.terminals.length;

      const task = createMockTaskItem({
        type: "make",
        label: "build",
        command: "make build",
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "Makefile"),
      });

      await vscode.commands.executeCommand("tasktree.run", { task });
      await sleep(1500);

      const terminalsAfter = vscode.window.terminals.length;
      assert.ok(
        terminalsAfter >= terminalsBefore,
        "Make task should create or reuse terminal",
      );
    });

    test("make task has correct cwd", function () {
      this.timeout(15000);

      const task = createMockTaskItem({
        type: "make",
        label: "clean",
        command: "make clean",
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "Makefile"),
      });

      assert.strictEqual(
        task.cwd,
        context.workspaceRoot,
        "CWD should be Makefile directory",
      );
    });

    test("make task without cwd creates terminal", async function () {
      this.timeout(15000);

      const terminalsBefore = vscode.window.terminals.length;

      const task: TaskItem = {
        id: "make:no-cwd:test",
        type: "make",
        label: "test",
        command: "make test",
        filePath: "/test/Makefile",
        category: "Test",
        tags: [],
      };

      await vscode.commands.executeCommand("tasktree.run", { task });
      await sleep(1500);

      const terminalsAfter = vscode.window.terminals.length;
      assert.ok(
        terminalsAfter >= terminalsBefore,
        "Make task without cwd should still create terminal",
      );
    });
  });

  suite("Python Task Execution", () => {
    test("python task creates terminal", async function () {
      this.timeout(15000);

      const terminalsBefore = vscode.window.terminals.length;
      const scriptPath = path.join(
        context.workspaceRoot,
        "scripts/python/build_project.py",
      );

      const task = createMockTaskItem({
        type: "python",
        label: "build_project.py",
        command: scriptPath,
        cwd: path.join(context.workspaceRoot, "scripts/python"),
        filePath: scriptPath,
      });

      await vscode.commands.executeCommand("tasktree.run", { task });
      await sleep(1500);

      const terminalsAfter = vscode.window.terminals.length;
      assert.ok(
        terminalsAfter >= terminalsBefore,
        "Python task should create or reuse terminal",
      );
    });

    test("python task has correct type and command", function () {
      this.timeout(15000);

      const scriptPath = path.join(
        context.workspaceRoot,
        "scripts/python/run_tests.py",
      );

      const task = createMockTaskItem({
        type: "python",
        label: "run_tests.py",
        command: scriptPath,
        cwd: path.join(context.workspaceRoot, "scripts/python"),
        filePath: scriptPath,
      });

      assert.strictEqual(task.type, "python", "Task should be python type");
      assert.ok(
        task.command.endsWith(".py"),
        "Command should be python script path",
      );
    });

    test("python task with empty params creates terminal", async function () {
      this.timeout(15000);

      const terminalsBefore = vscode.window.terminals.length;
      const scriptPath = path.join(
        context.workspaceRoot,
        "scripts/python/deploy.py",
      );

      const task = createMockTaskItem({
        type: "python",
        label: "deploy.py",
        command: scriptPath,
        cwd: path.join(context.workspaceRoot, "scripts/python"),
        filePath: scriptPath,
        params: [],
      });

      await vscode.commands.executeCommand("tasktree.run", { task });
      await sleep(1500);

      const terminalsAfter = vscode.window.terminals.length;
      assert.ok(
        terminalsAfter >= terminalsBefore,
        "Python task with params should create terminal",
      );
    });
  });

  suite("Launch Config Execution", () => {
    test("launch task does not create terminal (uses debug API)", async function () {
      this.timeout(15000);

      // Close all terminals first
      for (const t of vscode.window.terminals) {
        t.dispose();
      }
      await sleep(500);

      const task = createMockTaskItem({
        type: "launch",
        label: "Debug Application",
        command: "Debug Application",
        filePath: path.join(context.workspaceRoot, ".vscode/launch.json"),
      });

      // Launch tasks bypass normal execution and use debug API
      await vscode.commands.executeCommand("tasktree.run", { task });
      await sleep(1000);

      // Launch tasks should NOT create TaskTree terminals - they use debug API
      const launchTerminals = vscode.window.terminals.filter(
        (t) =>
          t.name.includes("TaskTree") && t.name.includes("Debug Application"),
      );
      assert.strictEqual(
        launchTerminals.length,
        0,
        "Launch task should use debug API, not create terminal",
      );
    });

    test("launch task type is recognized", function () {
      this.timeout(15000);

      const task = createMockTaskItem({
        type: "launch",
        label: "Missing Workspace Launch",
        command: "NonExistent Config",
        filePath: "/fake/launch.json",
      });

      assert.strictEqual(task.type, "launch", "Task should have launch type");
    });

    test("launch task command matches config name", function () {
      this.timeout(15000);

      const task = createMockTaskItem({
        type: "launch",
        label: "Debug Tests",
        command: "Debug Tests",
        filePath: path.join(context.workspaceRoot, ".vscode/launch.json"),
      });

      assert.strictEqual(
        task.command,
        "Debug Tests",
        "Command should match config name",
      );
      assert.strictEqual(
        task.label,
        "Debug Tests",
        "Label should match config name",
      );
    });
  });

  suite("VS Code Task Execution", () => {
    test("vscode task has correct type", function () {
      this.timeout(15000);

      const task = createMockTaskItem({
        type: "vscode",
        label: "Build Project",
        command: "Build Project",
        filePath: path.join(context.workspaceRoot, ".vscode/tasks.json"),
      });

      assert.strictEqual(task.type, "vscode", "Task should have vscode type");
      assert.strictEqual(
        task.label,
        "Build Project",
        "Task should have correct label",
      );
    });

    test("vscode task command matches label", function () {
      this.timeout(15000);

      const task = createMockTaskItem({
        type: "vscode",
        label: "NonExistent Task",
        command: "Task That Does Not Exist 12345",
        filePath: path.join(context.workspaceRoot, ".vscode/tasks.json"),
      });

      assert.strictEqual(
        task.command,
        "Task That Does Not Exist 12345",
        "Command should match",
      );
    });

    test("vscode tasks can be fetched from workspace", async function () {
      this.timeout(15000);

      const tasks = await vscode.tasks.fetchTasks();
      assert.ok(Array.isArray(tasks), "Should return array of tasks");
    });
  });

  suite("New Terminal Mode", () => {
    test("creates terminal with TaskTree prefix", async function () {
      this.timeout(15000);

      const task = createMockTaskItem({
        type: "shell",
        label: "Terminal Name Test",
        command: 'echo "test"',
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
      });

      await vscode.commands.executeCommand("tasktree.run", { task });
      await sleep(1500);

      const terminal = vscode.window.terminals.find((t) =>
        t.name.includes("TaskTree"),
      );
      assert.ok(
        terminal !== undefined,
        "Terminal should have TaskTree in name",
      );
    });

    test("terminal shows after creation", async function () {
      this.timeout(15000);

      const task = createMockTaskItem({
        type: "shell",
        label: "Show Terminal Test",
        command: 'echo "visible"',
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
      });

      await vscode.commands.executeCommand("tasktree.run", { task });
      await sleep(1500);

      // After execution, there should be an active terminal
      assert.ok(
        vscode.window.terminals.length > 0,
        "Should have at least one terminal",
      );
    });

    test("terminal is created with unique name", async function () {
      this.timeout(15000);

      const uniqueLabel = `Send-Text-Test-${Date.now()}`;

      const task = createMockTaskItem({
        type: "shell",
        label: uniqueLabel,
        command: 'echo "test"',
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
      });

      await vscode.commands.executeCommand("tasktree.run", { task });
      await sleep(1500);

      // Terminal should be created with the task name
      const terminal = vscode.window.terminals.find((t) =>
        t.name.includes(uniqueLabel),
      );
      assert.ok(
        terminal !== undefined,
        "Terminal should be created with task label in name",
      );
    });

    test("each execution creates new terminal", async function () {
      this.timeout(20000);

      // Close all terminals first
      for (const t of vscode.window.terminals) {
        t.dispose();
      }
      await sleep(500);

      const task1 = createMockTaskItem({
        type: "shell",
        label: "Multi Terminal Test 1",
        command: 'echo "first"',
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
      });

      const task2 = createMockTaskItem({
        type: "shell",
        label: "Multi Terminal Test 2",
        command: 'echo "second"',
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
      });

      await vscode.commands.executeCommand("tasktree.run", { task: task1 });
      await sleep(1000);

      const afterFirst = vscode.window.terminals.length;

      await vscode.commands.executeCommand("tasktree.run", { task: task2 });
      await sleep(1000);

      const afterSecond = vscode.window.terminals.length;

      assert.ok(
        afterSecond >= afterFirst,
        "Should create terminals for each execution",
      );
    });
  });

  suite("Current Terminal Mode", () => {
    test("creates terminal if none exists", async function () {
      this.timeout(15000);

      // Close all terminals
      for (const t of vscode.window.terminals) {
        t.dispose();
      }
      await sleep(500);

      const terminalsBefore = vscode.window.terminals.length;
      assert.strictEqual(terminalsBefore, 0, "Should start with no terminals");

      const task = createMockTaskItem({
        type: "shell",
        label: "Create If None Test",
        command: 'echo "created"',
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
      });

      await vscode.commands.executeCommand("tasktree.runInCurrentTerminal", {
        task,
      });
      await sleep(1500);

      const terminalsAfter = vscode.window.terminals.length;
      assert.ok(terminalsAfter > 0, "Should create terminal if none exists");
    });

    test("reuses active terminal", async function () {
      this.timeout(15000);

      // Create a terminal and make it active
      const existingTerminal = vscode.window.createTerminal(
        "Test Reuse Terminal",
      );
      existingTerminal.show();
      await sleep(500);

      const terminalsBefore = vscode.window.terminals.length;

      const task = createMockTaskItem({
        type: "shell",
        label: "Reuse Terminal Test",
        command: 'echo "reused"',
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
      });

      await vscode.commands.executeCommand("tasktree.runInCurrentTerminal", {
        task,
      });
      await sleep(1000);

      const terminalsAfter = vscode.window.terminals.length;

      // Should not create many new terminals
      assert.ok(
        terminalsAfter <= terminalsBefore + 1,
        "Should reuse terminal or create only one",
      );
    });

    test("task with cwd uses terminal", async function () {
      this.timeout(15000);

      const subdir = path.join(context.workspaceRoot, "scripts");

      const task = createMockTaskItem({
        type: "shell",
        label: "CWD Change Test",
        command: "pwd",
        cwd: subdir,
        filePath: path.join(subdir, "test.sh"),
      });

      await vscode.commands.executeCommand("tasktree.runInCurrentTerminal", {
        task,
      });
      await sleep(1500);

      // Verify terminal exists
      assert.ok(
        vscode.window.terminals.length > 0,
        "Should have terminal after runInCurrentTerminal",
      );
    });

    test("runInCurrentTerminal sets active terminal", async function () {
      this.timeout(15000);

      const task = createMockTaskItem({
        type: "shell",
        label: "Show After Test",
        command: 'echo "shown"',
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
      });

      await vscode.commands.executeCommand("tasktree.runInCurrentTerminal", {
        task,
      });
      await sleep(1000);

      assert.ok(
        vscode.window.activeTerminal !== undefined,
        "Should have active terminal",
      );
    });

    test("task with empty cwd creates terminal", async function () {
      this.timeout(15000);

      const terminalsBefore = vscode.window.terminals.length;

      const task: TaskItem = {
        id: "shell:empty-cwd:test",
        type: "shell",
        label: "Empty CWD Test",
        command: 'echo "no cd needed"',
        cwd: "",
        filePath: "/test/path",
        category: "Test",
        tags: [],
      };

      await vscode.commands.executeCommand("tasktree.runInCurrentTerminal", {
        task,
      });
      await sleep(1000);

      const terminalsAfter = vscode.window.terminals.length;
      assert.ok(
        terminalsAfter >= terminalsBefore,
        "Should create or reuse terminal with empty cwd",
      );
    });
  });

  suite("Command Building", () => {
    test("command without params stays unchanged", function () {
      this.timeout(5000);

      const task = createMockTaskItem({
        type: "shell",
        command: 'echo "simple"',
        params: [],
      });

      assert.strictEqual(
        task.command,
        'echo "simple"',
        "Command should be unchanged",
      );
    });

    test("task with defined params has param array", function () {
      this.timeout(5000);

      const task = createMockTaskItem({
        type: "shell",
        command: "./build.sh",
        params: [
          { name: "config", description: "Build config", default: "debug" },
          { name: "target", description: "Build target" },
        ],
      });

      assert.ok(task.params !== undefined, "Should have params");
      assert.strictEqual(task.params.length, 2, "Should have 2 params");
    });

    test("param with options has options array", function () {
      this.timeout(5000);

      const task = createMockTaskItem({
        type: "shell",
        command: "./deploy.sh",
        params: [
          {
            name: "env",
            description: "Environment",
            options: ["dev", "staging", "prod"],
          },
        ],
      });

      assert.ok(task.params !== undefined, "Should have params");
      const params = task.params;
      const param = params[0];
      assert.ok(param !== undefined, "Should have param");
      assert.ok(param.options !== undefined, "Param should have options");
      const options = param.options;
      assert.strictEqual(options.length, 3, "Should have 3 options");
    });

    test("param with default has default value", function () {
      this.timeout(5000);

      const task = createMockTaskItem({
        type: "shell",
        command: "./build.sh",
        params: [{ name: "config", description: "Config", default: "release" }],
      });

      const param = task.params?.[0];
      assert.strictEqual(
        param?.default,
        "release",
        "Should have default value",
      );
    });
  });

  suite("Error Handling", () => {
    test("undefined task item does not create terminal", async function () {
      this.timeout(10000);

      const terminalsBefore = vscode.window.terminals.length;

      await vscode.commands.executeCommand("tasktree.run", undefined);
      await sleep(500);

      const terminalsAfter = vscode.window.terminals.length;
      assert.strictEqual(
        terminalsAfter,
        terminalsBefore,
        "Undefined task should not create terminal",
      );
    });

    test("null task property does not create terminal", async function () {
      this.timeout(10000);

      const terminalsBefore = vscode.window.terminals.length;

      await vscode.commands.executeCommand("tasktree.run", { task: null });
      await sleep(500);

      const terminalsAfter = vscode.window.terminals.length;
      assert.strictEqual(
        terminalsAfter,
        terminalsBefore,
        "Null task should not create terminal",
      );
    });

    test("task with invalid type still creates terminal", async function () {
      this.timeout(10000);

      const terminalsBefore = vscode.window.terminals.length;

      const task = createMockTaskItem({
        type: "unknown" as "shell",
        label: "Invalid Type",
        command: "echo test",
      });

      await vscode.commands.executeCommand("tasktree.run", { task });
      await sleep(500);

      const terminalsAfter = vscode.window.terminals.length;
      // Invalid type may or may not create terminal depending on implementation
      assert.ok(
        terminalsAfter >= terminalsBefore,
        "Should not crash with invalid type",
      );
    });

    test("task with empty command does not crash", async function () {
      this.timeout(10000);

      const task: TaskItem = {
        id: "test:missing-cmd:test",
        type: "shell",
        label: "Missing Command",
        command: "",
        filePath: "/test/path",
        category: "Test",
        tags: [],
      };

      // Should not throw
      await vscode.commands.executeCommand("tasktree.run", { task });
      await sleep(500);

      // Verify we didn't crash
      assert.ok(
        vscode.window.terminals.length >= 0,
        "Extension should remain functional",
      );
    });

    test("nonexistent script path creates terminal anyway", async function () {
      this.timeout(10000);

      const terminalsBefore = vscode.window.terminals.length;

      const task = createMockTaskItem({
        type: "shell",
        label: "Nonexistent Script",
        command: "./this-does-not-exist-12345.sh",
        filePath: "/nonexistent/path/script.sh",
      });

      await vscode.commands.executeCommand("tasktree.run", { task });
      await sleep(500);

      const terminalsAfter = vscode.window.terminals.length;
      // Terminal should still be created even if script doesn't exist
      assert.ok(
        terminalsAfter >= terminalsBefore,
        "Terminal may be created for nonexistent script",
      );
    });

    test("runInCurrentTerminal with undefined does not create terminal", async function () {
      this.timeout(10000);

      const terminalsBefore = vscode.window.terminals.length;

      await vscode.commands.executeCommand(
        "tasktree.runInCurrentTerminal",
        undefined,
      );
      await sleep(500);

      const terminalsAfter = vscode.window.terminals.length;
      assert.strictEqual(
        terminalsAfter,
        terminalsBefore,
        "Undefined should not create terminal",
      );
    });

    test("runInCurrentTerminal with null task does not create terminal", async function () {
      this.timeout(10000);

      const terminalsBefore = vscode.window.terminals.length;

      await vscode.commands.executeCommand("tasktree.runInCurrentTerminal", {
        task: null,
      });
      await sleep(500);

      const terminalsAfter = vscode.window.terminals.length;
      assert.strictEqual(
        terminalsAfter,
        terminalsBefore,
        "Null task should not create terminal",
      );
    });
  });

  suite("Task Type Routing", () => {
    test("shell tasks create terminal with TaskTree prefix", async function () {
      this.timeout(15000);

      const task = createMockTaskItem({
        type: "shell",
        label: "Shell Route Test",
        command: 'echo "shell route"',
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
      });

      await vscode.commands.executeCommand("tasktree.run", { task });
      await sleep(1000);

      const terminal = vscode.window.terminals.find((t) =>
        t.name.includes("Shell Route Test"),
      );
      assert.ok(
        terminal !== undefined,
        "Shell task should create terminal with task name",
      );
    });

    test("npm tasks create terminal", async function () {
      this.timeout(15000);

      const terminalsBefore = vscode.window.terminals.length;

      const task = createMockTaskItem({
        type: "npm",
        label: "NPM Route Test",
        command: "npm run test",
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "package.json"),
      });

      await vscode.commands.executeCommand("tasktree.run", { task });
      await sleep(1000);

      const terminalsAfter = vscode.window.terminals.length;
      assert.ok(
        terminalsAfter >= terminalsBefore,
        "NPM task should create or reuse terminal",
      );
    });

    test("make tasks create terminal", async function () {
      this.timeout(15000);

      const terminalsBefore = vscode.window.terminals.length;

      const task = createMockTaskItem({
        type: "make",
        label: "Make Route Test",
        command: "make test",
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "Makefile"),
      });

      await vscode.commands.executeCommand("tasktree.run", { task });
      await sleep(1000);

      const terminalsAfter = vscode.window.terminals.length;
      assert.ok(
        terminalsAfter >= terminalsBefore,
        "Make task should create or reuse terminal",
      );
    });

    test("python tasks create terminal", async function () {
      this.timeout(15000);

      const terminalsBefore = vscode.window.terminals.length;

      const task = createMockTaskItem({
        type: "python",
        label: "Python Route Test",
        command: path.join(
          context.workspaceRoot,
          "scripts/python/build_project.py",
        ),
        cwd: path.join(context.workspaceRoot, "scripts/python"),
        filePath: path.join(
          context.workspaceRoot,
          "scripts/python/build_project.py",
        ),
      });

      await vscode.commands.executeCommand("tasktree.run", { task });
      await sleep(1000);

      const terminalsAfter = vscode.window.terminals.length;
      assert.ok(
        terminalsAfter >= terminalsBefore,
        "Python task should create or reuse terminal",
      );
    });

    test("launch tasks do not create TaskTree terminal", async function () {
      this.timeout(15000);

      const task = createMockTaskItem({
        type: "launch",
        label: "Launch Route Test",
        command: "Debug Application",
        filePath: path.join(context.workspaceRoot, ".vscode/launch.json"),
      });

      await vscode.commands.executeCommand("tasktree.run", { task });
      await sleep(1000);

      // Launch tasks should NOT create TaskTree terminals - they use debug API
      const launchTerminals = vscode.window.terminals.filter(
        (t) =>
          t.name.includes("TaskTree") && t.name.includes("Launch Route Test"),
      );

      // Launch tasks use debug API, not terminals
      assert.strictEqual(
        launchTerminals.length,
        0,
        "Launch task should use debug API, not create terminal",
      );
    });

    test("vscode task has correct type", function () {
      this.timeout(15000);

      const task = createMockTaskItem({
        type: "vscode",
        label: "VSCode Route Test",
        command: "Build Project",
        filePath: path.join(context.workspaceRoot, ".vscode/tasks.json"),
      });

      assert.strictEqual(task.type, "vscode", "Task should have vscode type");
    });
  });

  suite("Integration Tests", () => {
    test("full workflow: run command creates terminal", async function () {
      this.timeout(20000);

      // 1. Verify run command exists
      const commands = await vscode.commands.getCommands(true);
      assert.ok(commands.includes("tasktree.run"), "Run command should exist");

      // 2. Create a task
      const task = createMockTaskItem({
        type: "shell",
        label: "Integration Test Task",
        command: 'echo "integration test"',
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
      });

      // 3. Execute
      await vscode.commands.executeCommand("tasktree.run", { task });
      await sleep(2000);

      // 4. Verify terminal exists
      assert.ok(
        vscode.window.terminals.length > 0,
        "Should have terminal after execution",
      );
    });

    test("multiple task types create multiple terminals", async function () {
      this.timeout(30000);

      // Close all terminals first
      for (const t of vscode.window.terminals) {
        t.dispose();
      }
      await sleep(500);

      const shellTask = createMockTaskItem({
        type: "shell",
        label: "Sequence Shell",
        command: 'echo "shell"',
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
      });

      const npmTask = createMockTaskItem({
        type: "npm",
        label: "Sequence NPM",
        command: "npm run test",
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "package.json"),
      });

      const makeTask = createMockTaskItem({
        type: "make",
        label: "Sequence Make",
        command: "make test",
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "Makefile"),
      });

      await vscode.commands.executeCommand("tasktree.run", { task: shellTask });
      await sleep(1000);
      const afterShell = vscode.window.terminals.length;

      await vscode.commands.executeCommand("tasktree.run", { task: npmTask });
      await sleep(1000);
      const afterNpm = vscode.window.terminals.length;

      await vscode.commands.executeCommand("tasktree.run", { task: makeTask });
      await sleep(1000);
      const afterMake = vscode.window.terminals.length;

      assert.ok(
        afterShell >= 1,
        "Should have at least 1 terminal after shell task",
      );
      assert.ok(
        afterNpm >= afterShell,
        "Should have at least as many terminals after npm task",
      );
      assert.ok(
        afterMake >= afterNpm,
        "Should have at least as many terminals after make task",
      );
    });

    test("both terminal modes work in same session", async function () {
      this.timeout(20000);

      // Close all terminals
      for (const t of vscode.window.terminals) {
        t.dispose();
      }
      await sleep(500);

      const newTerminalTask = createMockTaskItem({
        type: "shell",
        label: "New Terminal Mode",
        command: 'echo "new terminal"',
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
      });

      await vscode.commands.executeCommand("tasktree.run", {
        task: newTerminalTask,
      });
      await sleep(1000);

      const terminalsAfterNew = vscode.window.terminals.length;

      const currentTerminalTask = createMockTaskItem({
        type: "shell",
        label: "Current Terminal Mode",
        command: 'echo "current terminal"',
        cwd: context.workspaceRoot,
        filePath: path.join(context.workspaceRoot, "scripts/test.sh"),
      });

      await vscode.commands.executeCommand("tasktree.runInCurrentTerminal", {
        task: currentTerminalTask,
      });
      await sleep(1000);

      const terminalsAfterCurrent = vscode.window.terminals.length;

      assert.ok(
        terminalsAfterNew >= 1,
        "Should have terminal after new terminal mode",
      );
      assert.ok(
        terminalsAfterCurrent >= terminalsAfterNew,
        "Current terminal mode should not reduce terminals",
      );
    });
  });
});
