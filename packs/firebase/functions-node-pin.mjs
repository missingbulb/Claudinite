import { finding } from '../../engine/checks/helpers/findings.mjs';
import { functionsCodebases } from './lib.mjs';

// RULES.md §4: "Functions engines pin the Node major (engines.node) matching CI
// and local dev." Whether the pinned major MATCHES CI is judgment about the
// project's own toolchain and stays prose; that a deployed functions package
// pins one at all is a static signature in the artifact, so it converts.

const rule = {
  id: 'firebase/functions-node-pin',
  severity: 'blocking',
  description: 'A deployed Firebase functions package pins its Node major in engines.node',
  doc: 'packs/firebase/RULES.md',
  why: 'without a pin the deployed runtime is whatever Firebase defaults to today, and a skew between build and runtime surfaces as a deploy-time module crash rather than a test failure',

  run(ctx) {
    const out = [];
    for (const { configFile, source, manifestPath, manifest } of functionsCodebases(ctx)) {
      const node = manifest.engines?.node;
      if (typeof node === 'string' && node.trim()) continue;
      out.push(finding(rule, {
        file: manifestPath,
        what: `the "${source}" functions codebase (declared in ${configFile}) declares no engines.node`,
        fix: 'add "engines": { "node": "<major>" } naming the major CI and local dev already run',
      }));
    }
    return out;
  },
};

export default rule;
