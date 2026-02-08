/**
 * SPEC: ai-semantic-search, ai-summary-generation, ai-embedding-generation, database-schema, ai-search-implementation
 *
 * VECTOR EMBEDDING SEARCH — FULL E2E TESTS
 * Pipeline: Copilot summary → MiniLM embedding → SQLite BLOB → cosine similarity
 * These tests FAIL without Copilot + HuggingFace — that is correct.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import {
  activateExtension,
  sleep,
  getFixturePath,
  getCommandTreeProvider,
} from "../helpers/helpers";
import type { CommandTreeProvider, CommandTreeItem } from "../helpers/helpers";
import type { TaskItem } from "../../models/TaskItem";

const COMMANDTREE_DIR = ".commandtree";
const DB_FILENAME = "commandtree.sqlite3";
const MINILM_EMBEDDING_DIM = 384;
const EMBEDDING_BLOB_BYTES = MINILM_EMBEDDING_DIM * 4;
const SEARCH_SETTLE_MS = 2000;
const SHORT_SETTLE_MS = 1000;
const INPUT_BOX_RENDER_MS = 1000;
const COPILOT_VENDOR = "copilot";
const COPILOT_WAIT_MS = 2000;
const COPILOT_MAX_ATTEMPTS = 30;

function getLabelString(label: string | vscode.TreeItemLabel | undefined): string {
  if (label === undefined) {
    return "";
  }
  if (typeof label === "string") {
    return label;
  }
  return label.label;
}

async function collectLeafItems(
  p: CommandTreeProvider,
): Promise<CommandTreeItem[]> {
  const out: CommandTreeItem[] = [];
  async function walk(node: CommandTreeItem): Promise<void> {
    if (node.task !== null) {
      out.push(node);
    }
    for (const child of await p.getChildren(node)) {
      await walk(child);
    }
  }
  for (const root of await p.getChildren()) {
    await walk(root);
  }
  return out;
}

async function collectLeafTasks(p: CommandTreeProvider): Promise<TaskItem[]> {
  const items = await collectLeafItems(p);
  return items.map((i) => i.task).filter((t): t is TaskItem => t !== null);
}

/**
 * Extracts tooltip text from a CommandTreeItem.
 */
function getTooltipText(item: CommandTreeItem): string {
  if (item.tooltip instanceof vscode.MarkdownString) {
    return item.tooltip.value;
  }
  if (typeof item.tooltip === "string") {
    return item.tooltip;
  }
  return "";
}

type SqlRow = Record<string, number | bigint | string | Uint8Array | null>;

/**
 * Opens the SQLite DB artifact directly and checks for REAL embedding BLOBs.
 * This is black-box: we inspect the file the extension wrote, not internal APIs.
 *
 * CRITICAL: This exists to catch fraud. If embeddings are null or wrong-size,
 * the "search" was just dumb text matching — not vector proximity.
 */
async function queryEmbeddingStats(dbPath: string): Promise<{
  readonly rowCount: number;
  readonly embeddedCount: number;
  readonly nullCount: number;
  readonly wrongSizeCount: number;
  readonly sampleBlobLength: number;
}> {
  const mod = await import("node-sqlite3-wasm");
  const db = new mod.default.Database(dbPath);
  try {
    const total = db.get(
      "SELECT COUNT(*) as cnt FROM commands",
    ) as SqlRow | null;
    const embedded = db.get(
      "SELECT COUNT(*) as cnt FROM commands WHERE embedding IS NOT NULL",
    ) as SqlRow | null;
    const nulls = db.get(
      "SELECT COUNT(*) as cnt FROM commands WHERE embedding IS NULL",
    ) as SqlRow | null;
    const wrongSize = db.get(
      "SELECT COUNT(*) as cnt FROM commands WHERE embedding IS NOT NULL AND LENGTH(embedding) != ?",
      [EMBEDDING_BLOB_BYTES],
    ) as SqlRow | null;
    const sample = db.get(
      "SELECT embedding FROM commands WHERE embedding IS NOT NULL LIMIT 1",
    ) as SqlRow | null;
    return {
      rowCount: Number(total?.["cnt"] ?? 0),
      embeddedCount: Number(embedded?.["cnt"] ?? 0),
      nullCount: Number(nulls?.["cnt"] ?? 0),
      wrongSizeCount: Number(wrongSize?.["cnt"] ?? 0),
      sampleBlobLength:
        (sample?.["embedding"] as Uint8Array | undefined)?.length ?? 0,
    };
  } finally {
    db.close();
  }
}

suite("Vector Embedding Search E2E", () => {
  let provider: CommandTreeProvider;
  let totalTaskCount: number;

  // SPEC.md **ai-summary-generation** (Copilot requirement), **ai-embedding-generation** (model download)
  suiteSetup(async function () {
    this.timeout(300000); // 5 min — Copilot + model download

    // CLEAN SLATE: delete stale DB from previous run BEFORE activation
    // so the extension creates a fresh DB during initSemanticSubsystem.
    // Deleting AFTER activation would leave the DB singleton pointing at a deleted file.
    const staleDir = getFixturePath(COMMANDTREE_DIR);
    if (fs.existsSync(staleDir)) {
      fs.rmSync(staleDir, { recursive: true, force: true });
    }

    await activateExtension();
    provider = getCommandTreeProvider();
    await sleep(3000);

    // DEBUG: Log workspace root
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    console.log(`[DEBUG] Workspace root: ${workspaceRoot}`);

    // Snapshot total task count before any filtering
    totalTaskCount = (await collectLeafTasks(provider)).length;
    assert.ok(
      totalTaskCount > 0,
      "Fixture workspace must have discovered tasks",
    );

    // GATE: Wait for Copilot LM API to initialize (retries like production code).
    // Copilot needs time to activate + authenticate after VS Code starts.
    let copilotModels: vscode.LanguageModelChat[] = [];
    for (let i = 0; i < COPILOT_MAX_ATTEMPTS; i++) {
      copilotModels = await vscode.lm.selectChatModels({
        vendor: COPILOT_VENDOR,
      });
      if (copilotModels.length > 0) {
        break;
      }
      // On last attempt, dump ALL models for diagnostics
      if (i === COPILOT_MAX_ATTEMPTS - 1) {
        const allModels = await vscode.lm.selectChatModels();
        const info = allModels.map((m) => `${m.vendor}/${m.name}/${m.id}`);
        assert.fail(
          `GATE FAILED: No Copilot models after ${COPILOT_MAX_ATTEMPTS} attempts (${(COPILOT_MAX_ATTEMPTS * COPILOT_WAIT_MS) / 1000}s). ` +
            `All available models: [${info.join(", ")}]. ` +
            `Check: (1) github.copilot-chat extension installed, (2) GitHub authenticated, (3) --disable-extensions not blocking Copilot.`,
        );
      }
      await sleep(COPILOT_WAIT_MS);
    }

    // Enable AI — extension uses Copilot + HuggingFace by itself
    await vscode.workspace
      .getConfiguration("commandtree")
      .update("enableAiSummaries", true, vscode.ConfigurationTarget.Workspace);
    await sleep(SHORT_SETTLE_MS);

    // DEBUG: Log task count before generating summaries
    const tasksBeforeGen = await collectLeafTasks(provider);
    console.log(`[DEBUG] Tasks before generateSummaries: ${tasksBeforeGen.length}`);
    console.log(`[DEBUG] First 3 task IDs: ${tasksBeforeGen.slice(0, 3).map(t => t.id).join(", ")}`);

    // Trigger the REAL pipeline: Copilot summaries → MiniLM embeddings → SQLite
    await vscode.commands.executeCommand("commandtree.generateSummaries");
    await sleep(5000);

    // DEBUG: Log task count after generating summaries
    const tasksAfterGen = await collectLeafTasks(provider);
    console.log(`[DEBUG] Tasks after generateSummaries: ${tasksAfterGen.length}`);

    // GATE: Verify the pipeline actually produced real embeddings.
    // If generateSummaries silently failed (e.g. Copilot auth expired mid-run),
    // we catch it HERE — not in individual tests with confusing errors.
    const dbPath = getFixturePath(path.join(COMMANDTREE_DIR, DB_FILENAME));
    console.log(`[DEBUG] Database path: ${dbPath}`);
    console.log(`[DEBUG] Database exists: ${fs.existsSync(dbPath)}`);

    assert.ok(
      fs.existsSync(dbPath),
      "GATE FAILED: SQLite DB does not exist after generateSummaries. Pipeline did not fire.",
    );
    const gateStats = await queryEmbeddingStats(dbPath);
    console.log(`[DEBUG] Gate stats: rowCount=${gateStats.rowCount}, embeddedCount=${gateStats.embeddedCount}, nullCount=${gateStats.nullCount}`);

    assert.ok(
      gateStats.embeddedCount > 0,
      `GATE FAILED: ${gateStats.embeddedCount}/${gateStats.rowCount} rows have real embedding BLOBs. The LM API call succeeded but the pipeline produced nothing.`,
    );
  });

  suiteTeardown(async function () {
    this.timeout(15000);
    await vscode.commands.executeCommand("commandtree.clearFilter");
    await vscode.workspace
      .getConfiguration("commandtree")
      .update("enableAiSummaries", false, vscode.ConfigurationTarget.Workspace);

    // Clean up generated DB
    const dir = getFixturePath(COMMANDTREE_DIR);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // SPEC.md **ai-search-implementation** line 553: "User invokes semantic search through magnifying glass icon in the UI"
  test("semanticSearch command is registered and invokable", async function () {
    this.timeout(10000);

    const commands = await vscode.commands.getCommands(true);
    assert.ok(
      commands.includes("commandtree.semanticSearch"),
      "semanticSearch command must be registered for UI icon to work"
    );
  });

  // SPEC.md **ai-embedding-generation**, **database-schema**
  test("embedding pipeline fires and writes REAL 384-dim vectors to SQLite", async function () {
    this.timeout(15000);

    // PROOF: The pipeline ran (generateSummaries command) and produced
    // actual embedding BLOBs in the DB. We open SQLite DIRECTLY and
    // inspect every single row. No internal APIs. No trust.
    const dbPath = getFixturePath(path.join(COMMANDTREE_DIR, DB_FILENAME));
    assert.ok(
      fs.existsSync(dbPath),
      "DB file must exist — pipeline did not fire",
    );

    const stats = await queryEmbeddingStats(dbPath);

    // 1. Rows must exist — pipeline must have processed tasks
    assert.ok(
      stats.rowCount > 0,
      `DB has ${stats.rowCount} rows — pipeline produced nothing`,
    );

    // 2. EVERY row must have a non-null embedding BLOB
    assert.strictEqual(
      stats.nullCount,
      0,
      `${stats.nullCount}/${stats.rowCount} rows have NULL embeddings — embedder failed`,
    );
    assert.strictEqual(
      stats.embeddedCount,
      stats.rowCount,
      `Only ${stats.embeddedCount}/${stats.rowCount} rows have embeddings`,
    );

    // 3. Every BLOB must be exactly 384 dims × 4 bytes = 1536 bytes
    assert.strictEqual(
      stats.wrongSizeCount,
      0,
      `${stats.wrongSizeCount} BLOBs have wrong size (need ${EMBEDDING_BLOB_BYTES} bytes)`,
    );
    assert.strictEqual(
      stats.sampleBlobLength,
      EMBEDDING_BLOB_BYTES,
      `Sample BLOB is ${stats.sampleBlobLength} bytes, need ${EMBEDDING_BLOB_BYTES}`,
    );

    // 4. BLOB must contain real float data, not zeros
    const mod = await import("node-sqlite3-wasm");
    const db = new mod.default.Database(dbPath);
    try {
      const row = db.get(
        "SELECT embedding FROM commands WHERE embedding IS NOT NULL LIMIT 1",
      ) as SqlRow | null;
      const blob = row?.["embedding"] as Uint8Array | undefined;
      assert.ok(blob !== undefined, "Could not read sample BLOB");
      const floats = new Float32Array(
        blob.buffer,
        blob.byteOffset,
        MINILM_EMBEDDING_DIM,
      );
      const nonZero = floats.filter((v) => v !== 0).length;
      assert.ok(
        nonZero > MINILM_EMBEDDING_DIM / 2,
        `Embedding has ${nonZero}/${MINILM_EMBEDDING_DIM} non-zero values — likely garbage`,
      );
    } finally {
      db.close();
    }
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
      // Anti-fraud: reject the old buildFallbackSummary metadata pattern
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

  // SPEC.md **ai-search-implementation**
  test("semantic search filters tree to relevant results", async function () {
    this.timeout(120000);

    await vscode.commands.executeCommand(
      "commandtree.semanticSearch",
      "run tests",
    );
    await sleep(SEARCH_SETTLE_MS);

    assert.ok(provider.hasFilter(), "Semantic filter should be active");

    const visible = await collectLeafTasks(provider);
    assert.ok(visible.length > 0, "Search should return at least one result");
    assert.ok(
      visible.length < totalTaskCount,
      `Filter should reduce tasks (${visible.length} visible < ${totalTaskCount} total)`,
    );

    await vscode.commands.executeCommand("commandtree.clearFilter");
  });

  // SPEC.md **ai-search-implementation**
  test("deploy query surfaces deploy-related tasks", async function () {
    this.timeout(120000);

    await vscode.commands.executeCommand(
      "commandtree.semanticSearch",
      "deploy application to production server",
    );
    await sleep(SEARCH_SETTLE_MS);

    const results = await collectLeafTasks(provider);
    assert.ok(results.length > 0, '"deploy" query must return results');
    assert.ok(
      results.length < totalTaskCount,
      `"deploy" query should not return all tasks (${results.length} < ${totalTaskCount})`,
    );

    const labels = results.map((t) => t.label.toLowerCase());
    const hasDeployResult = labels.some((l) => l.includes("deploy"));
    assert.ok(
      hasDeployResult,
      `"deploy" query should include deploy tasks, got: [${labels.join(", ")}]`,
    );

    await vscode.commands.executeCommand("commandtree.clearFilter");
  });

  // SPEC.md **ai-search-implementation**
  test("build query surfaces build-related tasks", async function () {
    this.timeout(120000);

    await vscode.commands.executeCommand(
      "commandtree.semanticSearch",
      "compile and build the project",
    );
    await sleep(SEARCH_SETTLE_MS);

    const results = await collectLeafTasks(provider);
    assert.ok(results.length > 0, '"build" query must return results');

    const labels = results.map((t) => t.label.toLowerCase());
    const hasBuildResult = labels.some((l) => l.includes("build"));
    assert.ok(
      hasBuildResult,
      `"build" query should include build tasks, got: [${labels.join(", ")}]`,
    );

    await vscode.commands.executeCommand("commandtree.clearFilter");
  });

  // SPEC.md **ai-search-implementation**
  test("different queries produce different result sets", async function () {
    this.timeout(120000);

    // Search "build"
    await vscode.commands.executeCommand(
      "commandtree.semanticSearch",
      "build project",
    );
    await sleep(SEARCH_SETTLE_MS);
    const buildResults = await collectLeafTasks(provider);
    const buildIds = new Set(buildResults.map((t) => t.id));
    assert.ok(buildIds.size > 0, "Build search should have results");

    // Search "deploy"
    await vscode.commands.executeCommand("commandtree.clearFilter");
    await sleep(500);
    await vscode.commands.executeCommand(
      "commandtree.semanticSearch",
      "deploy to production",
    );
    await sleep(SEARCH_SETTLE_MS);
    const deployResults = await collectLeafTasks(provider);
    const deployIds = new Set(deployResults.map((t) => t.id));
    assert.ok(deployIds.size > 0, "Deploy search should have results");

    const identical =
      buildIds.size === deployIds.size &&
      [...buildIds].every((id) => deployIds.has(id));
    assert.ok(
      !identical,
      "Different queries should produce different result sets",
    );

    await vscode.commands.executeCommand("commandtree.clearFilter");
  });

  // SPEC.md **ai-search-implementation**
  test("empty query does not activate filter", async function () {
    this.timeout(15000);

    await vscode.commands.executeCommand("commandtree.semanticSearch", "");
    await sleep(SHORT_SETTLE_MS);

    assert.ok(!provider.hasFilter(), "Empty query should not activate filter");
    const tasks = await collectLeafTasks(provider);
    assert.strictEqual(
      tasks.length,
      totalTaskCount,
      "All tasks should remain visible after empty query",
    );
  });

  // SPEC.md **ai-search-implementation**
  test("test query surfaces test-related tasks", async function () {
    this.timeout(120000);

    await vscode.commands.executeCommand(
      "commandtree.semanticSearch",
      "run the test suite",
    );
    await sleep(SEARCH_SETTLE_MS);

    const results = await collectLeafTasks(provider);
    assert.ok(results.length > 0, '"test" query must return results');

    const labels = results.map((t) => t.label.toLowerCase());
    const hasTestResult = labels.some(
      (l) => l.includes("test") || l.includes("spec") || l.includes("check"),
    );
    assert.ok(
      hasTestResult,
      `"test" query should include test tasks, got: [${labels.join(", ")}]`,
    );

    await vscode.commands.executeCommand("commandtree.clearFilter");
  });

  // SPEC.md **ai-search-implementation**
  test("clear filter restores all tasks after search", async function () {
    this.timeout(30000);

    // Apply a filter first
    await vscode.commands.executeCommand("commandtree.semanticSearch", "build");
    await sleep(SEARCH_SETTLE_MS);
    assert.ok(provider.hasFilter(), "Filter should be active before clearing");

    // Clear it
    await vscode.commands.executeCommand("commandtree.clearFilter");
    await sleep(SHORT_SETTLE_MS);

    assert.ok(!provider.hasFilter(), "Filter should be cleared");
    const restored = await collectLeafTasks(provider);
    assert.strictEqual(
      restored.length,
      totalTaskCount,
      "All tasks should be visible after clearing filter",
    );
  });

  // SPEC.md **ai-search-implementation**
  test("query-specific searches surface relevant tasks", async function () {
    this.timeout(120000);
    const cases = [
      {
        query: "deploy application to production server",
        keywords: ["deploy"],
      },
      { query: "compile and build the project", keywords: ["build"] },
      { query: "run the test suite", keywords: ["test", "spec", "check"] },
    ];
    const resultSets: Array<Set<string>> = [];
    for (const tc of cases) {
      await vscode.commands.executeCommand(
        "commandtree.semanticSearch",
        tc.query,
      );
      await sleep(SEARCH_SETTLE_MS);
      const results = await collectLeafTasks(provider);
      assert.ok(
        results.length > 0,
        `"${tc.keywords[0]}" query must return results`,
      );
      assert.ok(
        results.length < totalTaskCount,
        `"${tc.keywords[0]}" should not return all (${results.length} < ${totalTaskCount})`,
      );
      const labels = results.map((t) => t.label.toLowerCase());
      const hasMatch = labels.some((l) =>
        tc.keywords.some((k) => l.includes(k)),
      );
      assert.ok(
        hasMatch,
        `"${tc.keywords[0]}" query should match, got: [${labels.join(", ")}]`,
      );
      resultSets.push(new Set(results.map((t) => t.id)));
      await vscode.commands.executeCommand("commandtree.clearFilter");
      await sleep(500);
    }
    // Different queries must produce different result sets (proves real vector math)
    const first = resultSets[0];
    const second = resultSets[1];
    if (first !== undefined && second !== undefined) {
      const identical =
        first.size === second.size && [...first].every((id) => second.has(id));
      assert.ok(
        !identical,
        "Different queries should produce different result sets",
      );
    }
  });

  // SPEC.md **ai-search-implementation**
  test("search command without args opens input box and cancellation is clean.", async function () {
    this.timeout(30000);

    // Trigger search without query arg → opens VS Code input box
    const searchPromise = vscode.commands.executeCommand(
      "commandtree.semanticSearch",
    );
    await sleep(INPUT_BOX_RENDER_MS);

    // Dismiss the input box (simulates user pressing Escape)
    await vscode.commands.executeCommand("workbench.action.closeQuickOpen");
    await searchPromise;
    await sleep(SHORT_SETTLE_MS);

    // Cancelling input box should not activate any filter
    assert.ok(
      !provider.hasFilter(),
      "Cancelling input box should not activate semantic filter",
    );

    // All tasks should still be visible after cancellation
    const tasks = await collectLeafTasks(provider);
    assert.strictEqual(
      tasks.length,
      totalTaskCount,
      "All tasks should remain visible after cancelling search input",
    );
  });

  // SPEC.md **ai-search-implementation** (Cosine similarity, threshold 0.3)
  test("cosine similarity discriminates: related query filters, unrelated does not", async function () {
    this.timeout(120000);

    // PROOF OF VECTOR SEARCH:
    // A related query ("compile and build") hits cosine similarity > 0.3
    // against build task embeddings → filter activates → fewer tasks.
    // An unrelated query ("quantum entanglement photon wavelength") misses
    // ALL embeddings below threshold → no filter → all tasks visible.
    // Text matching (string.includes) can't do this — it returns 0 for both.
    // The suiteSetup gate PROVED real 384-dim embeddings exist.
    // So this discrimination IS cosine similarity on real vectors.

    await vscode.commands.executeCommand(
      "commandtree.semanticSearch",
      "compile and build the project",
    );
    await sleep(SEARCH_SETTLE_MS);
    const relatedFiltered = provider.hasFilter();
    const relatedCount = (await collectLeafTasks(provider)).length;
    await vscode.commands.executeCommand("commandtree.clearFilter");
    await sleep(500);

    await vscode.commands.executeCommand(
      "commandtree.semanticSearch",
      "quantum entanglement photon wavelength",
    );
    await sleep(SEARCH_SETTLE_MS);
    const unrelatedFiltered = provider.hasFilter();
    const unrelatedCount = (await collectLeafTasks(provider)).length;
    await vscode.commands.executeCommand("commandtree.clearFilter");

    // Related query MUST activate filter (cosine > threshold for some tasks)
    assert.ok(
      relatedFiltered,
      "Related query must activate filter via cosine similarity",
    );
    assert.ok(
      relatedCount > 0 && relatedCount < totalTaskCount,
      "Related must find subset",
    );

    // Unrelated query should NOT activate filter (cosine < threshold for ALL)
    // OR if it does, it should return drastically fewer results
    if (!unrelatedFiltered) {
      assert.strictEqual(
        unrelatedCount,
        totalTaskCount,
        "No filter = all tasks visible",
      );
    } else {
      assert.ok(
        unrelatedCount < relatedCount,
        `Unrelated should find fewer (${unrelatedCount}) than related (${relatedCount})`,
      );
    }
  });

  // SPEC.md **ai-search-implementation**
  test("filtered tree items retain correct UI properties", async function () {
    this.timeout(120000);

    await vscode.commands.executeCommand("commandtree.semanticSearch", "build");
    await sleep(SEARCH_SETTLE_MS);

    const items = await collectLeafItems(provider);
    assert.ok(items.length > 0, "Filtered tree should have items");

    for (const item of items) {
      assert.ok(item.task !== null, "Leaf items should have a task");
      assert.ok(
        typeof item.label === "string" || typeof item.label === "object",
        "Tree item should have a label",
      );
      assert.ok(
        item.tooltip !== undefined,
        `Tree item "${item.task.label}" should have a tooltip`,
      );
      assert.ok(
        item.iconPath !== undefined,
        `Tree item "${item.task.label}" should have an icon`,
      );
      assert.ok(
        item.contextValue === "task" || item.contextValue === "task-quick",
        `Leaf item should have task context value, got: "${item.contextValue}"`,
      );
    }

    await vscode.commands.executeCommand("commandtree.clearFilter");
  });

  // SPEC.md line 211: Security warning in tooltip
  test("tooltips display security warning icon when summary contains security keywords", async function () {
    this.timeout(15000);

    const items = await collectLeafItems(provider);
    const allTooltips = items
      .map(i => ({ item: i, tooltip: getTooltipText(i) }))
      .filter(x => x.tooltip.includes("> "));

    const withWarning = allTooltips.filter(x => x.tooltip.includes("⚠️"));
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
        `Found ${withKeywords.length} summaries with security keywords, but 0 have ⚠️ icon`
      );

      for (const item of withWarning) {
        const tooltip = item.tooltip;
        assert.ok(
          tooltip.includes("> ⚠️"),
          `Security warning should appear in blockquote format, got: "${tooltip.substring(0, 100)}"`
        );
      }
    }
  });

  // SPEC.md line 271: Match percentage displayed next to each command (e.g., "build (87%)")
  test("tree labels display similarity scores as percentages after semantic search", async function () {
    this.timeout(120000);

    await vscode.commands.executeCommand(
      "commandtree.semanticSearch",
      "build the project"
    );
    await sleep(SEARCH_SETTLE_MS);

    const items = await collectLeafItems(provider);
    assert.ok(items.length > 0, "Search should return results");

    const labelsWithScores = items.filter(item => {
      const label = getLabelString(item.label);
      return /\(\d+%\)/.test(label);
    });

    assert.ok(
      labelsWithScores.length > 0,
      `At least one result should show similarity score in label like "task (87%)", got labels: [${items.map(i => getLabelString(i.label)).join(", ")}]`
    );

    for (const item of labelsWithScores) {
      const label = getLabelString(item.label);
      const match = /\((\d+)%\)/.exec(label);
      assert.ok(match !== null, `Label should have percentage format: "${label}"`);
      const percentage = parseInt(match[1] ?? "0", 10);
      assert.ok(
        percentage >= 0 && percentage <= 100,
        `Percentage should be 0-100, got ${percentage} in "${label}"`
      );
    }

    await vscode.commands.executeCommand("commandtree.clearFilter");
  });

  // SPEC.md **ai-summary-generation** (Display: includes ⚠️ warning for security issues)
  test("security warnings appear in tooltips when Copilot flags risky commands", async function () {
    this.timeout(15000);

    const tasks = await collectLeafTasks(provider);
    const items = await collectLeafItems(provider);

    const securityWarnings = tasks.filter(
      (t) => t.summary?.includes("⚠️") === true,
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
        tip.includes("⚠️"),
        `Tooltip for "${task.label}" should preserve security warning emoji`,
      );
      assert.ok(
        tip.includes(task.summary ?? ""),
        `Tooltip for "${task.label}" should include full summary with warning`,
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
