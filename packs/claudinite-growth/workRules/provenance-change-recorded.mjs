import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { commentOnly } from '../../../engine/checks/helpers/code-scanning.mjs';
// A namespace import, guarded in `run`: the pack and engine lanes deliver on separate
// cadences, and a member whose engine predates the helper must load this pack rather
// than fault on a missing named export.
import * as provenance from '../../../engine/checks/helpers/provenance.mjs';

// THE WORK HALF of the provenance convention (the provenance design, #2136): a change
// that alters a carrier's decision-bearing text carries the entry that records the
// decision, on the file the carrier names, in the same change. The skill says append;
// this says it again at the Stop hook when the session did not.
//
// What counts as a change an entry is owed for: a rule or guideline whose normalized
// text differs from the base's (markers and whitespace off - the marking pass owes
// nothing), a skill whose description, load triggers or body text moved, a check
// module or declaration whose non-comment content moved, a task's declaration or
// worker, the manifest. A carrier with no file at all is the world half's finding, not
// this one's.
//
// A provenance file only grows: a changed file keeps every base line in place and adds
// after the last entry. A carrier this change deleted named a file whose last entry
// must now be `retired` - asserted from the tree's side, since a removed-lines check
// cannot see a deleted file.
const rule = {
  id: 'provenance-change-recorded',
  severity: 'blocking',
  scope: 'work',
  since: '2026-09-20',
  doc: 'packs/claudinite-growth/skills/changing-pack-elements/SKILL.md',
  description: 'A change to a pack carrier lands with an entry on its provenance file, and a provenance file only grows',
  why: 'the decision behind a change exists only in the head of whoever made it, at the moment they made it; a log appended later is a reconstruction',

  run(work) {
    if (typeof provenance.packCarriers !== 'function') return []; // an engine that predates the helper
    const { packCarriers, provenanceFiles, packDirsIn, fileOfId, elementIdOf, PROVENANCE_DIR, PACK_ELEMENT } = provenance;
    if (work.onDefaultBranch()) return [];
    const changed = work.changedFiles.map((f) => f.replace(/\\/g, '/'));
    const deleted = (work.deleted ?? []).map((f) => f.replace(/\\/g, '/'));
    const packs = packDirsIn([...changed, ...deleted]);
    if (!packs.length) return [];
    // The head tree is everything tracked plus the run's untracked files - never the
    // changed set alone, which would read every untouched carrier as deleted.
    const headFiles = [...work.tracked, ...work.untracked];
    const head = { exists: (p) => work.exists(p), read: (p) => work.read(p), listDir: (p) => listFrom(headFiles, p) };
    const baseFiles = [...new Set([...work.tracked, ...deleted])].filter((p) => work.readBase(p) !== null);
    const base = { exists: (p) => work.readBase(p) !== null, read: (p) => work.readBase(p), listDir: (p) => listFrom(baseFiles, p) };
    const out = [];
    const touched = (p) => changed.includes(p);

    for (const dir of packs) {
      const now = packCarriers(dir, head);
      const before = packCarriers(dir, base);
      const filesNow = provenanceFiles(dir, head);
      const filesBefore = provenanceFiles(dir, base);
      // A pack with no provenance folder at the base is being brought onto the
      // convention by this change - the marking pass, or a member's first converge
      // onto it - and its elements' history is the backfill's, not this change's.
      if (!filesBefore.size) continue;
      const gained = (id) => {
        const h = filesNow.get(id);
        if (!h) return false;
        const b = filesBefore.get(id);
        return h.entries.length > (b?.entries.length ?? 0);
      };
      const owes = (id, file, line, what) => {
        if (!filesNow.has(id) || gained(id)) return;
        out.push(finding(rule, {
          file, line,
          what: `${what}, and ${dir}/${PROVENANCE_DIR}/${fileOfId(id)} gained no entry in this change`,
          fix: `append the entry that records the decision - its kind (reworded, strengthened, weakened, moved, converted, trigger-changed, policy-changed, severity-changed, split, merged) and why - through \`node <path to claudinite-growth>/provenance.mjs append ${dir.slice(dir.lastIndexOf('/') + 1)} ${id}\`, reading the entry from stdin`,
        }));
      };

      // Rules and guidelines: by trigger, text compared marker-free.
      const wasByTrigger = new Map([...before.rules, ...before.guidelines].map((r) => [r.trigger, r]));
      for (const r of [...now.rules, ...now.guidelines]) {
        if (!r.slug || !touched(r.file)) continue;
        const was = wasByTrigger.get(r.trigger);
        if (!was) owes(r.slug, r.file, r.line, `"${r.trigger}" is new`);
        else if (was.text !== r.text) owes(r.slug, r.file, r.line, `"${r.trigger}" reads differently from the base`);
      }
      // Skills: the file changed beyond whitespace.
      for (const s of now.skills) {
        if (!s.present || !touched(s.file)) continue;
        const b = base.read(s.file);
        if (b !== null && normalize(b) === normalize(head.read(s.file))) continue;
        if (b !== null && skillOnlyMarkedOrBodied(b, head.read(s.file))) continue;
        owes(s.name, s.file, null, `skill ${s.name} changed`);
      }
      // Checks, tasks, the manifest: non-comment content moved.
      const seenCheck = new Set();
      for (const c of now.checks) {
        const id = elementIdOf(c.id);
        if (seenCheck.has(id) || !touched(c.file)) continue;
        seenCheck.add(id);
        const b = base.read(c.file);
        if (b !== null && c.file.endsWith('.mjs') && commentOnly(c.file, b, head.read(c.file))) continue;
        if (b !== null && c.file.endsWith('.json') && !declarationChanged(b, head.read(c.file), c.id)) continue;
        owes(id, c.file, null, `check ${c.id} changed`);
      }
      for (const t of now.tasks) {
        const files = changed.filter((f) => f.startsWith(`${t.dir}/`));
        if (!files.length) continue;
        if (files.every((f) => f.endsWith('.mjs') && base.read(f) !== null && commentOnly(f, base.read(f), head.read(f)))) continue;
        owes(t.id, files[0], null, `task ${t.id} changed`);
      }
      if (now.manifest && touched(`${dir}/pack.mjs`)) {
        const b = base.read(`${dir}/pack.mjs`);
        if (!(b !== null && commentOnly(`${dir}/pack.mjs`, b, head.read(`${dir}/pack.mjs`)))) owes(PACK_ELEMENT, `${dir}/pack.mjs`, null, 'the manifest changed');
      }

      // A provenance file only grows.
      for (const [id, h] of filesNow) {
        if (!touched(h.file)) continue;
        const b = filesBefore.get(id);
        if (!b || b.text.trim() === '') continue;
        if (!h.text.startsWith(b.text.replace(/\s+$/, ''))) {
          out.push(finding(rule, {
            file: h.file,
            what: `${fileOfId(id)} lost or altered a line it had at the base - a provenance file only grows`,
            fix: 'restore the file to its base text and append what this change decides after the last entry; a wrong entry is corrected by a later entry, never edited',
          }));
        }
      }

      // A deleted carrier's file ends with retired.
      const gone = [];
      const nowTriggers = new Set([...now.rules, ...now.guidelines].map((r) => r.trigger));
      for (const r of [...before.rules, ...before.guidelines]) if (r.slug && !nowTriggers.has(r.trigger)) gone.push({ id: r.slug, what: `rule "${r.trigger}"` });
      const nowSkills = new Set(now.skills.filter((s) => s.present).map((s) => s.name));
      for (const s of before.skills) if (s.present && !nowSkills.has(s.name)) gone.push({ id: s.name, what: `skill ${s.name}` });
      const nowChecks = new Set(now.checks.map((c) => c.id));
      for (const c of before.checks) if (!nowChecks.has(c.id)) gone.push({ id: elementIdOf(c.id), what: `check ${c.id}` });
      const nowTasks = new Set(now.tasks.map((t) => t.id));
      for (const t of before.tasks) if (!nowTasks.has(t.id)) gone.push({ id: t.id, what: `task ${t.id}` });
      for (const g of gone) {
        const f = filesNow.get(g.id);
        const retiredNow = f && f.entries.length && f.entries[f.entries.length - 1].kind === 'retired' && (filesBefore.get(g.id)?.status !== 'retired');
        if (retiredNow) continue;
        out.push(finding(rule, {
          file: `${dir}/${PROVENANCE_DIR}/${fileOfId(g.id)}`,
          what: `${g.what} is gone from ${dir} in this change, and its file's last entry is not retired`,
          fix: `append \`## <date> · retired · <why>\` to ${fileOfId(g.id)} in the same change - the decision to remove is a decision, and the file stays`,
        }));
      }
    }
    return out;
  },
};

const normalize = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();

// The marking pass's own edits to a skill: a `body:` line and markers on guideline
// bullets. Neither is a decision, so a skill that changed only so owes nothing.
function skillOnlyMarkedOrBodied(before, after) {
  const strip = (t) => normalize(String(t)
    .replace(/^\s*body:\s*(workflow|guidelines)\s*$/gm, '')
    .replace(/^metadata:\s*$/gm, '') // the block `mark` opens to hold the body
    .replace(/\s*\([a-z][a-z0-9]*(?:-[a-z0-9]+)+\)\s*$/gm, '')
    .replace(/\s*\(\d+(?:\s*,\s*\d+)*\)\s*$/gm, ''));
  return strip(before) === strip(after);
}

// One declaration in a declared-checks.json moved: compared parsed, by id.
function declarationChanged(before, after, id) {
  const find = (t) => { try { return JSON.stringify((JSON.parse(t) ?? []).find((d) => d?.id === id) ?? null); } catch { return null; } };
  return find(before) !== find(after);
}

function listFrom(files, p) {
  const names = new Set();
  const prefix = `${p}/`;
  for (const f of files) {
    const n = f.replace(/\\/g, '/');
    if (n.startsWith(prefix)) names.add(n.slice(prefix.length).split('/')[0]);
  }
  return names.size ? [...names] : null;
}

export default rule;
