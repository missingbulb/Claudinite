import { finding } from '../../engine/checks/helpers/findings.mjs';

// Every pack declares where its own boundary is: `routing: { belongs, excludes }`
// on the `pack.mjs` default export (packs/README.md). The pair is what a session
// reads — the loader emits it as a routing table at session start — when it holds
// a piece of content and must decide WHICH pack owns it. Undeclared, that decision
// falls back to "put it in basics", which is how the baseline pack accretes every
// technology's and platform's material.
//
// RELEVANCE FIRST (engine/checks/README.md): keyed on a `pack.mjs` in the sweep,
// so the work scope fires only when a pack manifest is actually touched, and the
// world sweep (CI) is what holds the whole corpus to it. Inert on a repo with no
// packs of its own. Static text over the manifest — the same read-don't-import
// posture as task-declaration-shape, and enough for two string literals.
const PACK_MJS = /(^|\/)(packs|local_packs)\/[^/]+\/pack\.mjs$/;

// The routing strings are a SESSION-CONTEXT budget, not a style preference: the
// table carries one row per pack, so a paragraph in any one row costs every
// session that loads it. Twenty words is enough for a boundary and a pointer to
// the pack that owns the other side.
export const MAX_ROUTING_WORDS = 20;

// A `key: 'value'` string on the manifest — either quote style, non-greedy so an
// adjacent field can't be swallowed. Returns null when the field is absent.
const strField = (text, key) => {
  const m = new RegExp(`\\b${key}:\\s*(['"])([\\s\\S]*?)\\1`).exec(text);
  return m ? m[2] : null;
};

const wordCount = (s) => s.trim().split(/\s+/).filter(Boolean).length;

const rule = {
  id: 'pack-routing-declared',
  severity: 'blocking',
  description: 'Every pack.mjs declares routing: { belongs, excludes }, each at most 20 words',
  doc: 'packs/README.md',
  why: 'a pack that never says what it is not becomes the place content lands by default; the belongs/excludes pair is what routes a doc, rule or skill to its real owner instead of into the baseline pack',

  run(ctx) {
    const out = [];
    for (const file of ctx.files.filter((f) => PACK_MJS.test(f))) {
      const text = ctx.read(file);
      if (text === null) continue;
      const flag = (what, fix) => out.push(finding(rule, { file, what, fix }));

      if (!/\brouting:\s*\{/.test(text)) {
        flag(
          'declares no "routing" object',
          'add routing: { belongs: "<what content belongs here>", excludes: "<what does not, and which pack owns it>" }'
        );
        continue;
      }
      for (const key of ['belongs', 'excludes']) {
        const value = strField(text, key);
        if (value === null) {
          flag(`"routing" declares no string "${key}"`, `add routing.${key}: a phrase of at most ${MAX_ROUTING_WORDS} words`);
          continue;
        }
        if (!value.trim()) {
          flag(`routing.${key} is empty`, `state ${key === 'belongs' ? 'the kind of content this pack owns' : 'what belongs elsewhere, and which pack owns it'}`);
          continue;
        }
        const n = wordCount(value);
        if (n > MAX_ROUTING_WORDS) {
          flag(
            `routing.${key} is ${n} words, over the ${MAX_ROUTING_WORDS}-word cap`,
            `cut it to ${MAX_ROUTING_WORDS} words — it is one row of a table every session loads`
          );
        }
      }
    }
    return out;
  },
};

export default rule;
