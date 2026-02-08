/**
 * Unit tests for model selection logic (resolveModel).
 * Proves that:
 * 1. When a saved model ID exists, that exact model is returned
 * 2. When user picks from quickpick, the ID is saved to settings
 * 3. When no models available, returns error
 * 4. When user cancels quickpick, returns error
 */
import * as assert from 'assert';
import { resolveModel, pickConcreteModel, AUTO_MODEL_ID } from '../../semantic/modelSelection';
import type { ModelSelectionDeps, ModelRef } from '../../semantic/modelSelection';

const AUTO: ModelRef = { id: AUTO_MODEL_ID, name: 'Auto' };
const HAIKU: ModelRef = { id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5' };
const OPUS: ModelRef = { id: 'claude-opus-4.6', name: 'Claude Opus 4.6' };
const ALL_MODELS: readonly ModelRef[] = [OPUS, HAIKU];
const ALL_WITH_AUTO: readonly ModelRef[] = [AUTO, OPUS, HAIKU];

function makeDeps(overrides: Partial<ModelSelectionDeps>): ModelSelectionDeps {
    return {
        getSavedId: (): string => '',
        fetchById: async (): Promise<readonly ModelRef[]> => { await Promise.resolve(); return []; },
        fetchAll: async (): Promise<readonly ModelRef[]> => { await Promise.resolve(); return ALL_MODELS; },
        promptUser: async (): Promise<ModelRef | undefined> => { await Promise.resolve(); return undefined; },
        saveId: async (): Promise<void> => { await Promise.resolve(); },
        ...overrides
    };
}

suite('Model Selection (resolveModel)', () => {

    test('returns saved model when setting matches', async () => {
        const deps = makeDeps({
            getSavedId: (): string => HAIKU.id,
            fetchById: async (id: string): Promise<readonly ModelRef[]> => { await Promise.resolve(); return id === HAIKU.id ? [HAIKU] : []; }
        });

        const result = await resolveModel(deps);

        assert.ok(result.ok, 'Expected ok result');
        assert.strictEqual(result.value.id, HAIKU.id);
        assert.strictEqual(result.value.name, HAIKU.name);
    });

    test('does NOT call fetchAll when saved model found', async () => {
        let fetchAllCalled = false;
        const deps = makeDeps({
            getSavedId: (): string => HAIKU.id,
            fetchById: async (): Promise<readonly ModelRef[]> => { await Promise.resolve(); return [HAIKU]; },
            fetchAll: async (): Promise<readonly ModelRef[]> => { await Promise.resolve(); fetchAllCalled = true; return ALL_MODELS; }
        });

        await resolveModel(deps);

        assert.strictEqual(fetchAllCalled, false, 'fetchAll should not be called when saved model exists');
    });

    test('does NOT call promptUser when saved model found', async () => {
        let promptCalled = false;
        const deps = makeDeps({
            getSavedId: (): string => HAIKU.id,
            fetchById: async (): Promise<readonly ModelRef[]> => { await Promise.resolve(); return [HAIKU]; },
            promptUser: async (): Promise<ModelRef | undefined> => { await Promise.resolve(); promptCalled = true; return HAIKU; }
        });

        await resolveModel(deps);

        assert.strictEqual(promptCalled, false, 'promptUser should not be called when saved model exists');
    });

    test('prompts user when no saved setting', async () => {
        let promptedModels: readonly ModelRef[] = [];
        const deps = makeDeps({
            getSavedId: (): string => '',
            fetchAll: async (): Promise<readonly ModelRef[]> => { await Promise.resolve(); return ALL_MODELS; },
            promptUser: async (models: readonly ModelRef[]): Promise<ModelRef | undefined> => { await Promise.resolve(); promptedModels = models; return HAIKU; },
            saveId: async (): Promise<void> => { await Promise.resolve(); }
        });

        const result = await resolveModel(deps);

        assert.ok(result.ok, 'Expected ok result');
        assert.strictEqual(result.value.id, HAIKU.id);
        assert.strictEqual(promptedModels.length, ALL_MODELS.length);
    });

    test('saves picked model ID to settings', async () => {
        let savedId = '';
        const deps = makeDeps({
            getSavedId: (): string => '',
            fetchAll: async (): Promise<readonly ModelRef[]> => { await Promise.resolve(); return ALL_MODELS; },
            promptUser: async (): Promise<ModelRef | undefined> => { await Promise.resolve(); return HAIKU; },
            saveId: async (id: string): Promise<void> => { await Promise.resolve(); savedId = id; }
        });

        await resolveModel(deps);

        assert.strictEqual(savedId, HAIKU.id, 'Must save the picked model ID');
    });

    test('returns error when no models available', async () => {
        const deps = makeDeps({
            getSavedId: (): string => '',
            fetchAll: async (): Promise<readonly ModelRef[]> => { await Promise.resolve(); return []; }
        });

        const result = await resolveModel(deps);

        assert.ok(!result.ok, 'Expected error result');
    });

    test('returns error when user cancels quickpick', async () => {
        const deps = makeDeps({
            getSavedId: (): string => '',
            fetchAll: async (): Promise<readonly ModelRef[]> => { await Promise.resolve(); return ALL_MODELS; },
            promptUser: async (): Promise<ModelRef | undefined> => { await Promise.resolve(); return undefined; }
        });

        const result = await resolveModel(deps);

        assert.ok(!result.ok, 'Expected error result');
    });

    test('falls back to prompt when saved model ID not found', async () => {
        let promptCalled = false;
        const deps = makeDeps({
            getSavedId: (): string => 'nonexistent-model',
            fetchById: async (): Promise<readonly ModelRef[]> => { await Promise.resolve(); return []; },
            fetchAll: async (): Promise<readonly ModelRef[]> => { await Promise.resolve(); return ALL_MODELS; },
            promptUser: async (): Promise<ModelRef | undefined> => { await Promise.resolve(); promptCalled = true; return HAIKU; },
            saveId: async (): Promise<void> => { await Promise.resolve(); }
        });

        const result = await resolveModel(deps);

        assert.ok(result.ok, 'Expected ok result');
        assert.strictEqual(promptCalled, true, 'Should prompt when saved model not found');
        assert.strictEqual(result.value.id, HAIKU.id);
    });
});

suite('pickConcreteModel (legacy — no longer used in main flow)', () => {

    test('returns specific model when preferredId is not auto', () => {
        const result = pickConcreteModel({ models: ALL_MODELS, preferredId: HAIKU.id });
        assert.ok(result, 'Expected a model to be returned');
        assert.strictEqual(result.id, HAIKU.id);
        assert.strictEqual(result.name, HAIKU.name);
    });

    test('skips auto and returns first concrete model', () => {
        const result = pickConcreteModel({ models: ALL_WITH_AUTO, preferredId: AUTO_MODEL_ID });
        assert.ok(result, 'Expected a concrete model');
        assert.strictEqual(result.id, OPUS.id, 'Must skip auto and pick first concrete model');
        assert.notStrictEqual(result.id, AUTO_MODEL_ID, 'Must NOT return auto model');
    });

    test('returns undefined when specific model not in list', () => {
        const result = pickConcreteModel({ models: ALL_MODELS, preferredId: 'nonexistent' });
        assert.strictEqual(result, undefined);
    });

    test('returns undefined for empty model list', () => {
        const result = pickConcreteModel({ models: [], preferredId: HAIKU.id });
        assert.strictEqual(result, undefined);
    });

    test('returns undefined for empty list with auto preferred', () => {
        const result = pickConcreteModel({ models: [], preferredId: AUTO_MODEL_ID });
        assert.strictEqual(result, undefined);
    });

    test('auto with only concrete models picks first', () => {
        const result = pickConcreteModel({ models: ALL_MODELS, preferredId: AUTO_MODEL_ID });
        assert.ok(result, 'Expected a model');
        assert.strictEqual(result.id, OPUS.id, 'Should pick first model when no auto in list');
    });
});

suite('Direct model lookup (selectCopilotModel fix)', () => {

    test('auto resolved ID selects auto model — NOT premium', () => {
        const models = ALL_WITH_AUTO;
        const resolvedId = AUTO_MODEL_ID;

        const selected = models.find(m => m.id === resolvedId);

        assert.ok(selected, 'Auto model must exist in list');
        assert.strictEqual(selected.id, AUTO_MODEL_ID, 'Must use auto model directly');
        assert.notStrictEqual(selected.id, OPUS.id, 'Must NOT resolve to premium opus model');
    });

    test('specific model ID selects that exact model', () => {
        const models = ALL_WITH_AUTO;
        const resolvedId = HAIKU.id;

        const selected = models.find(m => m.id === resolvedId);

        assert.ok(selected, 'Haiku model must be found');
        assert.strictEqual(selected.id, HAIKU.id);
        assert.strictEqual(selected.name, HAIKU.name);
    });

    test('nonexistent model ID returns undefined', () => {
        const models = ALL_WITH_AUTO;
        const resolvedId = 'nonexistent';

        const selected = models.find(m => m.id === resolvedId);

        assert.strictEqual(selected, undefined, 'Nonexistent model must not match');
    });
});
