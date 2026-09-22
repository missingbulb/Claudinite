import { relative, sep } from 'node:path';
import { SETTINGS_FILE } from '../../settings-file-names.mjs';

export function finding(rule, { file, line = null, what, fix, why = null, severity = null }) {
  return {
    rule: rule.id,
    severity: severity || rule.severity,
    file,
    line,
    what,
    why: why || rule.why,
    fix,
    doc: rule.doc,
    // The rule's declared creation date, carried onto every finding so the grace
    // window below can be applied by the scope-blind reporter, which never sees
    // the rules themselves. Undefined on a rule that declared none — see `applyGrace`.
    since: rule.since,
  };
}

// WHAT A RULE THAT THREW BECOMES. A rule is a function over a tree nobody chose
// for it — a malformed manifest in a member repo, a file that is not the JSON its
// extension claims — and before the runner isolated each one, a single throw
// escaped the sweep and took every OTHER rule's findings with it: the run reported
// nothing rather than everything else. So the failure is a finding like any other,
// naming the rule that raised and the pack it came from, which is the pair that
// leads to the module to fix.
//
// BLOCKING, and carrying no `since`: a rule that cannot run reports no findings,
// which reads exactly like a rule that found nothing, and grace would hide the one
// difference. The project can still name the rule in `rules` to turn it off, the
// same move it has for the findings that rule makes when it works.
export function ruleFailed({ pack, rule, error, root }) {
  return {
    rule: rule.id,
    severity: 'blocking',
    // The pack's own directory: a rule carries no path of its own, and the pack
    // that contributed it is the shortest way to the module.
    file: pack?.dir && root ? relative(root, pack.dir).split(sep).join('/') : (pack?.id ?? '(unknown pack)'),
    line: null,
    what: `the "${rule.id}" rule threw: ${error?.message ?? error}`,
    why: 'a rule that cannot run makes no findings, which is indistinguishable from a rule that found nothing',
    fix: `fix ${rule.id} so it tolerates whatever this repo holds, or set "${rule.id}": "off" under "rules" in ${SETTINGS_FILE} until it is`,
    doc: rule.doc,
  };
}

// HOW LONG A NEW BLOCKING CHECK IS ONLY ADVISORY. A check lands against a tree it
// did not grow up with, so its first findings are usually a backlog rather than a
// regression — and the run that authored it (a growth capture run, above all) has
// neither the scope nor the review to clear that backlog in the same commit.
// Without a grace window the only check such a run can land is one the tree already
// satisfies, which is the check that proves least; the lesson then lands as prose,
// which is the outcome the growth ladder exists to avoid.
//
// Two weeks is the span in which the backlog is either cleared, the check is
// tightened, or the check is deleted as a bad idea — after it, the check bites.
export const GRACE_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

// The instant a rule created on `since` starts blocking, or null when it declared
// no date or an unparseable one. A rule with no date has no grace: the whole
// standing corpus predates this field, and absence must mean "mature", never
// "newborn".
export function graceUntil(since) {
  if (typeof since !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(since)) return null;
  const start = Date.parse(`${since}T00:00:00Z`);
  return Number.isNaN(start) ? null : new Date(start + GRACE_DAYS * DAY_MS);
}

// Demote a blocking finding to advisory while its rule is inside its grace window,
// recording the date it starts biting so the output says why it did not fail the
// build. Runs BEFORE the project's own severity overrides, so a project that has
// explicitly set a rule to `blocking` gets what it asked for from day one.
//
// A `since` in the FUTURE grants nothing: were it honoured, any date far enough out
// would disable a blocking check permanently, which is a suppression wearing a
// creation date.
export function applyGrace(findings, { now = new Date() } = {}) {
  return findings.map((f) => {
    if (f.severity !== 'blocking') return f;
    const until = graceUntil(f.since);
    if (!until) return f;
    const start = Date.parse(`${f.since}T00:00:00Z`);
    if (now < start || now >= until) return f;
    return { ...f, severity: 'advisory', graceUntil: until.toISOString().slice(0, 10) };
  });
}

// Severity overrides then acceptances, in that order, so an acceptance is judged
// against the rule the project actually runs. A reasonless acceptance is itself
// a blocking finding: the reason string is what makes the decision reviewable.
export function applyConfig(findings, config) {
  const out = [];
  for (let f of findings) {
    const override = config.rules[f.rule];
    if (override === 'advisory' || override === 'blocking') f = { ...f, severity: override };
    // A path ending in "/" accepts a whole subtree; otherwise the match is exact.
    const acceptance = config.accept.find(
      (a) => a.rule === f.rule &&
        (!a.path || a.path === f.file || (a.path.endsWith('/') && f.file.startsWith(a.path)))
    );
    if (acceptance) {
      if (typeof acceptance.reason === 'string' && acceptance.reason.trim()) continue;
      out.push({
        rule: 'config',
        severity: 'blocking',
        file: '.claudinite-settings.json',
        line: null,
        what: `acceptance for ${f.rule}${acceptance.path ? ` on ${acceptance.path}` : ''}${acceptance.pack ? ` (on the "${acceptance.pack}" pack entry)` : ''} has no reason`,
        why: 'the reason string is what makes an accepted violation reviewable',
        fix: 'add a non-empty "reason" to the acceptance entry',
        doc: 'engine/checks/README.md',
      });
    }
    out.push(f);
  }
  return out;
}

export function render(f) {
  const loc = f.line ? `${f.file}:${f.line}` : f.file;
  return [
    `[${f.severity.toUpperCase()}] ${f.rule}  ${loc}`,
    `  ${f.what}`,
    ...(f.why ? [`  Why: ${f.why}`] : []),
    ...(f.graceUntil ? [`  Grace: added ${f.since} — advisory until ${f.graceUntil}, blocking after`] : []),
    `  Fix: ${f.fix}`,
    ...(f.doc ? [`  More: ${f.doc}`] : []),
  ].join('\n');
}
