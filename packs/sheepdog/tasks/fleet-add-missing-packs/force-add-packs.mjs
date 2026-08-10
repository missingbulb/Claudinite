// The FORCE half — "put these packs on these repos, with this config, now".
//
// The scan half (scan-for-needed-packs.mjs) answers "what might a member want": it
// fingerprints every member's shape and converges an issue per member whose declaration
// does not carry what its files suspect. This half answers a question that was already
// decided: the owner names the packs, the repos and the configuration, and this converges
// the same work-list issues from that instead of from a fingerprint. Both then meet the
// SAME second stage — the agent running adopt-pack against each member, one reviewed PR
// each — which is the whole reason this is one task with two first stages rather than two
// tasks with one duplicated second stage.
//
// IT WRITES NOTHING TO A MEMBER. Like the scan, its only side effect is issues in the
// enforcer repo; the declaration edit, the re-vendor, the scaffold and the PR are the
// agent's, in the member, through adopt-pack. What this half adds is that the work list
// carries the ANSWERS: the config to write and the interview answers the owner gave, so
// the agent applies a decision instead of making one.
//
// REFUSAL IS A FEATURE, and it is total: every check below throws BEFORE any issue is
// written, so a force is all-or-nothing. A partially-applied mass addition — three repos
// adopted, the fourth blocked on an unanswered question — is the state that is hardest to
// see and hardest to undo, and the whole point of forcing is that the operator already
// knows what they want. In particular an unanswered interview question REFUSES the run
// (owner ruling, 2026-08-10): adopt-pack's unattended rule is never to guess an answer,
// and a force that let one through would be the one path in the system that writes a
// decision nobody made into a file that then propagates by `requires` closure.
//
// Dependency-free; reads each named member's declaration and writes only in the enforcer.

import { readDeclaration, isDormant } from '../../fleet-api.mjs';
// The label both halves converge under, imported by name rather than re-declared, so the
// two can never drift apart: an issue filed under a label the agent stage does not read is
// work that silently never happens.
import { LABEL } from './scan-for-needed-packs.mjs';

export const forceTitle = (fullName) => `Add packs: ${fullName}`;
export const FORCE_TITLE_RE = /^Add packs: (\S+\/\S+)$/;

// --- validation (pure) --------------------------------------------------------

// Qualify a name the operator typed against the configured owner: `Name` and
// `owner/Name` both mean the same repo, and typing the owner four times is friction with
// no upside. Lowercased, because every other comparison in this pack is.
export function qualify(name, owner) {
  return (name.includes('/') ? name : `${owner}/${name}`).toLowerCase();
}

// Which pack ids the corpus does not know. A typo here would otherwise reach a member's
// declaration, where an unknown pack id is a BLOCKING settings error — the repo stops
// running its own checks until someone edits the file by hand.
export function unknownPacks(addPacks, packs) {
  const known = new Set(packs.map((p) => p.id));
  return addPacks.filter((id) => !known.has(id));
}

// Every adoption-interview question the force did not answer, as
// `{ pack, question, prompt }`. The gate the run refuses on — see the header. An answer
// of `n/a` is the OWNER's answer and passes here; only an ABSENT one blocks.
export function unansweredQuestions(addPacks, packs, packAnswers = {}) {
  const byId = new Map(packs.map((p) => [p.id, p]));
  const out = [];
  for (const id of addPacks) {
    for (const q of byId.get(id)?.questions ?? []) {
      if (!String(packAnswers[id]?.[q.id] ?? '').trim()) out.push({ pack: id, question: q.id, prompt: q.prompt });
    }
  }
  return out;
}

// --- the issue body (pure) ----------------------------------------------------

// The declaration entry the agent is to write, rendered as the JSON it will become.
// Rendered rather than described: the operator's config and answers travel through a
// text box, an issue and an agent, and the one place a transcription can be checked
// against intent is a literal the reader can compare to what lands in the file.
export function entryFor(id, { packConfig = {}, packAnswers = {} } = {}) {
  const entry = { id };
  if (packConfig[id] && Object.keys(packConfig[id]).length) entry.config = packConfig[id];
  if (packAnswers[id] && Object.keys(packAnswers[id]).length) entry.answers = packAnswers[id];
  return entry;
}

export function forceBody(fullName, { addPacks, packConfig, packAnswers, packsById = new Map(), requestedBy = null }) {
  const entries = addPacks.map((id) => entryFor(id, { packConfig, packAnswers }));
  return [
    `\`${fullName}\` is to declare the packs below. This is **not a fingerprint's suspicion**:`,
    'it was requested by hand, with the configuration and the interview answers already',
    `decided${requestedBy ? ` (${requestedBy})` : ''}. Nothing has been written to the repo — that is the adoption's job.`,
    '',
    '## Packs to add',
    '',
    ...addPacks.map((id) => {
      const belongs = packsById.get(id)?.ruleRoutingGuidance?.belongs;
      return `- **\`${id}\`**${belongs ? ` — ${belongs}` : ''}`;
    }),
    '',
    '## The declaration entries to write',
    '',
    'Write these verbatim into `.claudinite-checks.json`\'s `packs` (merging into an entry the',
    'repo already carries, never replacing a config it already chose):',
    '',
    '```json',
    JSON.stringify(entries, null, 2),
    '```',
    '',
    'The `answers` are the owner\'s answers to those packs\' adoption interviews, recorded',
    'verbatim as adopt-pack requires. **Every** question these packs ask is answered above —',
    'the forced run refuses to open this issue otherwise — so nothing here is left for the',
    'agent to guess.',
    '',
    'Adopt with the **adopt-pack** skill: declare, re-vendor, scaffold, get the checks green,',
    'and land one reviewed PR on this repo. Then link it here.',
    '',
    'Converged by the fleet-add-missing-packs task: it closes `completed` once the repo',
    'declares the packs, and `not planned` once the repo leaves the fleet.',
  ].join('\n');
}

// --- the run ------------------------------------------------------------------

// Resolve and vet every named repo BEFORE anything is written. Returns
// `{ targets, alreadyDeclared }`; anything wrong throws, because a force is
// all-or-nothing (see the header).
export async function resolveTargets(gh, { repos, owner, addPacks }) {
  const targets = []; const alreadyDeclared = [];
  const problems = [];
  for (const name of repos) {
    const fullName = qualify(name, owner);
    if (!fullName.startsWith(`${owner}/`)) {
      problems.push(`${fullName} is not under the configured owner \`${owner}\` — this fleet reaches no other`);
      continue;
    }
    let decl;
    try {
      decl = await readDeclaration(gh, fullName);
    } catch (e) {
      problems.push(`${fullName}: could not read its declaration (${e.message})`);
      continue;
    }
    if (decl === null) {
      problems.push(`${fullName} is not a covered member (no tracked .claudinite-checks.json) — adoption of the whole corpus is the census's business, not this task's`);
      continue;
    }
    if (isDormant(decl)) {
      problems.push(`${fullName} declared itself dormant — it stopped its own upkeep on purpose, so adding a pack to it is work it has opted out of`);
      continue;
    }
    const declared = new Set((decl.packs ?? []).map((p) => (typeof p === 'string' ? p : p?.id)).filter(Boolean));
    const missing = addPacks.filter((id) => !declared.has(id));
    if (!missing.length) { alreadyDeclared.push(fullName); continue; }
    targets.push({ fullName, missing });
  }
  if (problems.length) {
    throw new Error(`${problems.length} named repo(s) cannot be forced, so none were: ${problems.join('; ')}`);
  }
  return { targets, alreadyDeclared };
}

// Converge one request issue per target. Same lifecycle as the scan's issues — the label
// is shared, and the scan's own convergence closes them once the member declares the
// packs, which is exactly the right closer: "the declaration now carries it" is the same
// completion whichever half opened the issue.
export async function convergeForceIssues(gh, home, { targets, addPacks, packConfig, packAnswers, packsById, requestedBy, open }) {
  const actions = [];
  for (const { fullName, missing } of targets) {
    const title = forceTitle(fullName);
    const body = forceBody(fullName, {
      addPacks: missing, packConfig, packAnswers, packsById, requestedBy,
    });
    const existing = open.get(title);
    if (existing) {
      // Rewrite rather than comment: the issue is a work list, and a work list assembled
      // from a comment thread is one nobody reads to the bottom of. A repeated force with
      // a corrected config is the case this makes safe.
      if (existing.body !== body) {
        await gh(`/repos/${home}/issues/${existing.number}`, { method: 'PATCH', body: { body } });
        actions.push(`updated #${existing.number} (${fullName}: forced ${missing.join(', ')})`);
      } else {
        actions.push(`unchanged #${existing.number} (${fullName})`);
      }
      continue;
    }
    const { status, json } = await gh(`/repos/${home}/issues`, {
      method: 'POST', body: { title, body, labels: [LABEL] },
    });
    if (status !== 201) throw new Error(`creating the forced addition issue for ${fullName} returned ${status}`);
    actions.push(`opened #${json.number} (${fullName}: forced ${missing.join(', ')})`);
  }
  return actions;
}

// --- closing a forced work list ------------------------------------------------

// The pack ids a forced issue asked for, read back out of its own body. The body renders
// the declaration entries as JSON precisely so this is a parse and not a guess; an issue
// whose block cannot be read is left OPEN (null), because "I could not tell" must never
// close a request the owner made.
export function packsRequestedIn(body) {
  const m = /```json\n([\s\S]*?)\n```/.exec(String(body ?? ''));
  if (!m) return null;
  try {
    const entries = JSON.parse(m[1]);
    if (!Array.isArray(entries)) return null;
    const ids = entries.map((e) => e?.id).filter((id) => typeof id === 'string');
    return ids.length ? ids : null;
  } catch { return null; }
}

// Converge the forced issues the way the scan converges its own: closed `completed` once
// the member declares everything the issue asked for, closed `not planned` once the member
// has left the fleet. It runs on EVERY run of this task, scan or force, because a forced
// request's completion is a fact about the member and not about which half opened it —
// and a run that only ever opens issues is one whose label fills up with finished work.
export async function convergeForceClosures(gh, home, { open }) {
  const actions = [];
  for (const [title, issue] of open) {
    const m = FORCE_TITLE_RE.exec(title);
    if (!m) continue;
    const fullName = m[1];
    const requested = packsRequestedIn(issue.body);
    if (!requested) continue; // unreadable body — leave it to a human, never close it blind
    let decl;
    try {
      decl = await readDeclaration(gh, fullName);
    } catch {
      continue; // unreadable member — the same rule: not measured is not converged
    }
    if (decl && isDormant(decl)) continue; // it went dormant mid-adoption: a human's call, not a close
    const left = decl === null;
    if (!left) {
      const declared = new Set((decl.packs ?? []).map((p) => (typeof p === 'string' ? p : p?.id)).filter(Boolean));
      if (requested.some((id) => !declared.has(id))) continue; // still outstanding
    }
    const note = left
      ? 'is no longer a covered member of the fleet'
      : `now declares ${requested.join(', ')}`;
    await gh(`/repos/${home}/issues/${issue.number}/comments`, {
      method: 'POST', body: { body: `Closed by fleet-add-missing-packs: \`${fullName}\` ${note}.` },
    });
    await gh(`/repos/${home}/issues/${issue.number}`, {
      method: 'PATCH', body: { state: 'closed', state_reason: left ? 'not_planned' : 'completed' },
    });
    actions.push(`closed #${issue.number} (${fullName}: ${note})`);
  }
  return actions;
}

// The force half's own section of the run summary. Reported separately from the scan's,
// because they answer different questions and a reader looking for "what did my force
// do" should not have to read a fleet roster first.
export function renderForceSummary({ owner, addPacks, targets, alreadyDeclared, actions }) {
  return [
    `# Forced pack addition — ${owner}`,
    '',
    `Packs: ${addPacks.map((p) => `\`${p}\``).join(', ')}`,
    '',
    `| requested | work lists opened/updated | already declaring |`,
    '| --- | --- | --- |',
    `| ${targets.length + alreadyDeclared.length} | ${targets.length} | ${alreadyDeclared.length} |`,
    '',
    targets.length
      ? `**To adopt:**\n${targets.map((t) => `- \`${t.fullName}\` → ${t.missing.join(', ')}`).join('\n')}`
      : '**To adopt:** none — every named repo already declares every named pack.',
    alreadyDeclared.length ? `**Already declaring (untouched):** ${alreadyDeclared.join(', ')}` : '',
    actions.length ? `**Issue actions:** ${actions.join('; ')}` : '**Issue actions:** none (converged)',
    '',
    '_Nothing was written to any member. The adoption itself — declaration, re-vendor,_',
    '_scaffold, PR — is the agent stage\'s, per member, through adopt-pack._',
  ].filter(Boolean).join('\n');
}
