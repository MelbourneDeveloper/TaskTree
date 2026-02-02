/**
 * CONFIGURATION E2E TESTS
 *
 * These tests verify extension settings and static configuration.
 * File watcher tests that call provider methods have been moved to configuration.unit.test.ts
 */

import * as assert from "assert";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  activateExtension,
  sleep,
  getFixturePath,
  getExtensionPath,
} from "../helpers/helpers";

interface ConfigurationProperty {
  default: unknown;
  enum?: string[];
  enumDescriptions?: string[];
}

interface PackageJsonConfig {
  contributes: {
    configuration: {
      title: string;
      properties: {
        "tasktree.excludePatterns": ConfigurationProperty;
        "tasktree.sortOrder": ConfigurationProperty;
      };
    };
  };
}

interface TagConfig {
  tags: Record<string, string[]>;
}

function readExtensionPackageJson(): PackageJsonConfig {
  return JSON.parse(
    fs.readFileSync(getExtensionPath("package.json"), "utf8"),
  ) as PackageJsonConfig;
}

suite("Configuration and File Watchers E2E Tests", () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await activateExtension();
    await sleep(3000);
  });

  suite("Extension Settings", () => {
    test("excludePatterns setting exists", function () {
      this.timeout(10000);

      const config = vscode.workspace.getConfiguration("tasktree");
      const excludePatterns = config.get<string[]>("excludePatterns");

      assert.ok(excludePatterns, "excludePatterns should exist");
      assert.ok(
        Array.isArray(excludePatterns),
        "excludePatterns should be an array",
      );
    });

    test("excludePatterns has sensible defaults", function () {
      this.timeout(10000);

      const packageJson = readExtensionPackageJson();
      const defaultPatterns = packageJson.contributes.configuration.properties[
        "tasktree.excludePatterns"
      ].default as string[];

      assert.ok(
        defaultPatterns.includes("**/node_modules/**"),
        "Should exclude node_modules",
      );
      assert.ok(defaultPatterns.includes("**/bin/**"), "Should exclude bin");
      assert.ok(defaultPatterns.includes("**/obj/**"), "Should exclude obj");
      assert.ok(defaultPatterns.includes("**/.git/**"), "Should exclude .git");
    });

    test("sortOrder setting exists", function () {
      this.timeout(10000);

      const config = vscode.workspace.getConfiguration("tasktree");
      const sortOrder = config.get<string>("sortOrder");

      assert.ok(
        sortOrder !== undefined && sortOrder !== "",
        "sortOrder should exist",
      );
    });

    test("sortOrder has valid enum values", function () {
      this.timeout(10000);

      const packageJson = readExtensionPackageJson();
      const enumValues =
        packageJson.contributes.configuration.properties["tasktree.sortOrder"]
          .enum;

      assert.ok(enumValues, "enum should exist");
      assert.ok(enumValues.includes("folder"), "Should have folder option");
      assert.ok(enumValues.includes("name"), "Should have name option");
      assert.ok(enumValues.includes("type"), "Should have type option");
    });

    test("sortOrder defaults to folder", function () {
      this.timeout(10000);

      const packageJson = readExtensionPackageJson();
      const defaultValue =
        packageJson.contributes.configuration.properties["tasktree.sortOrder"]
          .default;

      assert.strictEqual(
        defaultValue,
        "folder",
        "sortOrder should default to folder",
      );
    });

    test("sortOrder has descriptive enum descriptions", function () {
      this.timeout(10000);

      const packageJson = readExtensionPackageJson();
      const enumDescriptions =
        packageJson.contributes.configuration.properties["tasktree.sortOrder"]
          .enumDescriptions;

      assert.ok(enumDescriptions, "enumDescriptions should exist");
      assert.ok(enumDescriptions.length === 3, "Should have 3 descriptions");
      assert.ok(
        enumDescriptions[0]?.includes("folder") === true,
        "First should describe folder",
      );
      assert.ok(
        enumDescriptions[1]?.includes("name") === true,
        "Second should describe name",
      );
      assert.ok(
        enumDescriptions[2]?.includes("type") === true,
        "Third should describe type",
      );
    });
  });

  suite("Configuration Value Reading", () => {
    test("sortOrder config has valid value", function () {
      this.timeout(10000);

      const config = vscode.workspace.getConfiguration("tasktree");
      const sortOrder = config.get<string>("sortOrder");

      assert.ok(
        ["folder", "name", "type"].includes(sortOrder ?? ""),
        "sortOrder should have valid value",
      );
    });

    test("workspace settings are read correctly", function () {
      this.timeout(10000);

      const config = vscode.workspace.getConfiguration("tasktree");

      const excludePatterns = config.get<string[]>("excludePatterns");
      const sortOrder = config.get<string>("sortOrder");

      assert.ok(
        excludePatterns !== undefined,
        "excludePatterns should be readable",
      );
      assert.ok(sortOrder !== undefined, "sortOrder should be readable");
    });

    test("configuration has correct section title", function () {
      this.timeout(10000);

      const packageJson = readExtensionPackageJson();

      assert.strictEqual(
        packageJson.contributes.configuration.title,
        "TaskTree",
        "Configuration title should be TaskTree",
      );
    });
  });

  suite("Tag Configuration", () => {
    test("tag config file has correct structure", function () {
      this.timeout(10000);

      const tagConfig = JSON.parse(
        fs.readFileSync(getFixturePath(".vscode/tasktree.json"), "utf8"),
      ) as TagConfig;

      assert.ok(
        typeof tagConfig.tags === "object",
        "Should have tags property as object",
      );
    });

    test("tag patterns are arrays", function () {
      this.timeout(10000);

      const tagConfig = JSON.parse(
        fs.readFileSync(getFixturePath(".vscode/tasktree.json"), "utf8"),
      ) as TagConfig;

      for (const [tagName, patterns] of Object.entries(tagConfig.tags)) {
        assert.ok(
          Array.isArray(patterns),
          `Tag ${tagName} patterns should be an array`,
        );
      }
    });
  });

  suite("Glob Pattern Matching", () => {
    test("exclude patterns use glob syntax", function () {
      this.timeout(10000);

      const packageJson = readExtensionPackageJson();
      const patterns = packageJson.contributes.configuration.properties[
        "tasktree.excludePatterns"
      ].default as string[];

      for (const pattern of patterns) {
        assert.ok(
          pattern.includes("**"),
          `Pattern ${pattern} should use ** glob`,
        );
      }
    });

    test("exclude patterns support common directories", function () {
      this.timeout(10000);

      const config = vscode.workspace.getConfiguration("tasktree");
      const patterns = config.get<string[]>("excludePatterns") ?? [];

      const excludedDirs = ["node_modules", "bin", "obj", ".git"];

      for (const dir of excludedDirs) {
        const hasPattern = patterns.some((p) => p.includes(dir));
        assert.ok(hasPattern, `Should exclude ${dir}`);
      }
    });
  });

  suite("Multiple Workspace Support", () => {
    test("works with single workspace folder", function () {
      this.timeout(10000);

      const folders = vscode.workspace.workspaceFolders;

      assert.ok(folders, "Should have workspace folders");
      assert.ok(
        folders.length >= 1,
        "Should have at least one workspace folder",
      );
    });

    test("reads config from workspace root", function () {
      this.timeout(10000);

      const folders = vscode.workspace.workspaceFolders;
      assert.ok(folders && folders.length > 0, "Should have workspace folder");

      const firstFolder = folders[0];
      if (!firstFolder) {
        throw new Error("First folder should exist");
      }

      const workspaceRoot = firstFolder.uri.fsPath;
      const vscodeDir = path.join(workspaceRoot, ".vscode");

      assert.ok(fs.existsSync(vscodeDir), ".vscode directory should exist");
    });
  });
});
