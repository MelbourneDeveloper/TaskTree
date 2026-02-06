/**
 * Spec: tagging/config-file, tagging/pattern-syntax, quick-tasks, user-data-storage
 * INTEGRATION TESTS: Tag Config -> Task Tagging -> View Display
 *
 * These tests verify the FULL FLOW from config file to actual view state.
 * They catch bugs where:
 * - Config loads but tags don't apply
 * - Tags apply but filtering doesn't work
 * - Quick tasks config exists but tasks don't show
 *
 * ⛔️⛔️⛔️ E2E TEST RULES ⛔️⛔️⛔️
 *
 * LEGAL:
 * ✅ Writing to config files (simulates user editing .vscode/tasktree.json)
 * ✅ Waiting for file watcher with await sleep()
 * ✅ Observing state via getChildren() / getAllTasks() (read-only)
 *
 * ILLEGAL:
 * ❌ vscode.commands.executeCommand('tasktree.refresh') - refresh should be AUTOMATIC
 * ❌ provider.refresh() - internal method
 * ❌ provider.clearFilters() - internal method
 * ❌ provider.setTagFilter() - internal method
 * ❌ quickProvider.addToQuick() - internal method
 * ❌ quickProvider.removeFromQuick() - internal method
 *
 * The file watcher MUST auto-sync when config files change. If tests fail,
 * it proves the file watcher bug exists!
 */

import * as assert from "assert";
import * as fs from "fs";
import {
  activateExtension,
  sleep,
  getFixturePath,
  getTaskTreeProvider,
  getQuickTasksProvider,
} from "../helpers/helpers";
import type { TaskTreeProvider, QuickTasksProvider } from "../helpers/helpers";

interface TagPattern {
  id?: string;
  type?: string;
  label?: string;
}

interface TaskTreeConfig {
  tags?: Record<string, Array<string | TagPattern>>;
}

function writeConfig(config: TaskTreeConfig): void {
  const configPath = getFixturePath(".vscode/tasktree.json");
  fs.writeFileSync(configPath, JSON.stringify(config, null, 4));
}

// Spec: tagging/config-file, tagging/pattern-syntax, quick-tasks
suite("Tag Config Integration Tests", () => {
  let originalConfig: string;
  let treeProvider: TaskTreeProvider;
  let quickProvider: QuickTasksProvider;

  suiteSetup(async function () {
    this.timeout(30000);
    await activateExtension();
    treeProvider = getTaskTreeProvider();
    quickProvider = getQuickTasksProvider();

    // Save original config for restoration
    const configPath = getFixturePath(".vscode/tasktree.json");
    if (fs.existsSync(configPath)) {
      originalConfig = fs.readFileSync(configPath, "utf8");
    } else {
      originalConfig = JSON.stringify({ tags: {} }, null, 4);
    }

    // Wait for initial load
    await sleep(2000);
  });

  suiteTeardown(async function () {
    this.timeout(10000);
    // Restore original config - file watcher should auto-sync
    fs.writeFileSync(getFixturePath(".vscode/tasktree.json"), originalConfig);
    await sleep(3000);
  });

  /**
   * INTEGRATION: Config Loading -> Tag Application
   *
   * These tests verify that writing tag patterns to config causes
   * tags to be automatically applied to matching tasks via file watcher.
   */
  // Spec: tagging/config-file, tagging/pattern-syntax
  suite("Config Loading -> Tag Application", () => {
    test("INTEGRATION: Structured {type} pattern applies tag to ALL tasks of that type", async function () {
      this.timeout(30000);

      // SETUP: Write config with type pattern
      const config: TaskTreeConfig = {
        tags: {
          "test-type-tag": [{ type: "npm" }],
        },
      };
      writeConfig(config);

      // WAIT: File watcher should auto-sync
      await sleep(3000);

      // VERIFY: Get ALL tasks and check tag application
      const allTasks = treeProvider.getAllTasks();
      const npmTasks = allTasks.filter((t) => t.type === "npm");
      const taggedTasks = allTasks.filter((t) =>
        t.tags.includes("test-type-tag"),
      );

      // ASSERTIONS: Must have npm tasks
      assert.ok(npmTasks.length > 0, "Fixture MUST have npm tasks");

      // CRITICAL: Every npm task MUST have the tag
      for (const task of npmTasks) {
        assert.ok(
          task.tags.includes("test-type-tag"),
          `INTEGRATION FAILED: npm task "${task.label}" (ID: ${task.id}) ` +
            `does NOT have tag "test-type-tag" even though config has { type: 'npm' } pattern! ` +
            `Task tags: [${task.tags.join(", ")}]. ` +
            `This likely means the file watcher did NOT auto-sync after config change!`,
        );
      }

      // CRITICAL: ONLY npm tasks should have the tag
      for (const task of taggedTasks) {
        assert.strictEqual(
          task.type,
          "npm",
          `INTEGRATION FAILED: Task "${task.label}" has tag "test-type-tag" but ` +
            `is type "${task.type}", not "npm"!`,
        );
      }

      // Count check
      assert.strictEqual(
        taggedTasks.length,
        npmTasks.length,
        `Tag was applied to ${taggedTasks.length} tasks but there are ${npmTasks.length} npm tasks`,
      );
    });

    test("INTEGRATION: Structured {type, label} pattern applies tag to SPECIFIC tasks", async function () {
      this.timeout(30000);

      // SETUP: Write config with type+label pattern
      const config: TaskTreeConfig = {
        tags: {
          "specific-tag": [{ type: "npm", label: "build" }],
        },
      };
      writeConfig(config);

      // WAIT: File watcher should auto-sync
      await sleep(3000);

      // VERIFY
      const allTasks = treeProvider.getAllTasks();
      const expectedTasks = allTasks.filter(
        (t) => t.type === "npm" && t.label === "build",
      );
      const taggedTasks = allTasks.filter((t) =>
        t.tags.includes("specific-tag"),
      );

      assert.ok(expectedTasks.length > 0, "Fixture MUST have npm:build task");

      // CRITICAL: Only npm tasks with label 'build' should have tag
      for (const task of taggedTasks) {
        assert.strictEqual(
          task.type,
          "npm",
          `Tagged task "${task.label}" must be type npm`,
        );
        assert.strictEqual(
          task.label,
          "build",
          `Tagged task must have label "build"`,
        );
      }

      assert.strictEqual(
        taggedTasks.length,
        expectedTasks.length,
        "Tag count must match expected",
      );
    });

    test("INTEGRATION: Exact ID string pattern applies tag to ONE specific task", async function () {
      this.timeout(30000);

      // First get a real task ID (observation only)
      const allTasks = treeProvider.getAllTasks();
      assert.ok(allTasks.length > 0, "Must have tasks");

      const targetTask = allTasks[0];
      assert.ok(targetTask !== undefined, "First task must exist");

      // SETUP: Write config with exact ID
      const config: TaskTreeConfig = {
        tags: {
          "exact-id-tag": [targetTask.id],
        },
      };
      writeConfig(config);

      // WAIT: File watcher should auto-sync
      await sleep(3000);

      // VERIFY
      const refreshedTasks = treeProvider.getAllTasks();
      const taggedTasks = refreshedTasks.filter((t) =>
        t.tags.includes("exact-id-tag"),
      );

      // CRITICAL: Exactly ONE task should have tag
      assert.strictEqual(
        taggedTasks.length,
        1,
        `Exact ID pattern should match exactly 1 task, got ${taggedTasks.length}. ` +
          `File watcher may not have auto-synced!`,
      );

      const taggedTask = taggedTasks[0];
      assert.ok(taggedTask !== undefined, "Tagged task must exist");
      assert.strictEqual(
        taggedTask.id,
        targetTask.id,
        "Must be the correct task",
      );
    });

    test("INTEGRATION: {label} only pattern applies tag to ALL tasks with that label", async function () {
      this.timeout(30000);

      // SETUP: Write config with label-only pattern
      const config: TaskTreeConfig = {
        tags: {
          "label-only-tag": [{ label: "build" }],
        },
      };
      writeConfig(config);

      // WAIT: File watcher should auto-sync
      await sleep(3000);

      // VERIFY
      const allTasks = treeProvider.getAllTasks();
      const buildLabelTasks = allTasks.filter((t) => t.label === "build");
      const taggedTasks = allTasks.filter((t) =>
        t.tags.includes("label-only-tag"),
      );

      assert.ok(
        buildLabelTasks.length > 0,
        'Fixture MUST have tasks with label "build"',
      );

      // CRITICAL: All 'build' label tasks should have tag
      for (const task of buildLabelTasks) {
        assert.ok(
          task.tags.includes("label-only-tag"),
          `Task "${task.label}" (type: ${task.type}) has label "build" but ` +
            `does NOT have tag! Tags: [${task.tags.join(", ")}]. ` +
            `File watcher may not have auto-synced!`,
        );
      }

      // CRITICAL: Only 'build' label tasks should have tag
      for (const task of taggedTasks) {
        assert.strictEqual(
          task.label,
          "build",
          `Task with label "${task.label}" has tag but label is not "build"`,
        );
      }
    });
  });

  /**
   * INTEGRATION: Quick Tag -> QuickTasksProvider Display
   *
   * These tests verify that writing to the "quick" tag in config
   * causes tasks to automatically appear in QuickTasksProvider.
   */
  // Spec: quick-tasks, user-data-storage
  suite("Quick Tag -> QuickTasksProvider Display", () => {
    test('INTEGRATION: Task with "quick" tag in config APPEARS in QuickTasksProvider', async function () {
      this.timeout(30000);

      // First get a real task (observation only)
      const allTasks = treeProvider.getAllTasks();
      assert.ok(allTasks.length > 0, "Must have tasks");

      const targetTask = allTasks[0];
      assert.ok(targetTask !== undefined, "First task must exist");

      // SETUP: Write config with task ID in quick tag
      const config: TaskTreeConfig = {
        tags: {
          quick: [targetTask.id],
        },
      };
      writeConfig(config);

      // WAIT: File watcher should auto-sync BOTH providers
      await sleep(3000);

      // GET QUICK TASKS VIEW (observation only)
      const quickChildren = quickProvider.getChildren(undefined);

      // CRITICAL: Task must appear in quick tasks
      const taskInQuick = quickChildren.find(
        (c) => c.task?.id === targetTask.id,
      );

      assert.ok(
        taskInQuick !== undefined,
        `INTEGRATION FAILED: Config has quick: ["${targetTask.id}"] but task ` +
          `"${targetTask.label}" does NOT appear in QuickTasksProvider! ` +
          `Quick view contains: [${quickChildren.map((c) => c.task?.id ?? "placeholder").join(", ")}]. ` +
          `File watcher may not have auto-synced!`,
      );
    });

    test("INTEGRATION: Structured {type} pattern in quick tag shows ALL matching tasks", async function () {
      this.timeout(30000);

      // SETUP: Write config with type pattern in quick
      const config: TaskTreeConfig = {
        tags: {
          quick: [{ type: "shell" }],
        },
      };
      writeConfig(config);

      // WAIT: File watcher should auto-sync
      await sleep(3000);

      // GET QUICK TASKS (observation only)
      const quickChildren = quickProvider.getChildren(undefined);
      const quickTasks = quickChildren.filter((c) => c.task !== null);

      // Get expected shell tasks (observation only)
      const allTasks = treeProvider.getAllTasks();
      const shellTasks = allTasks.filter((t) => t.type === "shell");

      assert.ok(shellTasks.length > 0, "Must have shell tasks");

      // CRITICAL: All shell tasks should be in quick view
      assert.strictEqual(
        quickTasks.length,
        shellTasks.length,
        `Quick view shows ${quickTasks.length} tasks but there are ${shellTasks.length} shell tasks. ` +
          `File watcher may not have auto-synced!`,
      );

      for (const task of shellTasks) {
        const inQuick = quickTasks.find((q) => q.task?.id === task.id);
        assert.ok(
          inQuick !== undefined,
          `INTEGRATION FAILED: Shell task "${task.label}" not in quick view ` +
            `even though config has quick: [{ type: 'shell' }]`,
        );
      }
    });

    test("INTEGRATION: Empty quick tag shows placeholder", async function () {
      this.timeout(20000);

      // SETUP: Write config with empty quick tag
      const config: TaskTreeConfig = {
        tags: {
          quick: [],
        },
      };
      writeConfig(config);

      // WAIT: File watcher should auto-sync
      await sleep(3000);

      // GET QUICK TASKS (observation only)
      const quickChildren = quickProvider.getChildren(undefined);

      // CRITICAL: Should show placeholder
      assert.strictEqual(
        quickChildren.length,
        1,
        "Should have exactly one placeholder",
      );
      const placeholder = quickChildren[0];
      assert.ok(placeholder !== undefined, "Placeholder must exist");
      assert.ok(placeholder.task === null, "Placeholder must have null task");
    });

    test("INTEGRATION: Writing task ID to quick config makes it appear in QuickTasksProvider", async function () {
      this.timeout(30000);

      // Clear quick tasks first by writing empty config
      writeConfig({ tags: { quick: [] } });
      await sleep(3000);

      // Verify empty/placeholder (observation only)
      let quickChildren = quickProvider.getChildren(undefined);
      const hasPlaceholder = quickChildren.some((c) => c.task === null);
      assert.ok(
        hasPlaceholder || quickChildren.length === 0,
        "Quick view should be empty/placeholder before adding",
      );

      // Get a task to add (observation only)
      const allTasks = treeProvider.getAllTasks();
      const taskToAdd = allTasks[0];
      assert.ok(taskToAdd !== undefined, "Must have task to add");

      // WRITE TO CONFIG (simulates user editing config file)
      const config: TaskTreeConfig = {
        tags: {
          quick: [taskToAdd.id],
        },
      };
      writeConfig(config);

      // WAIT: File watcher should auto-sync
      await sleep(3000);

      // GET QUICK TASKS AGAIN (observation only)
      quickChildren = quickProvider.getChildren(undefined);

      // CRITICAL: Task must appear
      const addedTask = quickChildren.find((c) => c.task?.id === taskToAdd.id);
      assert.ok(
        addedTask !== undefined,
        `INTEGRATION FAILED: Wrote "${taskToAdd.id}" to quick config but task ` +
          `does NOT appear in QuickTasksProvider! ` +
          `Quick view contains: [${quickChildren.map((c) => c.task?.id ?? "placeholder").join(", ")}]. ` +
          `File watcher may not have auto-synced!`,
      );
    });

    test("INTEGRATION: Removing task ID from quick config makes it disappear", async function () {
      this.timeout(30000);

      // Get a task (observation only)
      const allTasks = treeProvider.getAllTasks();
      const taskToRemove = allTasks[0];
      assert.ok(taskToRemove !== undefined, "Must have task");

      // Setup: Add task to quick config
      writeConfig({ tags: { quick: [taskToRemove.id] } });
      await sleep(3000);

      // Verify it's there (observation only)
      let quickChildren = quickProvider.getChildren(undefined);
      let taskInQuick = quickChildren.find(
        (c) => c.task?.id === taskToRemove.id,
      );
      assert.ok(
        taskInQuick !== undefined,
        "Task must be in quick view before removal",
      );

      // WRITE EMPTY CONFIG (simulates user removing from config file)
      writeConfig({ tags: { quick: [] } });

      // WAIT: File watcher should auto-sync
      await sleep(3000);

      // GET QUICK TASKS AGAIN (observation only)
      quickChildren = quickProvider.getChildren(undefined);

      // CRITICAL: Task must NOT appear
      taskInQuick = quickChildren.find((c) => c.task?.id === taskToRemove.id);
      assert.ok(
        taskInQuick === undefined,
        `INTEGRATION FAILED: Removed "${taskToRemove.id}" from quick config but task ` +
          `STILL appears in QuickTasksProvider! File watcher may not have auto-synced!`,
      );
    });
  });

  /**
   * INTEGRATION: Multiple Tags on Same Task
   */
  // Spec: tagging/pattern-syntax
  suite("Multiple Tags on Same Task", () => {
    test("INTEGRATION: Task can have multiple tags from different patterns", async function () {
      this.timeout(30000);

      // SETUP: Write config with multiple patterns that match the same task
      const config: TaskTreeConfig = {
        tags: {
          "tag-by-type": [{ type: "npm" }],
          "tag-by-label": [{ label: "build" }],
          "tag-by-both": [{ type: "npm", label: "build" }],
        },
      };
      writeConfig(config);

      // WAIT: File watcher should auto-sync
      await sleep(3000);

      // VERIFY (observation only)
      const allTasks = treeProvider.getAllTasks();
      const targetTask = allTasks.find(
        (t) => t.type === "npm" && t.label === "build",
      );
      assert.ok(targetTask !== undefined, "npm:build task must exist");

      // CRITICAL: Task should have ALL three tags
      assert.ok(
        targetTask.tags.includes("tag-by-type"),
        `Task missing "tag-by-type" tag. Has: [${targetTask.tags.join(", ")}]. ` +
          `File watcher may not have auto-synced!`,
      );
      assert.ok(
        targetTask.tags.includes("tag-by-label"),
        `Task missing "tag-by-label" tag. Has: [${targetTask.tags.join(", ")}]`,
      );
      assert.ok(
        targetTask.tags.includes("tag-by-both"),
        `Task missing "tag-by-both" tag. Has: [${targetTask.tags.join(", ")}]`,
      );
    });
  });

  /**
   * INTEGRATION: Config File Auto-Watch
   *
   * CRITICAL: These tests verify that the file watcher automatically
   * picks up config changes WITHOUT needing to call refresh!
   */
  // Spec: tagging/config-file
  suite("Config File Auto-Watch", () => {
    test("INTEGRATION: Config edit WITHOUT refresh applies new tags automatically", async function () {
      this.timeout(30000);

      // Start with no tags
      writeConfig({ tags: {} });
      await sleep(3000);

      // Verify no tasks have our test tag (observation only)
      let allTasks = treeProvider.getAllTasks();
      const taggedBefore = allTasks.filter((t) =>
        t.tags.includes("auto-watch-tag"),
      );
      assert.strictEqual(
        taggedBefore.length,
        0,
        "No tasks should have tag before config edit",
      );

      // WRITE NEW CONFIG (simulate user editing file)
      const newConfig: TaskTreeConfig = {
        tags: {
          "auto-watch-tag": [{ type: "npm" }],
        },
      };
      writeConfig(newConfig);

      // WAIT: File watcher should auto-sync - NO REFRESH CALL!
      await sleep(3000);

      // VERIFY: Tasks now have the tag (observation only)
      allTasks = treeProvider.getAllTasks();
      const taggedAfter = allTasks.filter((t) =>
        t.tags.includes("auto-watch-tag"),
      );
      const npmTasks = allTasks.filter((t) => t.type === "npm");

      assert.ok(npmTasks.length > 0, "Must have npm tasks");
      assert.strictEqual(
        taggedAfter.length,
        npmTasks.length,
        `CRITICAL: After config edit (WITHOUT refresh), ${taggedAfter.length} tasks have tag ` +
          `but ${npmTasks.length} npm tasks exist. File watcher is NOT auto-syncing!`,
      );
    });

    test("INTEGRATION: Multiple rapid config changes are handled correctly", async function () {
      this.timeout(40000);

      // Get a task (observation only)
      const allTasks = treeProvider.getAllTasks();
      assert.ok(allTasks.length > 0, "Must have tasks");
      const targetTask = allTasks[0];
      assert.ok(targetTask !== undefined, "First task must exist");

      // Rapid config changes
      writeConfig({ tags: { quick: [] } });
      await sleep(500);
      writeConfig({ tags: { quick: [targetTask.id] } });
      await sleep(500);
      writeConfig({ tags: { quick: [] } });
      await sleep(500);
      writeConfig({ tags: { quick: [targetTask.id] } });

      // Wait for final state to settle
      await sleep(3000);

      // VERIFY final state (observation only)
      const quickChildren = quickProvider.getChildren(undefined);
      const taskInQuick = quickChildren.find(
        (c) => c.task?.id === targetTask.id,
      );

      assert.ok(
        taskInQuick !== undefined,
        `After rapid config changes, task should be in quick view (final config has it). ` +
          `File watcher may not have processed all changes correctly.`,
      );
    });
  });
});
