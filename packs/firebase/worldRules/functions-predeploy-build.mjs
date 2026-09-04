import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { functionsCodebases } from '../lib.mjs';

// The predeploy build hook, so a deploy can never ship stale JS. The relevance gate is the build step itself — a codebase whose
// package.json declares no `build` script compiles nothing, so it has no stale
// output to ship and the rule does not apply to it.

const hasHook = (value) =>
  (typeof value === 'string' && value.trim())
  || (Array.isArray(value) && value.some((c) => typeof c === 'string' && c.trim()));

const rule = {
  id: 'firebase/functions-predeploy-build',
  severity: 'blocking',
  description: 'A Firebase functions codebase with a build script wires that build as a firebase.json predeploy hook',
  doc: 'packs/firebase/skills/firebase-functions/SKILL.md',
  why: 'without the hook a deploy ships whatever compiled output happens to be on disk — a local `firebase deploy` after an edit silently publishes the previous build',

  run(ctx) {
    const out = [];
    for (const { configFile, entry, source, manifest } of functionsCodebases(ctx)) {
      if (!manifest.scripts?.build) continue;
      if (hasHook(entry.predeploy)) continue;
      out.push(finding(rule, {
        file: configFile,
        what: `the "${source}" functions codebase declares a build script but no predeploy hook`,
        fix: `add "predeploy": ["npm --prefix ${source} run build"] to that functions entry in ${configFile}`,
      }));
    }
    return out;
  },
};

export default rule;
