// The fleet-add-missing-packs preprocessing entry point — the script the scheduler runs
// as `node worker.mjs …` (cwd = this task dir, bounded by prework_timeout), before the
// agent stage.
//
// It holds no sweep logic and no force logic. It holds what BOTH halves need and neither
// may own privately: the parameters (params.mjs), the token and the fleet config, the
// canon pack corpus, and the ONE read of this repo's work-list issues that both halves
// converge against. The halves themselves are its siblings in this folder —
// scan-for-needed-packs.mjs (what might a member want?) and force-add-packs.mjs (put
// these packs on these repos, now) — because nothing outside this task uses either.
//
// TWO CALL SITES, NO DEFAULTS (params.mjs has the reasoning):
//   weekly   task.mjs's prework line — `--scan-for-needed-packs=true --repos=all-covered-members`
//   forced   the scheduler's manual-run override bag, inherited through CLAUDINITE_OVERRIDES:
//              FORCE_TASKS=fleet-add-missing-packs
//              SCAN_FOR_NEEDED_PACKS=false
//              REPOS=Alpha Beta Gamma
//              ADD_PACKS=some-pack
//              PACK_CONFIG=some-pack.repo=owner/Store
//              PACK_ANSWER=some-pack.store=owner/Store — the fleet's store
//            (keys split on commas, so values are space-separated and comma-free.)
//
// What it hands the agent is the ISSUE SURFACE, not a data channel: both halves converge
// `fleet-add-missing-packs` issues in this repo, and the agent stage reads them from there
// under its own instructions (task.md). The one thing that crosses as data is the agent
// REQUEST — the scheduler hands this worker a path via CLAUDINITE_REQUEST_AGENT and files
// the `ready-for-agent` dispatch iff the worker creates it (engine/scheduler/prework.mjs),
// carrying the NAME of the condition and nothing else. So a week with an empty work list
// runs no agent at all, which is what makes an unconditionally-scheduled weekly sweep
// cheap, and a forced run reaches the agent in the same run that filed its request.
//
// Failure is the escalation path. Anything unusable — a parameter that was not sent, a
// pack that does not exist, an interview question the force did not answer, a member that
// could not be swept — throws, and this worker turns that into a non-zero exit. The
// scheduler treats a non-zero prework subprocess as a failed task: it converges one open
// `needs-human` issue for the task family (engine/scheduler/run.mjs) and never reaches the
// agent stage. A run that could not see what it was acting on must not be followed by an
// agent acting on a partial picture.

import { appendFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { makeGh, ensureLabel, labeledIssues, DECLARATION } from '../../fleet-api.mjs';
import { parseSheepdogConfig } from '../../fleet-config.mjs';
import { parseParams } from './params.mjs';
import { loadCanonPacks } from './canon-packs.mjs';
import { runScan, LABEL, LEGACY_LABEL } from './scan-for-needed-packs.mjs';
import {
  resolveTargets, convergeForceIssues, convergeForceClosures, renderForceSummary,
  unknownPacks, unansweredQuestions, qualify,
} from './force-add-packs.mjs';

const slotId = process.env.CLAUDINITE_SLOT_ID || '';
const log = (s) => console.log(`fleet-add-missing-packs${slotId ? ` [${slotId}]` : ''}: ${s}`);

const emit = (text) => {
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
};

// The override bag, re-parsed here rather than imported from the engine: this worker runs
// as a SUBPROCESS of the scheduler and inherits `CLAUDINITE_OVERRIDES` as text, and a pack
// importing an engine module for four lines of splitting is the coupling packs exist to
// avoid. The shape is the engine's (`A=1,B=2`, newline-separated, bare key ⇒ `true`) and
// is asserted against it in this task's tests.
export function parseOverrideBag(raw) {
  const out = {};
  for (const part of String(raw ?? '').split(/[,\n]/)) {
    const token = part.trim();
    if (!token) continue;
    const eq = token.indexOf('=');
    if (eq === -1) out[token] = 'true';
    else out[token.slice(0, eq).trim()] = token.slice(eq + 1).trim();
  }
  return out;
}

// The one read of this repo's work-list issues, under the current label AND the one it
// carried before the 2026-08-10 rename. A legacy-labelled issue is RELABELLED on sight
// rather than left alone: the agent stage reads one label, so an issue still carrying the
// old one is a finding nobody acts on and the next sweep would file a duplicate beside it.
async function readWorkLists(gh, home) {
  const current = await labeledIssues(gh, home, LABEL);
  const legacy = await labeledIssues(gh, home, LEGACY_LABEL);
  const relabelled = [];
  for (const issue of legacy.open) {
    if (issue.labels?.some((l) => (l.name ?? l) === LABEL)) continue;
    await gh(`/repos/${home}/issues/${issue.number}/labels`, { method: 'POST', body: { labels: [LABEL] } });
    await gh(`/repos/${home}/issues/${issue.number}/labels/${LEGACY_LABEL}`, { method: 'DELETE' });
    relabelled.push(`#${issue.number}`);
  }
  const byNumber = new Map([...legacy.open, ...current.open].map((i) => [i.number, i]));
  return {
    open: new Map([...byNumber.values()].map((i) => [i.title, i])),
    closed: [...legacy.closed, ...current.closed],
    relabelled,
  };
}

export async function main() {
  // The scan resolves the HOME repo — the one whose sheepdog pack entry carries the fleet
  // config, and the one the work-list issues land in — from GITHUB_REPOSITORY. Actions
  // sets it and the subprocess inherits it; CLAUDINITE_REPO is the scheduler's own name
  // for the same fact, so fall back to it rather than depending on which is present.
  if (!process.env.GITHUB_REPOSITORY && process.env.CLAUDINITE_REPO) {
    process.env.GITHUB_REPOSITORY = process.env.CLAUDINITE_REPO;
  }

  const params = parseParams({
    argv: process.argv.slice(2),
    overrides: parseOverrideBag(process.env.CLAUDINITE_OVERRIDES),
  });
  log(params.forced
    ? `FORCED run — scan=${params.scan}, repos=${(params.repos ?? []).join(' ') || 'all-covered-members'}, packs=${params.addPacks.join(' ') || 'none'}`
    : `scheduled run — scan=${params.scan}, repos=${params.repos ? params.repos.join(' ') : 'all-covered-members'}`);

  const token = process.env.FLEET_GITHUB_TOKEN;
  const home = process.env.GITHUB_REPOSITORY;
  if (!token) {
    throw new Error('FLEET_GITHUB_TOKEN is not set. Add a repo secret with a fine-grained PAT '
      + '(this account, ALL repositories, Metadata read, Contents read + Issues read/write) — '
      + 'the default GITHUB_TOKEN sees only this repo and cannot reach the fleet.');
  }
  if (!home || !home.includes('/')) throw new Error('GITHUB_REPOSITORY is not set (owner/repo)');
  const gh = makeGh(token);

  const cfgRes = await gh(`/repos/${home}/contents/${DECLARATION}`);
  if (cfgRes.status !== 200 || !cfgRes.json?.content) {
    throw new Error(`the sheepdog repo ${home} has no readable ${DECLARATION} (status ${cfgRes.status})`);
  }
  let cfg;
  try { cfg = JSON.parse(Buffer.from(cfgRes.json.content, 'base64').toString('utf8')); } catch (e) {
    throw new Error(`unparsable ${DECLARATION} on ${home}: ${e.message}`);
  }
  const { owner, canonRepo } = parseSheepdogConfig(cfg, home);

  // The pack corpus comes from CANON, not from this enforcer's own mount — the mount
  // carries only the packs this repo declares, so the scan would test every member
  // against a handful of packs and report the whole fleet as fitted, and the force would
  // reject a perfectly real pack id as unknown. See canon-packs.mjs.
  const { packs, dispose } = await loadCanonPacks({ canonRepo, token });
  try {
    await run({ gh, home, owner, canonRepo, packs, params });
  } finally {
    dispose();
  }
}

// The run proper, with the corpus in hand. Split out so the scratch clone has exactly one
// disposal site whatever happens inside — including the deliberate throw at the foot,
// which must still fail the run.
async function run({ gh, home, owner, canonRepo, packs, params }) {
  const packsById = new Map(packs.map((p) => [p.id, p]));

  // VALIDATE THE FORCE FIRST, before the label, the issue read, or a single member is
  // touched. A force is all-or-nothing (force-add-packs.mjs), and the cheapest place to
  // refuse one is before anything has happened at all.
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
        + 'Send each as `PACK_ANSWER…=<pack>.<question>=<the answer>` in the overrides — an answer is the owner\'s to give, '
        + 'never one this task may infer (adopt-pack, "when nobody is there to ask").');
    }
  }

  await ensureLabel(gh, home, LABEL, {
    color: '0E8A16',
    description: 'A member is missing packs — fingerprinted by the weekly scan, or requested by hand',
  });
  const { open, closed, relabelled } = await readWorkLists(gh, home);
  if (relabelled.length) log(`adopted ${relabelled.length} issue(s) still labelled \`${LEGACY_LABEL}\`: ${relabelled.join(', ')}`);

  // The scan compares against `owner/name` throughout, so a name typed bare in the
  // override box is qualified here — the same rule the force half applies to the same
  // input, kept in one place so the two halves can never disagree about what was named.
  const scopedRepos = params.repos ? params.repos.map((n) => qualify(n, owner)) : null;

  let scanned = null;
  if (params.scan) {
    log('sweeping for packs a member\'s shape suspects but its declaration does not carry');
    scanned = await runScan({
      gh, home, owner, canonRepo, packs, repos: scopedRepos, open, closed,
    });
    emit(scanned.summary);
  }

  let forcedTargets = [];
  if (params.addPacks.length) {
    log(`forcing ${params.addPacks.join(', ')} onto ${params.repos.length} named repo(s)`);
    const { targets, alreadyDeclared } = await resolveTargets(gh, {
      repos: params.repos, owner, addPacks: params.addPacks,
    });
    const actions = await convergeForceIssues(gh, home, {
      targets,
      addPacks: params.addPacks,
      packConfig: params.packConfig,
      packAnswers: params.packAnswers,
      packsById,
      requestedBy: 'a forced run of fleet-add-missing-packs',
      open,
    });
    forcedTargets = targets;
    emit(renderForceSummary({ owner, addPacks: params.addPacks, targets, alreadyDeclared, actions }));
  }

  // Close what has landed since — on every run, whichever half opened it.
  const closures = await convergeForceClosures(gh, home, { open });
  if (closures.length) log(`forced work lists closed: ${closures.join('; ')}`);

  // THE AGENT REQUEST. The dispatch is conditional (engine/scheduler/prework.mjs): the
  // agent stage runs iff this file is written, so a quiet week costs an agent nothing and
  // a forced run reaches the agent inside the same run that filed its request. What the
  // request carries is the NAME of the condition and a count — never the findings, which
  // stay in the issues the agent reads for itself.
  const scanFindings = scanned?.findings.length ?? 0;
  const wanted = scanFindings + forcedTargets.length;
  const requestPath = process.env.CLAUDINITE_REQUEST_AGENT;
  if (wanted && requestPath) {
    writeFileSync(requestPath, JSON.stringify({
      reason: {
        code: params.addPacks.length ? 'packs-requested' : 'undeclared-fits',
        detail: [
          forcedTargets.length ? `${forcedTargets.length} member(s) were asked by hand to declare ${params.addPacks.join(', ')}` : '',
          scanFindings ? `${scanFindings} member(s) carry shapes fingerprinting packs they do not declare` : '',
        ].filter(Boolean).join('; '),
      },
    }));
    log(`agent requested — ${wanted} member(s) on the work list`);
  } else if (!wanted) {
    log('no member is missing a pack this run — no agent needed');
  }

  // Unknown is not fitted. A member the scan could not read was not measured, no issue was
  // opened or closed for it, and the run fails so the cause is escalated — AFTER the
  // reports above, which stand.
  if (scanned?.unknown.length) {
    throw new Error(`${scanned.unknown.length} repo(s) could not be swept — unknown is not fitted, `
      + 'no work list was opened or closed for them, and this run fails so the cause is escalated');
  }
}

// Run only when invoked directly (the scheduler's `node worker.mjs …`), never on import.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`fleet-add-missing-packs failed: ${e.message}`); process.exit(1); });
}

// Re-exported for the tests and for a hand-run: `qualify` is how a name typed in the
// override box becomes the `owner/name` every comparison here uses.
export { qualify };
