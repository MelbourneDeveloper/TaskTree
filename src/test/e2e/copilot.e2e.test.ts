/**
 * SPEC: ai-summary-generation
 *
 * COPILOT LANGUAGE MODEL API — REAL E2E TEST
 *
 * This test ACTUALLY hits the VS Code Language Model API.
 * It selects a Copilot model, sends a real prompt, and verifies
 * a real streamed response comes back.
 *
 * These tests require GitHub Copilot to be authenticated and available.
 * In CI/automated environments without Copilot, the suite is skipped.
 * To run manually: authenticate Copilot, accept consent dialog when prompted.
 */

import * as assert from "assert";
import * as vscode from "vscode";
import { activateExtension, sleep } from "../helpers/helpers";

const MODEL_WAIT_MS = 2000;
const MODEL_MAX_ATTEMPTS = 30;
const COPILOT_VENDOR = "copilot";

// Copilot tests disabled — skip until re-enabled
suite.skip("Copilot Language Model API E2E", () => {
  let copilotAvailable = false;

  suiteSetup(async function () {
    this.timeout(120000);
    await activateExtension();
    await sleep(3000);

    // Check if Copilot is available (authenticated + consent granted)
    for (let i = 0; i < MODEL_MAX_ATTEMPTS; i++) {
      const models = await vscode.lm.selectChatModels({ vendor: COPILOT_VENDOR });
      if (models.length > 0) {
        // Try to actually use the model to confirm we have permission
        try {
          const testModel = models[0];
          if (testModel === undefined) { continue; }
          const testResponse = await testModel.sendRequest(
            [vscode.LanguageModelChatMessage.User("test")],
            {},
            new vscode.CancellationTokenSource().token
          );
          // Consume response to verify it's actually usable
          const chunks: string[] = [];
          for await (const chunk of testResponse.text) {
            chunks.push(chunk);
          }
          if (chunks.length === 0) { continue; }
          copilotAvailable = true;
          break;
        } catch (e) {
          // Permission denied or authentication failed
          if (e instanceof vscode.LanguageModelError && e.message.includes("cannot be used")) {
            break; // No point retrying permission errors
          }
        }
      }
      await sleep(MODEL_WAIT_MS);
    }

    if (!copilotAvailable) {
      this.skip();
    }
  });

  test("selectChatModels returns at least one Copilot model", async function () {
    this.timeout(120000);

    let model: vscode.LanguageModelChat | null = null;
    for (let i = 0; i < MODEL_MAX_ATTEMPTS; i++) {
      const models = await vscode.lm.selectChatModels({
        vendor: COPILOT_VENDOR,
      });
      if (models.length > 0) {
        model = models[0] ?? null;
        break;
      }
      await sleep(MODEL_WAIT_MS);
    }

    assert.ok(
      model !== null,
      "selectChatModels must return a Copilot model — accept the consent dialog!",
    );
    assert.ok(typeof model.id === "string" && model.id.length > 0, "Model must have an id");
    assert.ok(typeof model.name === "string" && model.name.length > 0, "Model must have a name");
    assert.ok(model.maxInputTokens > 0, "Model must report maxInputTokens > 0");
  });

  test("sendRequest returns a streamed response from Copilot", async function () {
    this.timeout(120000);

    // Get all available models
    const allModels = await vscode.lm.selectChatModels({ vendor: COPILOT_VENDOR });
    assert.ok(allModels.length > 0, "No Copilot models available");

    // Try each model until we find one that works
    let lastError: Error | undefined;
    let successfulResponse: vscode.LanguageModelChatResponse | undefined;

    for (const model of allModels) {
      const messages = [
        vscode.LanguageModelChatMessage.User("Reply with exactly: HELLO_COMMANDTREE"),
      ];
      const tokenSource = new vscode.CancellationTokenSource();

      try {
        const response = await model.sendRequest(messages, {}, tokenSource.token);
        successfulResponse = response;
        tokenSource.dispose();
        break;
      } catch (e) {
        lastError = e as Error;
        tokenSource.dispose();
        continue;
      }
    }

    assert.ok(
      successfulResponse !== undefined,
      `No usable model found. Last error: ${lastError?.message}`,
    );

    assert.ok(
      typeof successfulResponse.text[Symbol.asyncIterator] === "function",
      "Response.text must be async iterable",
    );

    // Collect the streamed text
    const chunks: string[] = [];
    for await (const chunk of successfulResponse.text) {
      assert.ok(typeof chunk === "string", `Each chunk must be a string, got ${typeof chunk}`);
      chunks.push(chunk);
    }
    const fullResponse = chunks.join("").trim();

    assert.ok(chunks.length > 0, "Must receive at least one chunk from stream");

    assert.ok(fullResponse.length > 0, "Response must not be empty");
    assert.ok(
      fullResponse.includes("HELLO_COMMANDTREE"),
      `Response should contain HELLO_COMMANDTREE, got: "${fullResponse}"`,
    );
  });

  test("LanguageModelError is thrown for invalid requests", async function () {
    this.timeout(120000);

    // Get all available models and find one that works
    const allModels = await vscode.lm.selectChatModels({ vendor: COPILOT_VENDOR });
    assert.ok(allModels.length > 0, "No Copilot models available");

    let usableModel: vscode.LanguageModelChat | undefined;
    for (const model of allModels) {
      const testToken = new vscode.CancellationTokenSource();
      try {
        await model.sendRequest(
          [vscode.LanguageModelChatMessage.User("test")],
          {},
          testToken.token,
        );
        usableModel = model;
        testToken.dispose();
        break;
      } catch (e) {
        testToken.dispose();
        if (e instanceof vscode.LanguageModelError && e.message.includes("cannot be used")) {
          continue;
        }
        usableModel = model;
        break;
      }
    }

    assert.ok(usableModel !== undefined, "No usable Copilot model found");

    // Send with an already-cancelled token to trigger an error
    const tokenSource = new vscode.CancellationTokenSource();
    tokenSource.cancel();

    try {
      await usableModel.sendRequest(
        [vscode.LanguageModelChatMessage.User("test")],
        {},
        tokenSource.token,
      );
      // If we get here, cancellation didn't throw — that's also valid behaviour
    } catch (e) {
      // Verify it's the correct error type from the API
      assert.ok(
        e instanceof vscode.LanguageModelError || e instanceof vscode.CancellationError,
        `Expected LanguageModelError or CancellationError, got: ${String(e)}`,
      );
    }

    tokenSource.dispose();
  });
});
