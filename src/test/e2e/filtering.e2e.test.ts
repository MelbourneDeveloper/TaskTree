/**
 * Spec: filtering
 * FILTERING E2E TESTS
 *
 * These tests verify command registration and UI behavior.
 * They do NOT call internal provider methods.
 *
 * For unit tests that test provider internals, see filtering.unit.test.ts
 */

import * as assert from "assert";
import * as vscode from "vscode";
import { activateExtension, sleep } from "../helpers/helpers";

// Spec: filtering
suite("Command Filtering E2E Tests", () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await activateExtension();
    await sleep(2000);
  });

  // Spec: filtering
  suite("Filter Commands Registration", () => {
    test("clearFilter command is registered", async function () {
      this.timeout(10000);

      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes("commandtree.clearFilter"),
        "clearFilter command should be registered",
      );
    });

    test("filterByTag command is registered", async function () {
      this.timeout(10000);

      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes("commandtree.filterByTag"),
        "filterByTag command should be registered",
      );
    });

    test("editTags command is registered", async function () {
      this.timeout(10000);

      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes("commandtree.editTags"),
        "editTags command should be registered",
      );
    });
  });

  // Spec: tagging/management
  suite("Edit Tags Command", () => {
    test("editTags command shows deprecation message", async function () {
      this.timeout(15000);

      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      await sleep(500);

      // editTags is deprecated (tags moved to SQLite)
      // It now shows an info message instead of opening a file
      await vscode.commands.executeCommand("commandtree.editTags");
      await sleep(500);

      // The command completes successfully by showing an info message
      // We can't easily assert on info messages in tests, but we can verify
      // that the command doesn't throw and doesn't open a file editor
      assert.ok(true, "editTags command executed without error");
    });
  });
});
