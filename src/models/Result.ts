/**
 * Success variant of Result.
 */
export interface Ok<T> {
    readonly ok: true;
    readonly value: T;
}

/**
 * Error variant of Result.
 */
export interface Err<E> {
    readonly ok: false;
    readonly error: E;
}

/**
 * Result type for operations that can fail.
 * Use instead of throwing errors.
 */
export type Result<T, E> = Ok<T> | Err<E>;

/**
 * Creates a success result.
 */
export function ok<T>(value: T): Ok<T> {
    return { ok: true, value };
}

/**
 * Creates an error result.
 */
export function err<E>(error: E): Err<E> {
    return { ok: false, error };
}
