import { finding } from '../../../engine/checks/helpers/findings.mjs';
import { parseDescriptor, FLEET_KINDS, KINDS } from '../contributions.mjs';

// A pack's dashboard descriptor must be one the DASHBOARD'S OWN READER accepts.
//
// NOT a second copy of the schema. `dashboard-descriptor.schema.json` is a real JSON
// Schema the file points at with `$schema`, and ordinary tooling validates shape
// against it; re-implementing that here would be a coded validation vocabulary beside
// a perfectly good schema. What this asserts is the thing a schema structurally
// cannot: that `parseDescriptor` — the exact function the page runs — can USE the
// file, and that the ids the views select by resolve to widgets that exist.
//
// The failure it exists to catch is silent in the worst way. A descriptor the reader
// rejects does not break the page: by design it becomes one apologetic line on that
// pack's card, in a member's browser, where nobody authoring the pack will ever see
// it. The pack ships, converges to the fleet, and reports nothing anywhere.
//
// BLOCKING, because there is no window in which an unusable descriptor is correct,
// and because the pack author is the only person who can fix it.
//
// Scope is the descriptors a repo can actually FIX: the canon's own `packs/` when run
// from the canon, and a member's own `.claudinite/local/packs/`. The vendored mount is
// deliberately outside it — `.claudinite/shared/` is read-only to a member, so a canon
// descriptor's fault is not a member's to be blocked on, and the canon's own run is
// where it goes red. Run from canon the mount does not exist and the skip never fires,
// which is the right answer in both places.
//
// Taken from `ctx.allFiles`, so a descriptor added but not yet tracked is covered too.
const DESCRIPTOR = /^(\.claudinite\/local\/)?packs\/([^/]+)\/dashboard\.json$/;
const MOUNT = '.claudinite/shared/';

const rule = {
  id: 'descriptor-usable',
  severity: 'blocking',
  description: "a pack's dashboard.json is one the dashboard's own reader can use",
  doc: 'packs/claudinite-dashboard/dashboard-descriptor.schema.json',
  why: 'a descriptor the reader rejects renders as an apology on a card in someone else\'s browser — the pack ships, converges, and reports nothing, with nothing going red anywhere the author looks',

  run(ctx) {
    const out = [];
    for (const file of ctx.allFiles) {
      if (file.startsWith(MOUNT)) continue;   // read-only canon mount, not a member's to police
      const m = DESCRIPTOR.exec(file);
      if (!m) continue;
      const pack = m[2];
      const text = ctx.read(file);
      if (text === null) continue;

      const d = parseDescriptor(text, pack);
      if (d.fault) {
        out.push(finding(rule, {
          file,
          what: `the dashboard reader rejects it: ${d.fault}`,
          fix: `make it satisfy packs/claudinite-dashboard/dashboard-descriptor.schema.json — at minimum a "widgets" array whose entries each carry an "id" and a "kind" from ${KINDS.join(', ')}`,
        }));
        continue;
      }

      // Ids that resolve to nothing. The reader drops them — deliberately, since a
      // member may run a pack version whose widget list is shorter — so this is the
      // one place the difference between "dropped for a good reason" and "typo" can
      // be told apart: in the canon, the descriptor and its widgets are the same file.
      const doc = JSON.parse(text);
      const declared = new Set(d.widgets.keys());
      const dangling = [
        ...(Array.isArray(doc.repo) ? doc.repo : []),
        ...(Array.isArray(doc.fleet?.deployment) ? doc.fleet.deployment : []),
        ...(typeof doc.fleet?.member === 'string' ? [doc.fleet.member] : []),
      ].filter((id) => !declared.has(id));
      if (dangling.length) {
        out.push(finding(rule, {
          file,
          what: `selects widget id(s) it does not declare: ${[...new Set(dangling)].join(', ')}`,
          fix: 'declare the widget in "widgets", or drop the id from the view that names it — the page silently renders nothing for an id it cannot resolve',
        }));
      }

      // A member mini-card must fit one line, so `list` cannot be one. The reader
      // drops it and the pack loses its fleet presence without saying so.
      const member = typeof doc.fleet?.member === 'string' ? d.widgets.get(doc.fleet.member) : null;
      if (member && member.known && !FLEET_KINDS.includes(member.kind)) {
        out.push(finding(rule, {
          file,
          what: `names "${member.id}" as its fleet mini-card, but a ${member.kind} cannot be one line`,
          fix: `point fleet.member at a widget whose kind is one of ${FLEET_KINDS.join(', ')}, or drop it and contribute to the repo page only`,
        }));
      }

      // A composed phrase with no noun reads as a bare number in a column of bare
      // numbers: "18" tells a reader nothing about what 18 is.
      for (const id of [typeof doc.fleet?.member === 'string' ? doc.fleet.member : null].filter(Boolean)) {
        const w = d.widgets.get(id);
        if (w && (w.kind === 'stat' || w.kind === 'window') && !w.noun) {
          out.push(finding(rule, {
            file,
            what: `its fleet mini-card "${id}" is a ${w.kind} with no "noun", so it would render as a bare number`,
            fix: 'give the widget a short "noun" — what the quantity is of — so the phrase reads "18 stars" rather than "18"',
          }));
        }
      }
    }
    return out;
  },
};

export default rule;
