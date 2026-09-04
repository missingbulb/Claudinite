// This repo's CI entrypoint for the promote write-surface gate. The rule — a
// growth-promote run writes only under the canon's corpus roots — is pack-owned
// (packs/claudinite-canon-curation/promote-scope.mjs, so every canon that declares the
// pack carries it), but core CI must not name a specific pack (the barrier rule),
// so this home-side local pack owns the invocation — exactly as growth-scope-gate.mjs
// owns the growth gate. CI keys the step on the promote branch prefix; nothing in a
// tree marks a diff as a promote run, so the gate cannot self-gate.
import { runCli } from '../../../../packs/claudinite-canon-curation/promote-scope.mjs';

runCli(process.argv[2] || process.cwd());
