// The work-item vocabulary, published for other packs: the title grammar that IS a
// work item's identity, the outcome/status decode over its labels (every legacy
// spelling included), lease state, and the dispatch vocabulary items are minted from.
// Re-exported rather than reimplemented so a consumer and the queue can never disagree
// about what a title means.
export * from '../src/items/work-item.mjs';
export { isQueueItem } from '../src/items/work-item.mjs';
export * from '../src/items/leases.mjs';
export * from '../src/session/dispatch.mjs';
