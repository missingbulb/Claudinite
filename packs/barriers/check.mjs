import { normalizeEdges, barrierFindings, specFinding, DEFAULT_DOC } from './engine.mjs';

// The project-declared barrier check: a repo states its folder-access graph in
// .claudinite-checks.json under `packConfig.barriers.rules`, and this enforces
// it. (A pack that ships a *fixed* barrier uses engine.js `defineBarrier`
// instead and adds it to its own `rules`.)
const rule = {
  id: 'barrier',
  severity: 'blocking',
  doc: DEFAULT_DOC,
  description: 'Folders must not reference across a declared barrier (packConfig.barriers)',
  why: 'a declared folder barrier encodes an architectural boundary; a crossing reference erodes it silently',

  run(ctx) {
    const cfg = ctx.config?.packConfig?.barriers;
    if (cfg === undefined || cfg === null) return []; // declared but unconfigured — nothing to enforce
    if (typeof cfg !== 'object' || Array.isArray(cfg) || !('rules' in cfg)) {
      return [specFinding(rule, {
        what: 'packConfig.barriers must be an object with a "rules" array',
        fix: 'set { "packConfig": { "barriers": { "rules": [ { "from": "...", "to": "..." } ] } } }',
      })];
    }
    const { edges, errors } = normalizeEdges(cfg.rules);
    const out = errors.map((e) => specFinding(rule, e));
    out.push(...barrierFindings(ctx, edges, rule));
    return out;
  },
};

export default rule;
