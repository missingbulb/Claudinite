// The sweep pipeline both scope entries share (check_the_world.mjs /
// check_the_work.mjs — see README.md "Enforcement wiring"): build the context,
// activate the declared packs, run one scope's rule family, apply the project's
// overrides/acceptances, render. 'world' runs the repo-state rules plus the
// settings/interview diagnostics (themselves repo state); 'work' runs the rules
// judging the current change, each dispatched with the fluent work view
// (helpers/work.mjs).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildContext } from './helpers/repo-context.mjs';
import { runRule } from './helpers/work.mjs';
import { applyConfig, render } from './helpers/findings.mjs';
import { discoverPacks, isActive } from '../pack_loader/pack-registry.mjs';

// The adoption-interview machinery is the adopt-claudinite skill's, bundled in
// the Claudinite-lifecycle pack (packs/grow_with_claudinite/skills/adopt-claudinite/).
// A consumer that doesn't declare that pack doesn't vendor it — no lifecycle
// pack, no interview — so resolve it fail-soft: absent file, inert interview.
const interviewUrl = new URL('../../packs/grow_with_claudinite/skills/adopt-claudinite/interview.mjs', import.meta.url);
export const { interviewState } = existsSync(fileURLToPath(interviewUrl))
  ? await import(interviewUrl.href)
  : { interviewState: () => ({ pending: [], stale: [], errors: [] }) };

// A pack's contributedRules seam: the pack interprets the contributions other
// packs address to it on their manifests (`contributes`), returning
// first-class rules — how packs compose through declaration + configuration
// instead of importing each other's code. Isolated per pack, like manifest
// loading: one broken seam (a consumer-authored local pack's, say) must not
// sink the run.
export const contributedRules = (pack, fromPacks, onError) => {
  try { return pack.contributedRules?.(fromPacks) ?? []; }
  catch (e) { onError?.(e); return []; }
};

const configError = (what, fix) => ({
  rule: 'config', severity: 'blocking', file: '.claudinite-checks.json', line: null,
  what, why: 'the settings file is what executes — a bad key, value, or pack name silently changes what runs', fix, doc: 'engine/checks/README.md',
});

// Run one scope's sweep and print its findings; returns the blocking count
// (the entry's exit code is `blocking ? 1 : 0`).
export async function runSweep({ scope, root, mode, baseOverride = null, transcriptPath = null }) {
  const { packs, errors: packErrors } = await discoverPacks({ localRoot: root });
  const ctx = buildContext({ root, mode, baseOverride, transcriptPath });

  let findings = [];
  if (scope === 'world') {
    // Settings validity, checked at load: malformed JSON, an unknown property,
    // and a wrong pack name are all equally settings errors — repo state, so
    // the world sweep owns reporting them (the work sweep would double-report).
    // loadConfig reports the first two; the sweep adds unknown pack names here
    // because only it holds the registry.
    for (const e of ctx.config.errors) findings.push(configError(e.what, e.fix));
    // A broken/duplicate local pack.mjs is a config-level fault too — surface it
    // with a diagnostic instead of silently omitting the pack (and its checks).
    for (const e of packErrors) findings.push(configError(e.what, e.fix));
    // knownIds spans canon AND local packs, so a declared local pack id is valid
    // and the unknown-pack message lists it among the declarable packs.
    // ctx.config.packs is loadConfig's normalized view — bare ids, a namespaced
    // local_packs/<name> declaration already resolved through packEntryId — so
    // the membership test compares bare id to bare id whichever form the file used.
    const knownIds = new Set(packs.map((p) => p.id));
    for (const name of ctx.config.packs) {
      if (typeof name === 'string' && !knownIds.has(name)) {
        findings.push(configError(`declares unknown pack "${name}"`, `remove it or fix the name — declarable packs: ${[...knownIds].sort().join(', ')}`));
      }
    }
    // Adoption-interview hygiene (the adoption skill's interview machinery).
    // PENDING questions are deliberately not findings at all — they surface only
    // as a mild SessionStart note, so an unattended nightly run is never blocked
    // on a question nobody is present to answer. A STALE answer (its question no
    // longer declared — renamed or removed upstream) is ADVISORY: visible, never
    // run-failing, so a canon-side question change can't fail the fleet's CI
    // overnight. A malformed `questions` declaration is a real manifest fault,
    // blocking like any other.
    const { stale, errors: questionErrors } = interviewState(packs, ctx.config);
    for (const e of questionErrors) findings.push(configError(e.what, e.fix));
    for (const s of stale) {
      findings.push({
        rule: 'config', severity: 'advisory', file: '.claudinite-checks.json', line: null,
        what: `the "${s.packId}" pack entry stores an answer for "${s.answerId}", a question the pack no longer declares`,
        why: 'a stale answer silently stops matching its question, so the stored intent goes unread and the interview re-asks',
        fix: 'remove the stale answer, or re-key it to the renamed question id',
        doc: 'packs/README.md',
      });
    }
  }

  const inScope = (rule) => (scope === 'work' ? rule.scope === 'work' : rule.scope !== 'work');
  const activePacks = packs.filter((p) => isActive(p, ctx.config));
  for (const pack of activePacks) {
    // A pack's conformance checks, its bundled skills' skill-owned checks
    // (a skill is pack content — its checks ride the pack's activation), and
    // the rules this pack builds from other ACTIVE packs' contributions (its
    // contributedRules seam) — an undeclared pack neither runs nor contributes.
    // A broken seam is diagnosed by the world sweep only, so the Stop hook
    // (which runs both scopes) reports it once.
    const contributed = contributedRules(pack, activePacks, scope === 'world'
      ? (e) => findings.push(configError(`the "${pack.id}" pack's contributedRules failed: ${e.message}`, 'fix the pack manifest, or the contribution it interprets'))
      : null);
    for (const rule of [...(pack.rules ?? []), ...(pack.skillChecks ?? []), ...contributed]) {
      if (!inScope(rule)) continue;
      if (ctx.config.rules[rule.id] === 'off') continue;
      findings.push(...runRule(rule, ctx));
    }
  }
  findings = applyConfig(findings, ctx.config);
  findings.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'blocking' ? -1 : 1));

  for (const f of findings) console.log(`${render(f)}\n`);
  const blocking = findings.filter((f) => f.severity === 'blocking').length;
  const advisory = findings.length - blocking;
  if (findings.length) {
    console.log(`${blocking} blocking, ${advisory} advisory (${scope} scope: ${mode}${ctx.baseRef ? ` vs ${ctx.baseRef}` : ''}).`);
  }
  return blocking;
}
