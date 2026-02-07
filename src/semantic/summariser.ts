import * as vscode from 'vscode';
import type { Result } from '../models/TaskItem';
import { ok, err } from '../models/TaskItem';
import { logger } from '../utils/logger';

const MAX_CONTENT_LENGTH = 4000;
const FALLBACK_DETAIL_LENGTH = 100;
const MODEL_RETRY_COUNT = 10;
const MODEL_RETRY_DELAY_MS = 2000;

/**
 * Waits for a delay (used for retry backoff).
 */
async function delay(ms: number): Promise<void> {
    await new Promise<void>(resolve => { setTimeout(resolve, ms); });
}

/**
 * Attempts to select a Copilot model once.
 */
async function trySelectModel(): Promise<vscode.LanguageModelChat | null> {
    const models = await vscode.lm.selectChatModels({ vendor: 'copilot' });
    return models[0] ?? null;
}

/**
 * Selects a Copilot chat model for summarisation.
 * Retries to allow Copilot time to initialise after VS Code starts.
 */
export async function selectCopilotModel(): Promise<Result<vscode.LanguageModelChat, string>> {
    for (let attempt = 0; attempt < MODEL_RETRY_COUNT; attempt++) {
        try {
            const model = await trySelectModel();
            if (model !== null) {
                logger.info('Selected Copilot model', { id: model.id, name: model.name });
                return ok(model);
            }
            logger.info('Copilot not ready, retrying', { attempt });
        } catch (e) {
            const msg = e instanceof Error ? e.message : 'Unknown';
            logger.warn('Model selection error', { attempt, error: msg });
        }
        if (attempt < MODEL_RETRY_COUNT - 1) { await delay(MODEL_RETRY_DELAY_MS); }
    }
    return err('No Copilot model available after retries');
}

/**
 * Collects all streamed text chunks into a single string.
 */
async function collectStreamedText(response: vscode.LanguageModelChatResponse): Promise<string> {
    const chunks: string[] = [];
    for await (const chunk of response.text) {
        chunks.push(chunk);
    }
    return chunks.join('').trim();
}

/**
 * Sends a single user message to the model and returns the full response.
 */
async function sendChatRequest(
    model: vscode.LanguageModelChat,
    prompt: string
): Promise<Result<string, string>> {
    try {
        const messages = [vscode.LanguageModelChatMessage.User(prompt)];
        const response = await model.sendRequest(messages, {}, new vscode.CancellationTokenSource().token);
        return ok(await collectStreamedText(response));
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
        `Summarise this ${params.type} command in 1-2 sentences.`,
        `Name: ${params.label}`,
        `Command: ${params.command}`,
        '',
        'Script content:',
        truncated
    ].join('\n');
}

/**
 * Generates a plain-language summary for a script.
 */
export async function summariseScript(params: {
    readonly model: vscode.LanguageModelChat;
    readonly label: string;
    readonly type: string;
    readonly command: string;
    readonly content: string;
}): Promise<Result<string, string>> {
    const prompt = buildSummaryPrompt(params);
    const result = await sendChatRequest(params.model, prompt);

    if (!result.ok) {
        logger.error('Summarisation failed', { label: params.label, error: result.error });
        return result;
    }
    if (result.value === '') {
        return err('Empty summary returned');
    }

    logger.info('Generated summary', { label: params.label, summary: result.value });
    return result;
}

/**
 * Generates a basic summary from script metadata when Copilot is unavailable.
 */
export function buildFallbackSummary(params: {
    readonly label: string;
    readonly type: string;
    readonly command: string;
    readonly content: string;
}): string {
    const lines = params.content.split('\n');
    const first = lines.find(
        l => l.trim().length > 0 && !l.startsWith('#!')
    ) ?? '';
    const detail = first.trim().substring(0, FALLBACK_DETAIL_LENGTH);
    const base = `${params.type} command "${params.label}": ${params.command}`;
    return detail.length > 0 ? `${base}. ${detail}` : base;
}

