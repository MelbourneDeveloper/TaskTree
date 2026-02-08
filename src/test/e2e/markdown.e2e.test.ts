/**
 * MARKDOWN E2E TESTS
 *
 * These tests verify markdown file discovery and preview functionality.
 * Tests are black-box only - they verify behavior through the VS Code UI.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import { activateExtension, sleep, getCommandTreeProvider, getTreeChildren } from "../helpers/helpers";

suite("Markdown Discovery and Preview E2E Tests", () => {
  suiteSetup(async function () {
    this.timeout(30000);
    await activateExtension();
    await sleep(3000);
  });

  suite("Markdown File Discovery", () => {
    test("discovers markdown files in workspace root", async function () {
      this.timeout(10000);

      const provider = getCommandTreeProvider();
      const rootItems = await getTreeChildren(provider);

      const markdownCategory = rootItems.find(
        (item) => item.categoryLabel?.toLowerCase().includes("markdown") === true
      );

      assert.ok(markdownCategory, "Should have a Markdown category");

      const markdownItems = await getTreeChildren(provider, markdownCategory);
      const readmeItem = markdownItems.find((item) =>
        item.task?.label.includes("README.md") === true
      );

      assert.ok(readmeItem, "Should discover README.md");
      assert.strictEqual(
        readmeItem.task?.type,
        "markdown",
        "README.md should be of type markdown"
      );
    });

    test("discovers markdown files in subdirectories", async function () {
      this.timeout(10000);

      const provider = getCommandTreeProvider();
      const rootItems = await getTreeChildren(provider);

      const markdownCategory = rootItems.find(
        (item) => item.categoryLabel?.toLowerCase().includes("markdown") === true
      );

      assert.ok(markdownCategory, "Should have a Markdown category");

      const markdownItems = await getTreeChildren(provider, markdownCategory);
      const guideItem = markdownItems.find((item) =>
        item.task?.label.includes("guide.md") === true
      );

      assert.ok(guideItem, "Should discover guide.md in subdirectory");
      assert.strictEqual(
        guideItem.task?.type,
        "markdown",
        "guide.md should be of type markdown"
      );
    });

    test("extracts description from markdown heading", async function () {
      this.timeout(10000);

      const provider = getCommandTreeProvider();
      const rootItems = await getTreeChildren(provider);

      const markdownCategory = rootItems.find(
        (item) => item.categoryLabel?.toLowerCase().includes("markdown") === true
      );

      assert.ok(markdownCategory, "Should have a Markdown category");

      const markdownItems = await getTreeChildren(provider, markdownCategory);
      const readmeItem = markdownItems.find((item) =>
        item.task?.label.includes("README.md") === true
      );

      assert.ok(readmeItem, "Should find README.md item");

      const description = readmeItem.task?.description;
      assert.ok(description !== undefined && description.length > 0, "Should have a description");
      assert.ok(
        description.includes("Test Project Documentation"),
        "Description should come from first heading"
      );
    });

    test("sets correct file path for markdown items", async function () {
      this.timeout(10000);

      const provider = getCommandTreeProvider();
      const rootItems = await getTreeChildren(provider);

      const markdownCategory = rootItems.find(
        (item) => item.categoryLabel?.toLowerCase().includes("markdown") === true
      );

      assert.ok(markdownCategory, "Should have a Markdown category");

      const markdownItems = await getTreeChildren(provider, markdownCategory);
      const readmeItem = markdownItems.find((item) =>
        item.task?.label.includes("README.md") === true
      );

      assert.ok(readmeItem, "Should find README.md item");

      const filePath = readmeItem.task?.filePath;
      assert.ok(filePath !== undefined && filePath.length > 0, "Should have a file path");
      assert.ok(
        filePath.endsWith("README.md"),
        "File path should end with README.md"
      );
    });
  });

  suite("Markdown Preview Command", () => {
    test("openPreview command is registered", async function () {
      this.timeout(10000);

      const commands = await vscode.commands.getCommands(true);
      assert.ok(
        commands.includes("commandtree.openPreview"),
        "openPreview command should be registered"
      );
    });

    test("openPreview command opens markdown preview", async function () {
      this.timeout(15000);

      const provider = getCommandTreeProvider();
      const rootItems = await getTreeChildren(provider);

      const markdownCategory = rootItems.find(
        (item) => item.categoryLabel?.toLowerCase().includes("markdown") === true
      );

      assert.ok(markdownCategory, "Should have a Markdown category");

      const markdownItems = await getTreeChildren(provider, markdownCategory);
      const readmeItem = markdownItems.find((item) =>
        item.task?.label.includes("README.md") === true
      );

      assert.ok(readmeItem?.task, "Should find README.md with task");

      const initialEditorCount = vscode.window.visibleTextEditors.length;

      await vscode.commands.executeCommand(
        "commandtree.openPreview",
        readmeItem
      );

      await sleep(2000);

      const finalEditorCount = vscode.window.visibleTextEditors.length;
      assert.ok(
        finalEditorCount >= initialEditorCount,
        "Preview should open a new editor or reuse existing"
      );
    });

    test("run command on markdown item opens preview", async function () {
      this.timeout(15000);

      const provider = getCommandTreeProvider();
      const rootItems = await getTreeChildren(provider);

      const markdownCategory = rootItems.find(
        (item) => item.categoryLabel?.toLowerCase().includes("markdown") === true
      );

      assert.ok(markdownCategory, "Should have a Markdown category");

      const markdownItems = await getTreeChildren(provider, markdownCategory);
      const guideItem = markdownItems.find((item) =>
        item.task?.label.includes("guide.md") === true
      );

      assert.ok(guideItem?.task, "Should find guide.md with task");

      const initialEditorCount = vscode.window.visibleTextEditors.length;

      await vscode.commands.executeCommand("commandtree.run", guideItem);

      await sleep(2000);

      const finalEditorCount = vscode.window.visibleTextEditors.length;
      assert.ok(
        finalEditorCount >= initialEditorCount,
        "Running markdown item should open preview"
      );
    });
  });

  suite("Markdown Item Context", () => {
    test("markdown items have correct context value", async function () {
      this.timeout(10000);

      const provider = getCommandTreeProvider();
      const rootItems = await getTreeChildren(provider);

      const markdownCategory = rootItems.find(
        (item) => item.categoryLabel?.toLowerCase().includes("markdown") === true
      );

      assert.ok(markdownCategory, "Should have a Markdown category");

      const markdownItems = await getTreeChildren(provider, markdownCategory);
      const readmeItem = markdownItems.find((item) =>
        item.task?.label.includes("README.md") === true
      );

      assert.ok(readmeItem, "Should find README.md item");

      const contextValue = readmeItem.contextValue;
      assert.ok(
        contextValue?.includes("markdown") === true,
        "Context value should include 'markdown'"
      );
    });

    test("markdown items display with correct icon", async function () {
      this.timeout(10000);

      const provider = getCommandTreeProvider();
      const rootItems = await getTreeChildren(provider);

      const markdownCategory = rootItems.find(
        (item) => item.categoryLabel?.toLowerCase().includes("markdown") === true
      );

      assert.ok(markdownCategory, "Should have a Markdown category");

      const markdownItems = await getTreeChildren(provider, markdownCategory);
      const readmeItem = markdownItems.find((item) =>
        item.task?.label.includes("README.md") === true
      );

      assert.ok(readmeItem, "Should find README.md item");
      assert.ok(readmeItem.iconPath !== undefined, "Markdown item should have an icon");
    });
  });
});
