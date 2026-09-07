// The auto-merge policy engine, published for other packs: the verdict a
// `automerge` declaration compiles to, and the merge-rules.json compiler, so
// a pack's own tests can assert its policies and declared rules against the same
// evaluator the landing lane and the automerge-policy-scope gate apply.
export * from '../src/contract/merge-policy.mjs';
// The diff reader moved to the command that runs it (a world edge has no place in
// the contract), but the published surface is an address, not a layout.
export { diffEntries } from '../src/session/merge-policy-run.mjs';
