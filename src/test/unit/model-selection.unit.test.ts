/**
 * Unit tests for model selection logic (resolveModel).
 * Proves that:
 * 1. When a saved model ID exists, that exact model is returned
 * 2. When user picks from quickpick, the ID is saved to settings
 * 3. When no models available, returns error
 * 4. When user cancels quickpick, returns error
 */
import * as assert from 'assert';
import { resolveModel } from '../../semantic/modelSelection';
import type { ModelSelectionDeps, ModelRef } from '../../semantic/modelSelection';

const HAIKU: ModelRef = { id: 'claude-haiku-4.5', name: 'Claude Haiku 4.5' };
const OPUS: ModelRef = { id: 'claude-opus-4.6', name: 'Claude Opus 4.6' };
const ALL_MODELS: readonly ModelRef[] = [OPUS, HAIKU];

function makeDeps(overrides: Partial<ModelSelectionDeps>): ModelSelectionDeps {
    return {
        getSavedId: () => '',
        fetchById: async () => [],
        fetchAll: async () => ALL_MODELS,
        promptUser: async () => undefined,
        saveId: async () => { /* noop */ },
        ...overrides
    };
}

suite('Model Selection (resolveModel)', () => {

    test('returns saved model when setting matches', async () => {
        const deps = makeDeps({
            getSavedId: () => HAIKU.id,
            fetchById: async (id) => id === HAIKU.id ? [HAIKU] : []
        });

        const result = await resolveModel(deps);

        assert.ok(result.ok, 'Expected ok result');
        assert.strictEqual(result.value.id, HAIKU.id);
        assert.strictEqual(result.value.name, HAIKU.name);
    });

    test('does NOT call fetchAll when saved model found', async () => {
        let fetchAllCalled = false;
        const deps = makeDeps({
            getSavedId: () => HAIKU.id,
            fetchById: async () => [HAIKU],
            fetchAll: async () => { fetchAllCalled = true; return ALL_MODELS; }
        });

        await resolveModel(deps);

        assert.strictEqual(fetchAllCalled, false, 'fetchAll should not be called when saved model exists');
    });

    test('does NOT call promptUser when saved model found', async () => {
        let promptCalled = false;
        const deps = makeDeps({
            getSavedId: () => HAIKU.id,
            fetchById: async () => [HAIKU],
            promptUser: async () => { promptCalled = true; return HAIKU; }
        });

        await resolveModel(deps);

        assert.strictEqual(promptCalled, false, 'promptUser should not be called when saved model exists');
    });

    test('prompts user when no saved setting', async () => {
        let promptedModels: readonly ModelRef[] = [];
        const deps = makeDeps({
            getSavedId: () => '',
            fetchAll: async () => ALL_MODELS,
            promptUser: async (models) => { promptedModels = models; return HAIKU; },
            saveId: async () => { /* noop */ }
        });

        const result = await resolveModel(deps);

        assert.ok(result.ok, 'Expected ok result');
        assert.strictEqual(result.value.id, HAIKU.id);
        assert.strictEqual(promptedModels.length, ALL_MODELS.length);
    });

    test('saves picked model ID to settings', async () => {
        let savedId = '';
        const deps = makeDeps({
            getSavedId: () => '',
            fetchAll: async () => ALL_MODELS,
            promptUser: async () => HAIKU,
            saveId: async (id) => { savedId = id; }
        });

        await resolveModel(deps);

        assert.strictEqual(savedId, HAIKU.id, 'Must save the picked model ID');
    });

    test('returns error when no models available', async () => {
        const deps = makeDeps({
            getSavedId: () => '',
            fetchAll: async () => []
        });

        const result = await resolveModel(deps);

        assert.ok(!result.ok, 'Expected error result');
    });

    test('returns error when user cancels quickpick', async () => {
        const deps = makeDeps({
            getSavedId: () => '',
            fetchAll: async () => ALL_MODELS,
            promptUser: async () => undefined
        });

        const result = await resolveModel(deps);

        assert.ok(!result.ok, 'Expected error result');
    });

    test('falls back to prompt when saved model ID not found', async () => {
        let promptCalled = false;
        const deps = makeDeps({
            getSavedId: () => 'nonexistent-model',
            fetchById: async () => [],
            fetchAll: async () => ALL_MODELS,
            promptUser: async () => { promptCalled = true; return HAIKU; },
            saveId: async () => { /* noop */ }
        });

        const result = await resolveModel(deps);

        assert.ok(result.ok, 'Expected ok result');
        assert.strictEqual(promptCalled, true, 'Should prompt when saved model not found');
        assert.strictEqual(result.value.id, HAIKU.id);
    });
});
