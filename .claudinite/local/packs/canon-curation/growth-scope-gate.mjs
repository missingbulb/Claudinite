// The canon repo's CI entrypoint for the growth write-surface gate. The rule —
// a growth run (a "Claudinite growth:" commit) writes only the repo's own local
// packs — is pack-owned (packs/claudinite-growth/growth-write-scope.mjs, so
// consumers get it at their Stop hook), but core CI must not name a specific
// pack (the barriers rule), so this home-side local pack owns the invocation —
// exactly as promote-scope.mjs owns the promote gate. Self-gating on the pinned
// commit prefix, so CI runs it on every PR; it exits 0 in ~no time on a
// non-growth branch. In the home checkout the canon packs/ tree is the repo's
// own tracked code, so the cross-tree import is inherent, not a vendored-set
// coupling.
import { runCli } from '../../../../packs/claudinite-growth/growth-write-scope.mjs';

runCli(process.argv[2] || process.cwd());
