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

  });
});
