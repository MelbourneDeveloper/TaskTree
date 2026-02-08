/**
 * SPEC: command-execution, quick-launch, filtering
 *
 * Commands E2E Tests
 *
 * E2E Test Rules (from CLAUDE.md):
 *
 * LEGAL actions:
 * - Verifying extension activation state (read-only observation)
 * - Checking command registration via vscode.commands.getCommands()
 * - Verifying package.json structure and configuration
 * - Testing commands that open UI elements (like editTags opening an editor)
 * - Waiting for file watcher with await sleep()
 *
 * ILLEGAL actions - DO NOT USE:
 * - ❌ executeCommand('commandtree.refresh') - refresh should be AUTOMATIC via file watcher
 * - ❌ executeCommand('commandtree.clearFilter') - filter state manipulation
 * - ❌ provider.refresh(), provider.clearFilters()
 * - ❌ assert.ok(true, ...) - FAKE TESTS ARE ILLEGAL
 * - ❌ Any command that manipulates internal state without UI interaction
 */

import * as assert from "assert";
import * as vscode from "vscode";
import * as fs from "fs";
import {
  activateExtension,
  sleep,
  getExtensionPath,
  EXTENSION_ID,
} from "../helpers/helpers";

interface ViewDefinition {
  id: string;
  name: string;
  icon?: string;
  contextualTitle?: string;
}

interface MenuItemDefinition {
  command: string;
  when?: string;
}

interface CommandDefinition {
  command: string;
  title: string;
  icon?: string;
}

interface PackageJson {
  name: string;
  displayName: string;
  description: string;
  version: string;
  publisher: string;
  main: string;
  engines: {
    vscode: string;
  };
  activationEvents?: string[];
  contributes: {
    views: {
      "commandtree-container": ViewDefinition[];
    };
    commands: CommandDefinition[];
    menus: {
      "view/title": MenuItemDefinition[];
      "view/item/context": MenuItemDefinition[];
    };
  };
}

function readPackageJson(): PackageJson {
  const content = fs.readFileSync(getExtensionPath("package.json"), "utf8");
  return JSON.parse(content) as PackageJson;
}

suite("Commands and UI E2E Tests", () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await activateExtension();
    // Wait for initial load via file watcher - no refresh command
    await sleep(3000);
  });

  // Spec: overview
  suite("Extension Activation", () => {
    test("extension is present", function () {
      this.timeout(10000);

      const extension = vscode.extensions.getExtension(EXTENSION_ID);
      assert.ok(extension, `Extension ${EXTENSION_ID} should be installed`);
    });

    test("extension activates successfully", function () {
      this.timeout(10000);

      const extension = vscode.extensions.getExtension(EXTENSION_ID);
      assert.ok(extension, "Extension should exist");
      assert.ok(extension.isActive, "Extension should be active");
    });

    test("extension activates on view visibility", function () {
      this.timeout(10000);

      const extension = vscode.extensions.getExtension(EXTENSION_ID);
      assert.ok(extension, "Extension should exist");

      const packageJson = readPackageJson();

      const hasActivationEvent =
        packageJson.activationEvents?.includes("onView:commandtree") ?? false;
      const hasViewContribution = packageJson.contributes.views[
        "commandtree-container"
      ].some((v: ViewDefinition) => v.id === "commandtree");

      assert.ok(
        hasActivationEvent || hasViewContribution,
        "Should activate on view (via activationEvents or view contribution)",
      );
    });
  });

  // TODO: No corresponding section in spec
  suite("Command Registration", () => {
    test("all commands are registered", async function () {
      this.timeout(10000);

      const commands = await vscode.commands.getCommands(true);

      const expectedCommands = [
        "commandtree.refresh",
        "commandtree.run",
        "commandtree.filterByTag",
        "commandtree.clearFilter",
        "commandtree.semanticSearch",
      ];

      for (const cmd of expectedCommands) {
        assert.ok(
          commands.includes(cmd),
          `Command ${cmd} should be registered`,
        );
      }
    });

    // NOTE: Tests for executing refresh/clearFilter commands removed
    // These commands should be triggered through UI interaction, not direct calls
    // Testing them via executeCommand masks bugs in the file watcher auto-refresh
  });

  // TODO: No corresponding section in spec
  suite("Tree View Registration", () => {
    test("tree view is registered in custom container", function () {
      this.timeout(10000);

      const packageJson = readPackageJson();

      const containerViews =
        packageJson.contributes.views["commandtree-container"];
      assert.ok(containerViews.length > 0, "Should have container views");

      const taskTreeView = containerViews.find(
        (v: ViewDefinition) => v.id === "commandtree",
      );
      assert.ok(taskTreeView, "commandtree view should be registered");
      assert.strictEqual(
        taskTreeView.name,
        "CommandTree - All",
        "View name should be CommandTree - All",
      );
    });

    test("tree view has correct configuration", function () {
      this.timeout(10000);

      const packageJson = readPackageJson();

      const taskTreeView = packageJson.contributes.views[
        "commandtree-container"
      ].find((v: ViewDefinition) => v.id === "commandtree");

      assert.ok(taskTreeView, "Should have commandtree view");
      assert.ok(
        taskTreeView.contextualTitle !== undefined &&
          taskTreeView.contextualTitle !== "",
        "View should have contextual title",
      );
    });
  });

  // TODO: No corresponding section in spec
  suite("Menu Contributions", () => {
    test("view title menu has correct commands", function () {
      this.timeout(10000);

      const packageJson = readPackageJson();

      const viewTitleMenus = packageJson.contributes.menus["view/title"];
      assert.ok(viewTitleMenus.length > 0, "Should have view/title menus");

      const taskTreeMenus = viewTitleMenus.filter(
        (m) => m.when?.includes("view == commandtree") === true,
      );

      assert.ok(taskTreeMenus.length >= 4, "Should have at least 4 menu items");

      const commands = taskTreeMenus.map((m) => m.command);
      assert.ok(
        commands.includes("commandtree.filterByTag"),
        "Should have filterByTag in menu",
      );
      assert.ok(
        commands.includes("commandtree.semanticSearch"),
        "Should have semanticSearch in menu",
      );
      assert.ok(
        commands.includes("commandtree.clearFilter"),
        "Should have clearFilter in menu",
      );
      assert.ok(
        commands.includes("commandtree.refresh"),
        "Should have refresh in menu",
      );
    });

    test("context menu has run command for tasks", function () {
      this.timeout(10000);

      const packageJson = readPackageJson();

      const itemContextMenus =
        packageJson.contributes.menus["view/item/context"];
      assert.ok(
        itemContextMenus.length > 0,
        "Should have view/item/context menus",
      );

      const runMenu = itemContextMenus.find(
        (m) => m.command === "commandtree.run",
      );
      assert.ok(runMenu, "Should have run command in context menu");
      assert.ok(
        runMenu.when?.includes("viewItem == task") === true,
        "Run should only show for tasks",
      );

      // Star icon: addToQuick (empty star) for non-quick commands
      const addToQuickMenu = itemContextMenus.find(
        (m) =>
          m.command === "commandtree.addToQuick" &&
          m.when?.includes("view == commandtree") === true &&
          m.when.includes("viewItem == task"),
      );
      assert.ok(
        addToQuickMenu,
        "addToQuick (empty star) MUST show for non-quick commands in All Commands view",
      );

      // Star icon: removeFromQuick (filled star) for quick commands
      const removeFromQuickInAllView = itemContextMenus.find(
        (m) =>
          m.command === "commandtree.removeFromQuick" &&
          m.when?.includes("view == commandtree") === true &&
          m.when.includes("viewItem == task-quick"),
      );
      assert.ok(
        removeFromQuickInAllView,
        "removeFromQuick (filled star) MUST show for quick commands in All Commands view",
      );
    });

    test("clearFilter only visible when filter is active", function () {
      this.timeout(10000);

      const packageJson = readPackageJson();

      const viewTitleMenus = packageJson.contributes.menus["view/title"];
      const clearFilterMenu = viewTitleMenus.find(
        (m) => m.command === "commandtree.clearFilter",
      );

      assert.ok(clearFilterMenu, "Should have clearFilter menu");
      assert.ok(
        clearFilterMenu.when?.includes("commandtree.hasFilter") === true,
        "clearFilter should require hasFilter context",
      );
    });

    test("no duplicate commands in commandtree view/title menu", function () {
      this.timeout(10000);

      const packageJson = readPackageJson();

      const viewTitleMenus = packageJson.contributes.menus["view/title"];
      const taskTreeMenus = viewTitleMenus.filter(
        (m) =>
          m.when?.includes("view == commandtree") === true &&
          !m.when.includes("commandtree-quick"),
      );

      const commands = taskTreeMenus.map((m) => m.command);
      const uniqueCommands = new Set(commands);

      assert.strictEqual(
        commands.length,
        uniqueCommands.size,
        `Duplicate commands in commandtree view/title: ${commands.filter((c, i) => commands.indexOf(c) !== i).join(", ")}`,
      );
    });

    test("no duplicate commands in commandtree-quick view/title menu", function () {
      this.timeout(10000);

      const packageJson = readPackageJson();

      const viewTitleMenus = packageJson.contributes.menus["view/title"];
      const quickMenus = viewTitleMenus.filter(
        (m) => m.when?.includes("view == commandtree-quick") === true,
      );

      const commands = quickMenus.map((m) => m.command);
      const uniqueCommands = new Set(commands);

      assert.strictEqual(
        commands.length,
        uniqueCommands.size,
        `Duplicate commands in commandtree-quick view/title: ${commands.filter((c, i) => commands.indexOf(c) !== i).join(", ")}`,
      );
    });

    test("commandtree view has exactly 4 title bar icons", function () {
      this.timeout(10000);

      const packageJson = readPackageJson();

      const viewTitleMenus = packageJson.contributes.menus["view/title"];
      const taskTreeMenus = viewTitleMenus.filter(
        (m) =>
          m.when?.includes("view == commandtree") === true &&
          !m.when.includes("commandtree-quick"),
      );

      assert.strictEqual(
        taskTreeMenus.length,
        4,
        `Expected exactly 4 view/title items for commandtree, got ${taskTreeMenus.length}: ${taskTreeMenus.map((m) => m.command).join(", ")}`,
      );

      const expectedCommands = [
        "commandtree.filterByTag",
        "commandtree.clearFilter",
        "commandtree.semanticSearch",
        "commandtree.refresh",
      ];
      for (const cmd of expectedCommands) {
        assert.ok(
          taskTreeMenus.some((m) => m.command === cmd),
          `Missing expected command: ${cmd}`,
        );
      }
    });

    test("commandtree-quick view has exactly 3 title bar icons", function () {
      this.timeout(10000);

      const packageJson = readPackageJson();

      const viewTitleMenus = packageJson.contributes.menus["view/title"];
      const quickMenus = viewTitleMenus.filter(
        (m) => m.when?.includes("view == commandtree-quick") === true,
      );

      assert.strictEqual(
        quickMenus.length,
        3,
        `Expected exactly 3 view/title items for commandtree-quick, got ${quickMenus.length}: ${quickMenus.map((m) => m.command).join(", ")}`,
      );

      const expectedCommands = [
        "commandtree.filterByTag",
        "commandtree.clearFilter",
        "commandtree.refreshQuick",
      ];
      for (const cmd of expectedCommands) {
        assert.ok(
          quickMenus.some((m) => m.command === cmd),
          `Missing expected command: ${cmd}`,
        );
      }
    });
  });

  // TODO: No corresponding section in spec
  suite("Command Icons", () => {
    test("commands have appropriate icons", function () {
      this.timeout(10000);

      const packageJson = readPackageJson();

      const commands = packageJson.contributes.commands;

      const refreshCmd = commands.find((c) => c.command === "commandtree.refresh");
      assert.ok(
        refreshCmd?.icon === "$(refresh)",
        "Refresh should have refresh icon",
      );

      const runCmd = commands.find((c) => c.command === "commandtree.run");
      assert.ok(runCmd?.icon === "$(play)", "Run should have play icon");

      const semanticSearchCmd = commands.find((c) => c.command === "commandtree.semanticSearch");
      assert.ok(
        semanticSearchCmd?.icon === "$(search)",
        "SemanticSearch should have search icon",
      );

      const tagFilterCmd = commands.find(
        (c) => c.command === "commandtree.filterByTag",
      );
      assert.ok(
        tagFilterCmd?.icon === "$(tag)",
        "FilterByTag should have tag icon",
      );

      const clearFilterCmd = commands.find(
        (c) => c.command === "commandtree.clearFilter",
      );
      assert.ok(
        clearFilterCmd?.icon === "$(clear-all)",
        "ClearFilter should have clear-all icon",
      );

      // Star icons: empty for add, filled for remove
      const addToQuickCmd = commands.find(
        (c) => c.command === "commandtree.addToQuick",
      );
      assert.strictEqual(
        addToQuickCmd?.icon,
        "$(star-empty)",
        "addToQuick MUST have star-empty icon (unfilled star)",
      );

      const removeFromQuickCmd = commands.find(
        (c) => c.command === "commandtree.removeFromQuick",
      );
      assert.strictEqual(
        removeFromQuickCmd?.icon,
        "$(star-full)",
        "removeFromQuick MUST have star-full icon (filled star)",
      );
    });
  });

  // NOTE: Tree Item Display, Status Bar, and Context Management tests removed
  // They had fake assertions (assert.ok(true, ...)) which is ILLEGAL per CLAUDE.md
  // Proper tests for these behaviors would require observing actual UI state

  // TODO: No corresponding section in spec
  suite("Extension Package Configuration", () => {
    test("package.json has correct metadata", function () {
      this.timeout(10000);

      const packageJson = readPackageJson();

      assert.strictEqual(
        packageJson.name,
        "commandtree",
        "Name should be commandtree",
      );
      assert.strictEqual(
        packageJson.displayName,
        "CommandTree",
        "Display name should be CommandTree",
      );
      assert.ok(packageJson.description !== "", "Should have description");
      assert.ok(packageJson.version !== "", "Should have version");
      assert.ok(packageJson.publisher !== "", "Should have publisher");
    });

    test("package.json has correct engine requirement", function () {
      this.timeout(10000);

      const packageJson = readPackageJson();

      assert.ok(
        packageJson.engines.vscode !== "",
        "Should have vscode engine requirement",
      );
      assert.ok(
        packageJson.engines.vscode.startsWith("^1."),
        "Should require VS Code 1.x",
      );
    });

    test("package.json has main entry point", function () {
      this.timeout(10000);

      const packageJson = readPackageJson();

      assert.strictEqual(
        packageJson.main,
        "./out/extension.js",
        "Main should point to compiled extension",
      );
    });
  });

  // TODO: No corresponding section in spec
  suite("View Container", () => {
    test("views are in custom container", function () {
      this.timeout(10000);

      const packageJson = readPackageJson();

      assert.ok(
        packageJson.contributes.views["commandtree-container"].length > 0,
        "Views should be in commandtree-container",
      );
    });
  });

  // TODO: No corresponding section in spec
  suite("Workspace Trust", () => {
    test("extension works in trusted workspace", function () {
      this.timeout(10000);

      const extension = vscode.extensions.getExtension(EXTENSION_ID);
      assert.ok(extension?.isActive === true, "Extension should be active");
    });
  });

  // NOTE: The following test suites were removed because they contained ILLEGAL patterns:
  // - Error Handling UI: Called executeCommand('commandtree.refresh') and used fake assertions
  // - Tag Commands Integration: Called commands directly with fake assertions
  // - Quick Launch Commands Integration: Called commands directly with fake assertions
  // - Run Commands Integration: Called commands directly with fake assertions
  // - Filter Context Behavior: Called executeCommand('commandtree.clearFilter') with fake assertions
  //
  // These behaviors should be tested through UI interaction, not direct command execution.
  // Tests with assert.ok(true, ...) are explicitly ILLEGAL per CLAUDE.md.
});
