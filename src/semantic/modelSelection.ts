/**
 * Pure model selection logic — no vscode dependency.
 * Testable outside of the VS Code extension host.
 */

/** Inline Result type to avoid importing TaskItem (which depends on vscode). */
type Result<T, E> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };
const ok = <T>(value: T): Result<T, never> => ({ ok: true, value });
const err = <E>(error: E): Result<never, E> => ({ ok: false, error });

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
 * Pure model selection logic. Uses saved setting if available,
 * otherwise prompts user and persists the choice.
 */
export async function resolveModel(
    deps: ModelSelectionDeps
): Promise<Result<ModelRef, string>> {
    const savedId = deps.getSavedId();

    if (savedId !== '') {
        const exact = await deps.fetchById(savedId);
        if (exact.length > 0) { return ok(exact[0]!); }
    }

    const allModels = await deps.fetchAll();
    if (allModels.length === 0) { return err('No Copilot model available after retries'); }

    const picked = await deps.promptUser(allModels);
    if (picked === undefined) { return err('Model selection cancelled'); }

    await deps.saveId(picked.id);
    return ok(picked);
}
