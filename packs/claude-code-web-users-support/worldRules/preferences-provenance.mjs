import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { resolveStore, isUsableIdentity } from '../store.mjs';
// A namespace import, guarded in `run`: the pack and engine lanes deliver on separate
// cadences, and a member whose engine predates the helper must load this pack rather
// than fault on a missing named export.
import * as provenance from '../../../engine/checks/helpers/provenance.mjs';

// A person's preferences are a pack of one reader (the provenance design, #2136): each
// preference is an element, and its file sits BESIDE the store, under
// `<path>-provenance/<email>/`, because the store's own check keeps `<path>/` flat and
// addresses nothing there but `<email>.md`. This check asserts existence only - every
// preference bullet ends with a marker naming a file under that folder - and shares no
// logic with the growth pack beyond the engine's own bullet reader: the grammar of the
// file is judged by the growth tool's `check`, run by the session that edits the
// preference.
//
// ADVISORY, like everything in this pack: the loss is a missing why for a preference,
// never a broken repo. RELEVANCE-FIRST like its siblings: inert unless this repo IS the
// store - only the one repo that holds `<path>/<email>.md` files has anything to judge.
const PACK = 'claude-code-web-users-support';

export const provenanceDirOf = (store) => `${store.path}-provenance`;

const rule = {
  id: 'preferences-provenance',
  severity: 'advisory',
  description: 'Every preference in a store this repo holds ends with a marker naming its provenance file beside the store',
  doc: 'packs/claude-code-web-users-support/RULES.md',
  why: 'a preference with no file has no record of when it was set or what prompted it, and the session that changes it next is the only reader who could have written that down',

  run(ctx) {
    if (typeof provenance.ruleBlocks !== 'function') return []; // an engine that predates the helper
    const { ruleBlocks } = provenance;
    const store = resolveStore(ctx.config.packConfig?.[PACK] ?? null);
    if (!store) return [];
    const prefix = `${store.path}/`;
    const held = (ctx.files ?? []).filter((f) => f.startsWith(prefix) && !f.slice(prefix.length).includes('/') && f.endsWith('.md') && f !== `${prefix}README.md`);
    if (!held.length) return [];
    const out = [];
    for (const file of held) {
      const email = file.slice(prefix.length, -3);
      if (!isUsableIdentity(email)) continue; // store-file-names reports the name
      const dir = `${provenanceDirOf(store)}/${email}`;
      for (const b of ruleBlocks(ctx.read(file) ?? '')) {
        if (!b.slug) {
          out.push(finding(rule, {
            file, line: b.start + 1,
            what: `the preference "${b.trigger}" ends with no marker naming its provenance file`,
            fix: `end it with a slug marker, e.g. (${b.trigger.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').split('-').slice(0, 3).join('-')}), and write that file under ${dir}/ with a born entry saying when the preference was set and what prompted it`,
          }));
        } else if (!ctx.exists(`${dir}/${b.slug}.md`)) {
          out.push(finding(rule, {
            file, line: b.lastLine + 1,
            what: `the preference "${b.trigger}" names ${dir}/${b.slug}.md, which does not exist`,
            fix: `create ${dir}/${b.slug}.md with a born entry, or fix the marker to the file it meant`,
          }));
        }
      }
    }
    return out;
  },
};

export default rule;
