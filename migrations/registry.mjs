// COMPATIBILITY RE-EXPORT — the registry moved to engine/migrations/registry.mjs
// with the engine/pack split. Same reason as the applier beside it: a member's
// vendored baselining worker imports this path out of the canon clone it just
// fetched, and that worker is only as new as the member's last converge. Retires
// with it, in Phase 5.
export * from '../engine/migrations/registry.mjs';
