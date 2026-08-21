// The fleet-add-missing-packs code-work entry point — the script the executor runs
// as `node worker.mjs …` (cwd = this task dir, bounded by code_work_timeout). The
// WHOLE task: `agent_model: 'none'`, no agent phase on the enforcer side.
//
// THE FAN-OUT MODEL (#749). This task used to end in an agent stage that ran
// adopt-pack against members from the ENFORCER's session — which failed in
// production the first time it ran, because the enforcer's executor is (correctly)
// scoped to the enforcer repo alone. Now the enforcer only DISPATCHES: each half
// converges a work-list issue IN the member (protocol.mjs) and wakes that member's
// own standing item for `adopt-requested-packs`; the member's own task reads its
// own issue, its own executor adopts with the repo checked out, and the reviewed
// PR lands there. No agent anywhere needs cross-repo access.
//
// It holds no scan logic and no force logic — those are its siblings,
// scan-for-needed-packs.mjs (what might a member want?) and force-add-packs.mjs
// (put these packs on these repos, now). It holds what both need and neither may
// own privately: the parameters (params.mjs), the token and fleet config, the canon
// pack corpus, and the firing loop.
//
// TWO CALL SITES, NO DEFAULTS (params.mjs has the reasoning):
//   weekly   task.mjs's code-work line — `--scan-for-needed-packs=true --repos=all-covered-members`
//   forced   a hand-created item's Context, inherited through CLAUDINITE_CONTEXT:
//              create-work-item claudinite-fleet-sheepdog/fleet-add-missing-packs \
//                --context "SCAN_FOR_NEEDED_PACKS=false" \
//                --context "REPOS=Alpha Beta Gamma" \
//                --context "ADD_PACKS=some-pack" \
//                --context "PACK_CONFIG=some-pack.repo=owner/Store" \
//                --context "PACK_ANSWER=some-pack.store=owner/Store — the fleet's store"
//            (keys split on commas, so values are space-separated and comma-free.)
//
// Failure is the escalation path. Anything unusable — a parameter that was not
// sent, a pack that does not exist, an interview question the force did not answer,
// a member that could not be swept or fired — throws, and this worker turns that
// into a non-zero exit; the executor converges the item to
// `needs-human`. A run that could not see (or reach) what it was acting on must
// not report itself green.

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { fleetWorkerFailed } from '../../fleet-api.mjs';
import { makeGh, paged, DECLARATION, fireScheduler } from '../../fleet-api.mjs';
import { parseSheepdogConfig } from '../../fleet-config.mjs';
import { missingFleetTokenError } from '../../fleet-token.mjs';
import { MEMBER_TASK_ID } from './protocol.mjs';
import { parseParams } from './params.mjs';
import { parseParamBag, contextText } from '../../param-bag.mjs';
import { loadCanonPacks } from './canon-packs.mjs';
import { runScan, renderFitSummary } from './scan-for-needed-packs.mjs';
import {
  resolveTargets, convergeRequestedIssue, requestedBody, renderForceSummary,
  unknownPacks, unansweredQuestions, qualify,
} from './force-add-packs.mjs';

// The member-side task every work list names in its `Task:` field. Derived from the
// protocol's own id rather than spelled a second time; the member task's directory
// name is the other half of the coupling, pinned by the protocol test.
export const MEMBER_TASK = MEMBER_TASK_ID.split('/')[1];

const item = process.env.CLAUDINITE_ITEM || '';
const log = (s) => console.log(`fleet-add-missing-packs${item ? ` [#${item}]` : ''}: ${s}`);

const emit = (text) => {
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
};

export async function main() {
  // GITHUB_REPOSITORY names the HOME repo — the one whose claudinite-fleet-sheepdog entry carries the
  // fleet config. Actions sets it; CLAUDINITE_REPO is code-work's own name for
  // the same fact, so fall back rather than depending on which is present.
  if (!process.env.GITHUB_REPOSITORY && process.env.CLAUDINITE_REPO) {
    process.env.GITHUB_REPOSITORY = process.env.CLAUDINITE_REPO;
  }

  const params = parseParams({
    argv: process.argv.slice(2),
    params: parseParamBag(contextText()),
  });
  log(params.forced
    ? `FORCED run — scan=${params.scan}, repos=${(params.repos ?? []).join(' ') || 'all-covered-members'}, packs=${params.addPacks.join(' ') || 'none'}`
    : `scheduled run — scan=${params.scan}, repos=${params.repos ? params.repos.join(' ') : 'all-covered-members'}`);

  const token = process.env.FLEET_GITHUB_TOKEN;
  const home = process.env.GITHUB_REPOSITORY;
  if (!token) {
    throw missingFleetTokenError('fleet-add-missing-packs',
      'The default GITHUB_TOKEN sees only this repo and cannot reach the fleet.');
  }
  if (!home || !home.includes('/')) throw new Error('GITHUB_REPOSITORY is not set (owner/repo)');
  const gh = makeGh(token);

  const cfgRes = await gh(`/repos/${home}/contents/${DECLARATION}`);
  if (cfgRes.status !== 200 || !cfgRes.json?.content) {
    throw new Error(`the claudinite-fleet-sheepdog repo ${home} has no readable ${DECLARATION} (status ${cfgRes.status})`);
  }
  let cfg;
  try { cfg = JSON.parse(Buffer.from(cfgRes.json.content, 'base64').toString('utf8')); } catch (e) {
    throw new Error(`unparsable ${DECLARATION} on ${home}: ${e.message}`);
  }
  const { owner, canonRepo } = parseSheepdogConfig(cfg, home);

  // The pack corpus comes from CANON, not from this enforcer's own mount — the mount
  // carries only the packs this repo declares, so the scan would test every member
  // against a handful of packs and report the whole fleet as fitted, and the force
  // would reject a perfectly real pack id as unknown. See canon-packs.mjs.
  const { packs, dispose } = await loadCanonPacks({ canonRepo, token });
  try {
    await run({ gh, home, owner, canonRepo, packs, params });
  } finally {
    dispose();
  }
}

// The run proper, with the corpus in hand. Split out so the scratch clone has exactly
// one disposal site whatever happens inside — including the deliberate throw at the
// foot, which must still fail the run.
async function run({ gh, home, owner, canonRepo, packs, params }) {
  const packsById = new Map(packs.map((p) => [p.id, p]));

  // VALIDATE THE FORCE FIRST, before a single member is touched. A force is
  // all-or-nothing (force-add-packs.mjs), and the cheapest place to refuse one is
  // before anything has happened at all.
  if (params.addPacks.length) {
    const unknown = unknownPacks(params.addPacks, packs);
    if (unknown.length) {
      throw new Error(`unknown pack id(s): ${unknown.join(', ')} — not in the ${packs.length}-pack corpus at ${canonRepo}. `
        + 'An unknown id in a member\'s declaration is a BLOCKING settings error there, so nothing was written.');
    }
    const unanswered = unansweredQuestions(params.addPacks, packs, params.packAnswers);
    if (unanswered.length) {
      throw new Error(`${unanswered.length} adoption-interview question(s) were not answered, so this run was refused entirely: `
        + `${unanswered.map((u) => `${u.pack}.${u.question} ("${u.prompt}")`).join('; ')}. `
        + 'Send each as `PACK_ANSWER…=<pack>.<question>=<the answer>` as a `--context` line — an answer is the owner\'s to give, '
        + 'never one this task may infer (adopt-pack, "when nobody is there to ask").');
    }
  }

  // One fleet enumeration, shared by both halves and the fire step (the fire needs
  // each member's default branch — workflow_dispatch resolves on a ref).
  const mine = (await paged(gh, '/user/repos?affiliation=owner'))
    .filter((r) => r.owner.login.toLowerCase() === owner);
  const reposByName = new Map(mine.map((r) => [r.full_name.toLowerCase(), r]));

  const fireFailures = [];
  const fire = async ({ fullName, defaultBranch }) => {
    const branch = defaultBranch ?? reposByName.get(fullName.toLowerCase())?.default_branch;
    if (!branch) { fireFailures.push(`${fullName}: not in the enumeration — cannot resolve its default branch`); return null; }
    // No `wake`: the work list is a marked issue now, and an ordinary scheduler run
    // adopts it. Waking a standing item would be asking for a run of a task whose
    // item this dispatch is not — the mark IS the request.
    const verdict = await fireScheduler(gh, fullName, branch);
    if (verdict.state !== 'fired') { fireFailures.push(`${fullName}: ${verdict.state} — ${verdict.detail}`); return null; }
    return fullName;
  };

  // A name typed bare in the override box is qualified against the configured owner
  // here, once, so the two halves can never disagree about what was named.
  const scopedRepos = params.repos ? params.repos.map((n) => qualify(n, owner)) : null;

  let scanUnknown = [];
  if (params.scan) {
    log('scanning the fleet for packs a member\'s shape suspects but its declaration does not carry');
    const scanned = await runScan({ gh, home, owner, canonRepo, packs, repos: scopedRepos });
    scanUnknown = scanned.unknown;
    const fired = [];
    for (const target of scanned.toFire) {
      const ok = await fire(target);
      if (ok) fired.push(ok);
    }
    emit(renderFitSummary({ ...scanned.summaryArgs, fired }));
    if (fired.length) log(`fired ${fired.length} member scheduler(s): ${fired.join(', ')}`);
  }

  if (params.addPacks.length) {
    log(`requesting ${params.addPacks.join(', ')} in ${params.repos.length} named repo(s)`);
    const { targets, alreadyDeclared } = await resolveTargets(gh, {
      repos: params.repos, owner, addPacks: params.addPacks, reposByName,
    });
    const actions = []; const fired = [];
    for (const target of targets) {
      const body = requestedBody({
        addPacks: target.missing,
        packConfig: params.packConfig,
        packAnswers: params.packAnswers,
        packsById,
        enforcer: home,
      });
      const { action } = await convergeRequestedIssue(gh, target.fullName, { body });
      if (action) actions.push(`${action} (${target.fullName})`);
      const ok = await fire(target);
      if (ok) fired.push(ok);
    }
    emit(renderForceSummary({ owner, addPacks: params.addPacks, targets, alreadyDeclared, actions, fired }));
  }

  // Unknown is not fitted: a member the scan could not read was not measured, and
  // that fails the run — AFTER the reports above, which stand. An UNFIRED member no
  // longer does: since the work list is a marked issue, the dispatch only decides
  // whether the member adopts it in a minute or on its own next hour, so a refused
  // dispatch is reported and nothing more.
  if (fireFailures.length) log(`${fireFailures.length} member(s) did not take the nudge dispatch — they adopt on their own next scheduler run: ${fireFailures.join('; ')}`);
  const problems = scanUnknown.map((u) => `unswept: ${u}`);
  if (problems.length) {
    throw new Error(`${problems.length} member(s) did not come through cleanly — ${problems.join('; ')} — `
      + 'the rest are reported above, and this run fails so the cause is escalated');
  }
}

// Run only when invoked directly (code-work's `node worker.mjs …`), never on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => fleetWorkerFailed('fleet-add-missing-packs', e));
}

// Re-exported for the tests and for a hand-run: `qualify` is how a name typed in the
// override box becomes the `owner/name` every comparison here uses.
export { qualify };
