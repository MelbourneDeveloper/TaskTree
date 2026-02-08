/**
 * SPEC: ai-summary-generation
 *
 * GitHub Copilot integration for generating command summaries.
 * Uses VS Code Language Model Tool API for structured output (summary + security warning).
 */
import * as vscode from 'vscode';
import type { Result } from '../models/TaskItem';
import { ok, err } from '../models/TaskItem';
import { logger } from '../utils/logger';
import { resolveModel } from './modelSelection';
import type { ModelSelectionDeps, ModelRef } from './modelSelection';
export type { ModelRef, ModelSelectionDeps } from './modelSelection';
export { resolveModel, AUTO_MODEL_ID } from './modelSelection';

const MAX_CONTENT_LENGTH = 4000;
const MODEL_RETRY_COUNT = 10;
const MODEL_RETRY_DELAY_MS = 2000;

const TOOL_NAME = 'report_command_analysis';

export interface SummaryResult {
    readonly summary: string;
    readonly securityWarning: string;
}

const ANALYSIS_TOOL: vscode.LanguageModelChatTool = {
    name: TOOL_NAME,
    description: 'Report the analysis of a command including summary and any security warnings',
    inputSchema: {
        type: 'object',
        properties: {
            summary: {
                type: 'string',
                description: 'Plain-language summary of the command in 1-2 sentences'
            },
            securityWarning: {
                type: 'string',
                description: 'Security warning if the command has risks (deletes files, writes credentials, modifies system config, runs untrusted code). Empty string if no risks.'
            }
        },
        required: ['summary', 'securityWarning']
    }
};

/**
 * Waits for a delay (used for retry backoff).
 */
async function delay(ms: number): Promise<void> {
    await new Promise<void>(resolve => { setTimeout(resolve, ms); });
}

/**
 * Fetches Copilot models with retry, optionally filtering by ID.
 */
async function fetchModels(
    selector: vscode.LanguageModelChatSelector
): Promise<readonly vscode.LanguageModelChat[]> {
    for (let attempt = 0; attempt < MODEL_RETRY_COUNT; attempt++) {
        try {
            const models = await vscode.lm.selectChatModels(selector);
            if (models.length > 0) { return models; }
            logger.info('Copilot not ready, retrying', { attempt });
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown';
            logger.warn('Model selection error', { attempt, error: msg });
        }
        if (attempt < MODEL_RETRY_COUNT - 1) { await delay(MODEL_RETRY_DELAY_MS); }
    }
    return [];
}

/**
 * Formats model metadata for the quickpick detail line.
 */
function formatModelDetail(m: vscode.LanguageModelChat): string {
    const tokens = `${Math.round(m.maxInputTokens / 1000)}k tokens`;
    const parts = [m.family, m.version, tokens].filter(p => p !== '');
    return parts.join(' · ');
}

/**
 * Shows a quickpick of all available Copilot models with metadata.
 * Returns the chosen model ref, or undefined if cancelled.
 */
async function promptModelPicker(
    models: readonly vscode.LanguageModelChat[]
): Promise<vscode.LanguageModelChat | undefined> {
    const items = models.map(m => ({
        label: m.name,
        description: m.id,
        detail: formatModelDetail(m),
        model: m
    }));
    const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a Copilot model for summarisation',
        title: 'CommandTree: Choose AI Model',
        ignoreFocusOut: true,
        matchOnDetail: true
    });
    return picked?.model;
}

/**
 * Builds the standard ModelSelectionDeps wired to VS Code APIs.
 */
function buildVSCodeDeps(): ModelSelectionDeps {
    const config = vscode.workspace.getConfiguration('commandtree');
    return {
        getSavedId: (): string => config.get<string>('aiModel', ''),
        fetchById: async (id: string): Promise<readonly ModelRef[]> => await fetchModels({ vendor: 'copilot', id }),
        fetchAll: async (): Promise<readonly ModelRef[]> => await fetchModels({ vendor: 'copilot' }),
        promptUser: async (): Promise<ModelRef | undefined> => {
            const all = await fetchModels({ vendor: 'copilot' });
            const picked = await promptModelPicker(all);
            return picked !== undefined ? { id: picked.id, name: picked.name } : undefined;
        },
        saveId: async (id: string): Promise<void> => { await config.update('aiModel', id, vscode.ConfigurationTarget.Global); }
    };
}

/**
 * Selects the configured model by ID, or prompts the user to pick one.
 * When "auto" is selected, uses the Copilot auto model directly.
 */
export async function selectCopilotModel(): Promise<Result<vscode.LanguageModelChat, string>> {
    const result = await resolveModel(buildVSCodeDeps());
    if (!result.ok) { return result; }

    const allModels = await fetchModels({ vendor: 'copilot' });
    if (allModels.length === 0) { return err('No Copilot models available'); }

    const model = allModels.find(m => m.id === result.value.id);
    if (!model) { return err('Selected model no longer available'); }

    logger.info('Resolved model for requests', { selected: result.value.id, resolved: model.id });
    return ok(model);
}

/**
 * Forces the model picker open (ignoring saved setting) and saves the choice.
 * Used by the commandtree.selectModel command.
 */
export async function forceSelectModel(): Promise<Result<string, string>> {
    const all = await fetchModels({ vendor: 'copilot' });
    if (all.length === 0) { return err('No Copilot models available'); }

    const picked = await promptModelPicker(all);
    if (picked === undefined) { return err('Model selection cancelled'); }

    const config = vscode.workspace.getConfiguration('commandtree');
    await config.update('aiModel', picked.id, vscode.ConfigurationTarget.Global);
    logger.info('Model changed via command', { id: picked.id, name: picked.name });
    return ok(picked.name);
}

/**
 * Extracts the tool call result from the LLM response stream.
 */
async function extractToolCall(
    response: vscode.LanguageModelChatResponse
): Promise<SummaryResult | null> {
    for await (const part of response.stream) {
        if (part instanceof vscode.LanguageModelToolCallPart) {
            const input = part.input as Record<string, unknown>;
            const summary = typeof input['summary'] === 'string' ? input['summary'] : '';
            const warning = typeof input['securityWarning'] === 'string' ? input['securityWarning'] : '';
            return { summary, securityWarning: warning };
        }
    }
    return null;
}

/**
 * Sends a chat request with tool calling to get structured output.
 */
async function sendToolRequest(
    model: vscode.LanguageModelChat,
    prompt: string
): Promise<Result<SummaryResult, string>> {
    try {
        logger.info('sendRequest using model', { id: model.id, name: model.name });
        const messages = [vscode.LanguageModelChatMessage.User(prompt)];
        const options: vscode.LanguageModelChatRequestOptions = {
            tools: [ANALYSIS_TOOL],
            toolMode: vscode.LanguageModelChatToolMode.Required
        };
        const response = await model.sendRequest(messages, options, new vscode.CancellationTokenSource().token);
        const result = await extractToolCall(response);
        if (result === null) { return err('No tool call in LLM response'); }
        return ok(result);
    } catch (e) {
        const message = e instanceof Error ? e.message : 'LLM request failed';
        return err(message);
    }
}

/**
 * Builds the prompt for script summarisation.
 */
function buildSummaryPrompt(params: {
    readonly type: string;
    readonly label: string;
    readonly command: string;
    readonly content: string;
}): string {
    const truncated = params.content.length > MAX_CONTENT_LENGTH
        ? params.content.substring(0, MAX_CONTENT_LENGTH)
        : params.content;

    return [
        `Analyse this ${params.type} command. Provide a plain-language summary (1-2 sentences).`,
        `If the command has security risks (writes credentials, deletes files, modifies system config, runs untrusted code, etc.), describe the risk. Otherwise leave securityWarning empty.`,
        `Name: ${params.label}`,
        `Command: ${params.command}`,
        '',
        'Script content:',
        truncated
    ].join('\n');
}

/**
 * Generates a structured summary for a script via Copilot tool calling.
 */
export async function summariseScript(params: {
    readonly model: vscode.LanguageModelChat;
    readonly label: string;
    readonly type: string;
    readonly command: string;
    readonly content: string;
}): Promise<Result<SummaryResult, string>> {
    const prompt = buildSummaryPrompt(params);
    const result = await sendToolRequest(params.model, prompt);

    if (!result.ok) {
        logger.error('Summarisation failed', { label: params.label, error: result.error });
        return result;
    }
    if (result.value.summary === '') {
        return err('Empty summary returned');
    }

    logger.info('Generated summary', {
        label: params.label,
        summary: result.value.summary,
        hasWarning: result.value.securityWarning !== ''
    });
    return result;
}

/**
 * NO FALLBACK SUMMARIES.
 * Every summary MUST come from a real LLM (Copilot).
 * Fake metadata strings let tests pass without exercising the real pipeline.
 * If Copilot is unavailable, summarisation MUST fail — not silently degrade.
 */
