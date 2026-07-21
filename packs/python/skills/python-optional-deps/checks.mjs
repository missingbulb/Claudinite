import optionalImportTopLevel from './optional-import-lazy.mjs';
import optionalImportInstallHint from './optional-import-install-hint.mjs';

// The check-the-work rules validating this skill's action — wiring a Python
// package's optional heavy/native dependency. Discovered by skills/registry.mjs
// and run at every Stop and in CI; each is inert until the repo declares
// optional dependencies in a pyproject.toml (its RELEVANCE FIRST gate). The
// failure messages carry the rules — there is deliberately no prose copy to
// drift from. The residue that has no false-positive-free signature (which deps
// belong in the base set, the stdlib-backend architecture, the F401
// availability-probe suppression) stays as prose in the python pack's RULES.md.
export default [optionalImportTopLevel, optionalImportInstallHint];
