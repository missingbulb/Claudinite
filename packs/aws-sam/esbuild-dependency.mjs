import { finding } from '../../engine/checks_helpers/findings.mjs';

// Converted from the aws-sam pack prose: SAM's esbuild builder runs a
// production-only npm install, so a devDependency esbuild is skipped and the
// build fails with "Cannot find esbuild." Blocking — it breaks the build.
const rule = {
  id: 'aws-sam/esbuild-dependency',
  severity: 'blocking',
  description: 'esbuild must be a regular dependency, not a devDependency, for SAM esbuild builds',
  doc: 'packs/aws-sam/RULES.md',
  why: "SAM's esbuild builder runs a production-only npm install, so a devDependency esbuild is skipped and the build fails",

  run(ctx) {
    const usesEsbuild = ctx.tracked.some((f) => {
      if (!/(^|\/)template\.ya?ml$/.test(f)) return false;
      const t = ctx.read(f);
      return t !== null && /BuildMethod:\s*esbuild/.test(t);
    });
    if (!usesEsbuild) return [];

    // Single-package repos only: with more than one package.json this is a
    // multi-package repo where the SAM function may build from a different
    // manifest, and a root devDependency esbuild for other tooling is legitimate
    // (an adversarial-mining false positive). Skip rather than misfire.
    if (ctx.tracked.filter((f) => f.endsWith('package.json')).length !== 1) return [];

    const pkgText = ctx.read('package.json');
    if (pkgText === null) return [];
    let pkg;
    try { pkg = JSON.parse(pkgText); } catch { return []; }

    const inDev = pkg.devDependencies?.esbuild;
    const inDeps = pkg.dependencies?.esbuild;
    if (inDev && !inDeps) {
      return [finding(rule, {
        file: 'package.json',
        what: 'esbuild is a devDependency, but SAM BuildMethod: esbuild needs it as a regular dependency',
        fix: 'move esbuild into "dependencies" (SAM\'s build runs a production-only npm install), or put it on the runner PATH before `sam build`',
      })];
    }
    return [];
  },
};

export default rule;
