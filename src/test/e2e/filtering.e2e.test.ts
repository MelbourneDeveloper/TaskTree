/**
 * Spec: filtering, tagging/config-file
 * FILTERING E2E TESTS
 *
 * These tests verify command registration, config file structure, and UI behavior.
 * They do NOT call internal provider methods.
 *
 * For unit tests that test provider internals, see filtering.unit.test.ts
 */

import * as assert from "assert";
import * as vscode from "vscode";
import * as fs from "fs";
import { activateExtension, sleep, getFixturePath } from "../helpers/helpers";

interface TagPattern {
  id?: string;
  type?: string;
  label?: string;
}

interface TagConfig {
  tags: Record<string, Array<string | TagPattern>>;
}

// Spec: filtering
suite("Task Filtering E2E Tests", () => {
  let originalConfig: string;
  const tagConfigPath = getFixturePath(".vscode/tasktree.json");

  suiteSetup(async function () {
    this.timeout(30000);
    await activateExtension();
    if (fs.existsSync(tagConfigPath)) {
      originalConfig = fs.readFileSync(tagConfigPath, "utf8");
    } else {
      originalConfig = JSON.stringify({ tags: {} }, null, 4);
    }
    await sleep(2000);
  });

  suiteTeardown(async function () {
    this.timeout(10000);
    fs.writeFileSync(tagConfigPath, originalConfig);
    await sleep(3000);
  });

  // Spec: filtering
  suite("Filter Commands Registration", () => {
    test("filter command is registered", async function () {
      this.timeout(10000);

      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes("tasktree.filter"),
        "filter command should be registered",
      );
    });

    test("clearFilter command is registered", async function () {
      this.timeout(10000);

      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes("tasktree.clearFilter"),
        "clearFilter command should be registered",
      );
    });

    test("filterByTag command is registered", async function () {
      this.timeout(10000);

      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes("tasktree.filterByTag"),
        "filterByTag command should be registered",
      );
    });

    test("editTags command is registered", async function () {
      this.timeout(10000);

      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes("tasktree.editTags"),
        "editTags command should be registered",
      );
    });
  });

  // Spec: tagging/config-file
  suite("Tag Configuration File Structure", () => {
    // Set up expected config at start of this suite to avoid state leakage from other tests
    const expectedConfig: TagConfig = {
      tags: {
        build: [{ label: "build" }, { type: "npm" }],
        test: [{ label: "test" }, { type: "npm" }],
        deploy: [{ label: "deploy" }],
        debug: [{ type: "launch" }],
        scripts: [{ type: "shell" }],
        ci: [
          { type: "npm", label: "lint" },
          { type: "npm", label: "test" },
          { type: "npm", label: "build" },
        ],
      },
    };

    suiteSetup(() => {
      fs.writeFileSync(tagConfigPath, JSON.stringify(expectedConfig, null, 4));
    });

    test("tag configuration file exists in fixtures", function () {
      this.timeout(10000);

      assert.ok(fs.existsSync(tagConfigPath), "tasktree.json should exist");
    });

    test("tag configuration has valid JSON structure", function () {
      this.timeout(10000);

      const content = JSON.parse(
        fs.readFileSync(tagConfigPath, "utf8"),
      ) as TagConfig;
      assert.ok("tags" in content, "Config should have tags property");
      assert.ok(typeof content.tags === "object", "Tags should be an object");
    });

    test("tag configuration has expected tags", function () {
      this.timeout(10000);

      const content = JSON.parse(
        fs.readFileSync(tagConfigPath, "utf8"),
      ) as TagConfig;

      assert.ok("build" in content.tags, "Should have build tag");
      assert.ok(content.tags["test"], "Should have test tag");
      assert.ok(content.tags["deploy"], "Should have deploy tag");
      assert.ok(content.tags["debug"], "Should have debug tag");
      assert.ok(content.tags["scripts"], "Should have scripts tag");
      assert.ok(content.tags["ci"], "Should have ci tag");
    });

    test("tag patterns use structured objects with label", function () {
      this.timeout(10000);

      const tagConfig = JSON.parse(
        fs.readFileSync(tagConfigPath, "utf8"),
      ) as TagConfig;

      const buildPatterns = tagConfig.tags["build"];
      assert.ok(buildPatterns, "build tag should exist");
      assert.ok(
        buildPatterns.some(
          (p) => typeof p === "object" && "label" in p && p.label === "build",
        ),
        "build tag should have label pattern",
      );
      assert.ok(
        buildPatterns.some(
          (p) => typeof p === "object" && "type" in p && p.type === "npm",
        ),
        "build tag should have npm type pattern",
      );
    });

    test("tag patterns use structured objects with type", function () {
      this.timeout(10000);

      const tagConfig = JSON.parse(
        fs.readFileSync(tagConfigPath, "utf8"),
      ) as TagConfig;

      const debugPatterns = tagConfig.tags["debug"];
      assert.ok(debugPatterns, "debug tag should exist");
      assert.ok(
        debugPatterns.some(
          (p) => typeof p === "object" && "type" in p && p.type === "launch",
        ),
        "debug tag should have launch type pattern",
      );
    });

    test("ci tag has multiple npm script patterns", function () {
      this.timeout(10000);

      const tagConfig = JSON.parse(
        fs.readFileSync(tagConfigPath, "utf8"),
      ) as TagConfig;

      const ciPatterns = tagConfig.tags["ci"];
      assert.ok(ciPatterns, "ci tag should exist");
      assert.ok(
        ciPatterns.some(
          (p) =>
            typeof p === "object" && p.type === "npm" && p.label === "lint",
        ),
        "ci should include lint pattern",
      );
      assert.ok(
        ciPatterns.some(
          (p) =>
            typeof p === "object" && p.type === "npm" && p.label === "test",
        ),
        "ci should include test pattern",
      );
      assert.ok(
        ciPatterns.some(
          (p) =>
            typeof p === "object" && p.type === "npm" && p.label === "build",
        ),
        "ci should include build pattern",
      );
    });

    test("tags in config are lowercase", function () {
      this.timeout(10000);

      const tagConfig = JSON.parse(
        fs.readFileSync(tagConfigPath, "utf8"),
      ) as TagConfig;

      assert.ok(
        tagConfig.tags["build"] !== undefined,
        "Should have lowercase build tag",
      );
      assert.ok(
        tagConfig.tags["test"] !== undefined,
        "Should have lowercase test tag",
      );
    });
  });

  // Spec: tagging/management
  suite("Edit Tags Command", () => {
    test("editTags command opens configuration file", async function () {
      this.timeout(15000);

      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
      await sleep(500);

      await vscode.commands.executeCommand("tasktree.editTags");
      await sleep(1000);

      const activeEditor = vscode.window.activeTextEditor;
      assert.ok(activeEditor !== undefined, "editTags should open an editor");

      const fileName = activeEditor.document.fileName;
      assert.ok(
        fileName.includes("tasktree.json"),
        "Should open tasktree.json",
      );

      await vscode.commands.executeCommand("workbench.action.closeAllEditors");
    });
  });
});
