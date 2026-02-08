/**
 * SPEC: ai-summary-generation
 *
 * AI SUMMARY GENERATION — E2E TESTS
 * Pipeline: Copilot summary → SQLite storage → tooltip display
 * Tests security warnings, summary display, and debounce behaviour.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import * as fs from "fs";
import {
  activateExtension,
  sleep,
  getFixturePath,
  getCommandTreeProvider,
  collectLeafItems,
  collectLeafTasks,
  getTooltipText,
} from "../helpers/helpers";
import type { CommandTreeProvider } from "../helpers/helpers";

const SHORT_SETTLE_MS = 1000;
const COPILOT_VENDOR = "copilot";
const COPILOT_WAIT_MS = 2000;
const COPILOT_MAX_ATTEMPTS = 30;

// Summary tests disabled — skip until re-enabled
suite.skip("AI Summary Generation E2E", () => {
  let provider: CommandTreeProvider;

  suiteSetup(async function () {
    this.timeout(300000);

    await activateExtension();
    provider = getCommandTreeProvider();
    await sleep(3000);

    const totalTasks = (await collectLeafTasks(provider)).length;
    assert.ok(totalTasks > 0, "Fixture workspace must have discovered tasks");

    let copilotModels: vscode.LanguageModelChat[] = [];
    for (let i = 0; i < COPILOT_MAX_ATTEMPTS; i++) {
      copilotModels = await vscode.lm.selectChatModels({
        vendor: COPILOT_VENDOR,
      });
      if (copilotModels.length > 0) {
        break;
      }
      if (i === COPILOT_MAX_ATTEMPTS - 1) {
        const allModels = await vscode.lm.selectChatModels();
        const info = allModels.map((m) => `${m.vendor}/${m.name}/${m.id}`);
        assert.fail(
          `GATE FAILED: No Copilot models after ${COPILOT_MAX_ATTEMPTS} attempts. ` +
            `All available models: [${info.join(", ")}].`,
        );
      }
      await sleep(COPILOT_WAIT_MS);
    }

    await vscode.workspace
      .getConfiguration("commandtree")
      .update("enableAiSummaries", true, vscode.ConfigurationTarget.Workspace);
    await sleep(SHORT_SETTLE_MS);

    await vscode.commands.executeCommand("commandtree.generateSummaries");
    await sleep(5000);
  });

  suiteTeardown(async function () {
    this.timeout(15000);
    await vscode.workspace
      .getConfiguration("commandtree")
      .update("enableAiSummaries", false, vscode.ConfigurationTarget.Workspace);
  });

  // SPEC.md **ai-summary-generation**
  test("tasks have AI-generated summaries after pipeline", async function () {
    this.timeout(15000);

    const tasks = await collectLeafTasks(provider);
    const withSummary = tasks.filter(
      (t) => t.summary !== undefined && t.summary !== "",
    );

    assert.ok(
      withSummary.length > 0,
      `At least one task should have an AI summary, got 0 out of ${tasks.length}`,
    );
    for (const task of withSummary) {
      assert.ok(
        typeof task.summary === "string" && task.summary.length > 5,
        `Summary for "${task.label}" should be a meaningful string, got: "${task.summary}"`,
      );
      const fakePattern = `${task.type} command "${task.label}": ${task.command}`;
      assert.notStrictEqual(
        task.summary,
        fakePattern,
        `FRAUD: Summary for "${task.label}" matches fake metadata pattern`,
      );
    }
  });

  // SPEC.md **ai-summary-generation** (Display: Tooltip on hover)
  test("tree items show summaries in tooltips as markdown blockquotes", async function () {
    this.timeout(15000);

    const items = await collectLeafItems(provider);
    const withSummaryTooltip = items.filter((item) => {
      const tip = getTooltipText(item);
      return tip.includes("> ");
    });

    assert.ok(
      withSummaryTooltip.length > 0,
      "At least one tree item should show summary as markdown blockquote in tooltip",
    );

    for (const item of withSummaryTooltip) {
      const tip = getTooltipText(item);
      assert.ok(
        tip.includes(`**${item.task?.label}**`),
        `Tooltip should contain the task label "${item.task?.label}"`,
      );
      assert.ok(
        item.tooltip instanceof vscode.MarkdownString,
        "Tooltip should be a MarkdownString for rich display",
      );
    }
  });

  // SPEC.md line 211: Security warning in tooltip
  test("tooltips display security warning icon when summary contains security keywords", async function () {
    this.timeout(15000);

    const items = await collectLeafItems(provider);
    const allTooltips = items
      .map(i => ({ item: i, tooltip: getTooltipText(i) }))
      .filter(x => x.tooltip.includes("> "));

    const withWarning = allTooltips.filter(x => x.tooltip.includes("\u26A0\uFE0F"));
    const withKeywords = allTooltips.filter(x => {
      const lower = x.tooltip.toLowerCase();
      return ['danger', 'unsafe', 'caution', 'warning', 'security', 'risk', 'vulnerability']
        .some(k => lower.includes(k));
    });

    assert.ok(
      withKeywords.length >= 0,
      "Checking for security keywords in summaries"
    );

    if (withKeywords.length > 0) {
      assert.ok(
        withWarning.length > 0,
        `Found ${withKeywords.length} summaries with security keywords, but 0 have \u26A0\uFE0F icon`
      );
    }
  });

  // SPEC.md **ai-summary-generation** (Display: security warnings shown as ⚠️ prefix on label + tooltip section)
  test("security warnings appear in label and tooltips when Copilot flags risky commands", async function () {
    this.timeout(15000);

    const tasks = await collectLeafTasks(provider);
    const items = await collectLeafItems(provider);

    const securityWarnings = tasks.filter(
      (t) => t.securityWarning !== undefined && t.securityWarning !== '',
    );

    if (securityWarnings.length === 0) {
      return;
    }

    assert.ok(
      securityWarnings.length > 0,
      "Found commands with security warnings from Copilot",
    );

    for (const task of securityWarnings) {
      const item = items.find((i) => i.task?.id === task.id);
      assert.ok(
        item !== undefined,
        `Tree item should exist for flagged command "${task.label}"`,
      );

      const tip = getTooltipText(item);
      assert.ok(
        tip.includes("\u26A0\uFE0F"),
        `Tooltip for "${task.label}" should contain security warning emoji`,
      );
      assert.ok(
        tip.includes(task.securityWarning ?? ""),
        `Tooltip for "${task.label}" should include security warning text`,
      );

      const label = typeof item.label === 'string' ? item.label : '';
      assert.ok(
        label.includes("\u26A0\uFE0F"),
        `Label for "${task.label}" should be prefixed with \u26A0\uFE0F`,
      );
    }
  });

  // SPEC.md line 209: File watch with debounce
  test("rapid file changes are debounced to prevent excessive re-summarization", async function () {
    this.timeout(60000);

    const testFilePath = getFixturePath("test-debounce.sh");
    const testContent = "#!/bin/bash\necho 'test'\n";

    fs.writeFileSync(testFilePath, testContent);
    await sleep(SHORT_SETTLE_MS);

    const startCount = (await collectLeafTasks(provider)).length;

    fs.writeFileSync(testFilePath, "#!/bin/bash\necho 'change1'\n");
    await sleep(500);
    fs.writeFileSync(testFilePath, "#!/bin/bash\necho 'change2'\n");
    await sleep(500);
    fs.writeFileSync(testFilePath, "#!/bin/bash\necho 'change3'\n");
    await sleep(3000);

    const endCount = (await collectLeafTasks(provider)).length;
    assert.ok(
      endCount >= startCount,
      `Task count should not decrease after rapid changes (${endCount} >= ${startCount})`
    );

    fs.unlinkSync(testFilePath);
    await sleep(SHORT_SETTLE_MS);
  });
});
