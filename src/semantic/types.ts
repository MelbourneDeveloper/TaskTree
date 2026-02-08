/**
 * Re-exports the canonical types used across the semantic search feature.
 * Other modules in src/semantic/ define their own specific interfaces;
 * this file provides shared type aliases and any cross-cutting types.
 */

export type { SummaryRecord, SummaryStoreData } from './store';
