/**
 * TREEVIEW E2E TESTS
 * TODO: No corresponding section in spec
 *
 * Tests tree view behavior by observing TaskTreeItem properties.
 * Verifies click behavior, item rendering, etc.
 */

import * as assert from "assert";
import {
  activateExtension,
  sleep,
  getTaskTreeProvider,
} from "../helpers/helpers";
import type { TaskTreeItem } from "../../models/TaskItem";

// TODO: No corresponding section in spec
suite("TreeView E2E Tests", () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await activateExtension();
    await sleep(3000);
  });

  /**
   * Finds the first task item (leaf node with a task) in the tree.
   */
  async function findFirstTaskItem(): Promise<TaskTreeItem | undefined> {
    const provider = getTaskTreeProvider();
    const categories = await provider.getChildren();

    for (const category of categories) {
      const children = await provider.getChildren(category);
      for (const child of children) {
        if (child.task !== null) {
          return child;
        }
        // Check nested children (folder nodes)
        const grandChildren = await provider.getChildren(child);
        for (const gc of grandChildren) {
          if (gc.task !== null) {
            return gc;
          }
        }
      }
    }
    return undefined;
  }

  // TODO: No corresponding section in spec
  suite("Click Behavior", () => {
    test("clicking a task item opens the file in editor, NOT runs it", async function () {
      this.timeout(15000);

      const taskItem = await findFirstTaskItem();
      assert.ok(
        taskItem !== undefined,
        "Should find at least one task item in the tree",
      );
      assert.ok(
        taskItem.command !== undefined,
        "Task item should have a click command",
      );
      assert.strictEqual(
        taskItem.command.command,
        "vscode.open",
        "Clicking a task MUST open the file (vscode.open), NOT run it (tasktree.run)",
      );
      // Non-quick task must have 'task' contextValue so the EMPTY star icon shows
      assert.strictEqual(
        taskItem.contextValue,
        "task",
        "Non-quick task MUST have contextValue 'task' (empty star icon)",
      );
    });

    test("click command points to the task file path", async function () {
      this.timeout(15000);

      const taskItem = await findFirstTaskItem();
      assert.ok(taskItem !== undefined, "Should find a task item");
      assert.ok(taskItem.command !== undefined, "Should have click command");

      const args = taskItem.command.arguments;
      assert.ok(
        args !== undefined && args.length > 0,
        "Click command should have arguments (file URI)",
      );

      const uri = args[0] as { fsPath?: string; scheme?: string };
      assert.ok(
        uri.fsPath !== undefined && uri.fsPath !== "",
        "Click command argument should be a file URI with fsPath",
      );
      assert.strictEqual(
        uri.scheme,
        "file",
        "URI scheme should be 'file'",
      );
    });
  });
});
