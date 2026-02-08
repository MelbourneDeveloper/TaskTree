/**
 * Pure model selection logic — no vscode dependency.
 * Testable outside of the VS Code extension host.
 */

/** Inline Result type to avoid importing TaskItem (which depends on vscode). */
type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };
const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

/** The "Auto" virtual model ID — not a real endpoint. */
export const AUTO_MODEL_ID = 'auto';

/** Minimal model reference for selection logic. */
export interface ModelRef {
    readonly id: string;
    readonly name: string;
}

/** Dependencies injected into model selection for testability. */
export interface ModelSelectionDeps {
    readonly getSavedId: () => string;
    readonly fetchById: (id: string) => Promise<readonly ModelRef[]>;
    readonly fetchAll: () => Promise<readonly ModelRef[]>;
    readonly promptUser: (models: readonly ModelRef[]) => Promise<ModelRef | undefined>;
    readonly saveId: (id: string) => Promise<void>;
}

/**
 * Resolves a concrete (non-auto) model from a list.
 * When preferredId is "auto", picks the first non-auto model.
 * When preferredId is specific, finds that exact model.
 */
export function pickConcreteModel(params: {
    readonly models: readonly ModelRef[];
    readonly preferredId: string;
}): ModelRef | undefined {
    if (params.preferredId === AUTO_MODEL_ID) {
        return params.models.find(m => m.id !== AUTO_MODEL_ID)
            ?? params.models[0];
    }
    return params.models.find(m => m.id === params.preferredId);
}

/**
 * Pure model selection logic. Uses saved setting if available,
 * otherwise prompts user and persists the choice.
 */
export async function resolveModel(
    deps: ModelSelectionDeps
): Promise<Result<ModelRef, string>> {
    const savedId = deps.getSavedId();

    if (savedId !== '') {
        const exact = await deps.fetchById(savedId);
        const first = exact[0];
        if (first !== undefined) { return ok(first); }
    }

    const allModels = await deps.fetchAll();
    if (allModels.length === 0) { return err('No Copilot model available after retries'); }

    const picked = await deps.promptUser(allModels);
    if (picked === undefined) { return err('Model selection cancelled'); }

    await deps.saveId(picked.id);
    return ok(picked);
}
