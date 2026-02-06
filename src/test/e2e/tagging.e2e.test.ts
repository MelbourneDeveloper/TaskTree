/**
 * Spec: tagging/management
 * TAGGING E2E TESTS
 *
 * These tests verify command registration and static file structure only.
 * All tests that call provider methods have been moved to tagging.unit.test.ts
 */

import * as assert from "assert";
import * as vscode from "vscode";
import * as fs from "fs";
import { activateExtension, sleep, getExtensionPath } from "../helpers/helpers";

// Spec: tagging/management
suite("Tag Context Menu E2E Tests", () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await activateExtension();
    await sleep(2000);
  });

  // Spec: tagging/management
  suite("Tag Commands Registration", () => {
    test("addTag command is registered", async function () {
      this.timeout(10000);
      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes("commandtree.addTag"),
        "addTag command should be registered",
      );
    });

    test("removeTag command is registered", async function () {
      this.timeout(10000);
      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes("commandtree.removeTag"),
        "removeTag command should be registered",
      );
    });
  });

  // Spec: tagging/management
  suite("Tag UI Integration (Static Checks)", () => {
    test("addTag and removeTag are in view item context menu", function () {
      this.timeout(10000);

      const packageJsonPath = getExtensionPath("package.json");
      const packageJson = JSON.parse(
        fs.readFileSync(packageJsonPath, "utf8"),
      ) as {
        contributes: {
          menus: {
            "view/item/context": Array<{
              command: string;
              when: string;
              group: string;
            }>;
          };
        };
      };

      const contextMenus = packageJson.contributes.menus["view/item/context"];

      const addTagMenu = contextMenus.find(
        (m) => m.command === "commandtree.addTag",
      );
      const removeTagMenu = contextMenus.find(
        (m) => m.command === "commandtree.removeTag",
      );

      assert.ok(addTagMenu !== undefined, "addTag should be in context menu");
      assert.ok(
        removeTagMenu !== undefined,
        "removeTag should be in context menu",
      );
      assert.ok(
        addTagMenu.when.includes("viewItem == task"),
        "addTag should only show for tasks",
      );
      assert.ok(
        removeTagMenu.when.includes("viewItem == task"),
        "removeTag should only show for tasks",
      );

      // Tag commands must also work for quick-tagged tasks (task-quick)
      const addTagQuickMenu = contextMenus.find(
        (m) =>
          m.command === "commandtree.addTag" &&
          m.when.includes("viewItem == task-quick"),
      );
      assert.ok(
        addTagQuickMenu !== undefined,
        "addTag MUST also show for quick tasks (task-quick)",
      );

      const removeTagQuickMenu = contextMenus.find(
        (m) =>
          m.command === "commandtree.removeTag" &&
          m.when.includes("viewItem == task-quick"),
      );
      assert.ok(
        removeTagQuickMenu !== undefined,
        "removeTag MUST also show for quick tasks (task-quick)",
      );
    });

    test("tag commands are in 3_tagging group", function () {
      this.timeout(10000);

      const packageJsonPath = getExtensionPath("package.json");
      const packageJson = JSON.parse(
        fs.readFileSync(packageJsonPath, "utf8"),
      ) as {
        contributes: {
          menus: {
            "view/item/context": Array<{
              command: string;
              group: string;
            }>;
          };
        };
      };

      const contextMenus = packageJson.contributes.menus["view/item/context"];

      const addTagMenu = contextMenus.find(
        (m) => m.command === "commandtree.addTag",
      );
      const removeTagMenu = contextMenus.find(
        (m) => m.command === "commandtree.removeTag",
      );

      assert.ok(addTagMenu !== undefined, "addTag should be in context menu");
      assert.ok(
        addTagMenu.group.startsWith("3_tagging"),
        "addTag should be in tagging group",
      );
      assert.ok(
        removeTagMenu !== undefined,
        "removeTag should be in context menu",
      );
      assert.ok(
        removeTagMenu.group.startsWith("3_tagging"),
        "removeTag should be in tagging group",
      );
    });
  });
});
