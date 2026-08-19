// The FORCE half — "put these packs on these repos, with this config, now".
//
// The scan half (scan-for-needed-packs.mjs) answers "what might a member want": it
// fingerprints every member's shape and converges a SUSPECTED work-list issue in each
// member whose declaration does not carry what its files suggest. This half answers a
// question that was already decided: the owner names the packs, the repos and the
// configuration, and it converges a REQUESTED work-list issue in each named member.
// Both then fire the same member-side machinery — the member's own scheduler, forced
// to its adopt-requested-packs task, whose agent adopts with the repo checked out and
// opens one reviewed PR *there*. The fan-out model (#749): the enforcer DISPATCHES,
// the member EXECUTES, and no agent anywhere needs cross-repo access.
//
// WHAT CROSSES THE REPO BOUNDARY is an issue and a button-press, nothing else: the
// work-list issue carries the decision (packs, config, the owner's interview answers,
// rendered as the JSON the declaration will carry), and the wake dispatch names
// exactly one task. The adoption itself — declaration edit, re-vendor, scaffold, PR —
// happens in the member, under the member's own declaration's guards.
//
// REFUSAL IS A FEATURE, and it is total: every check runs BEFORE any issue is
// written, so a force is all-or-nothing. A partially-applied mass addition — three
// repos adopted, the fourth blocked on an unanswered question — is the state that is
// hardest to see and hardest to undo. In particular an unanswered interview question
// REFUSES the run (owner ruling, 2026-08-10): adopt-pack's unattended rule is never
// to guess an answer, and a force that let one through would be the one path in the
// system that writes a decision nobody made into a file that then propagates by
// `requires` closure.

import { readDeclaration, isDormant } from '../../fleet-api.mjs';
import { LABEL, REQUESTED_TITLE, entriesIn } from './protocol.mjs';
import { ensureLabel, labeledIssues } from '../../fleet-api.mjs';

// --- validation (pure) --------------------------------------------------------

// Qualify a name the operator typed against the configured owner: `Name` and
// `owner/Name` both mean the same repo, and typing the owner four times is friction
// with no upside. Lowercased, because every other comparison in this pack is.
export function qualify(name, owner) {
  return (name.includes('/') ? name : `${owner}/${name}`).toLowerCase();
}

// Which pack ids the corpus does not know. A typo here would otherwise reach a
// member's declaration, where an unknown pack id is a BLOCKING settings error — the
// repo stops running its own checks until someone edits the file by hand.
export function unknownPacks(addPacks, packs) {
  const known = new Set(packs.map((p) => p.id));
  return addPacks.filter((id) => !known.has(id));
}

// Every adoption-interview question the force did not answer, as
// `{ pack, question, prompt }`. The gate the run refuses on — see the header. An
// answer of `n/a` is the OWNER's answer and passes here; only an ABSENT one blocks.
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

// The declaration entry the member's agent is to write, rendered as the JSON it will
// become. Rendered rather than described: the operator's config and answers travel
// through a text box, an issue and an agent, and the one place a transcription can
// be checked against intent is a literal the reader can compare to what lands in the
// file. The member side reads it back with the protocol's `entriesIn`.
export function entryFor(id, { packConfig = {}, packAnswers = {} } = {}) {
  const entry = { id };
  if (packConfig[id] && Object.keys(packConfig[id]).length) entry.config = packConfig[id];
  if (packAnswers[id] && Object.keys(packAnswers[id]).length) entry.answers = packAnswers[id];
  return entry;
}

export function requestedBody({ addPacks, packConfig, packAnswers, packsById = new Map(), enforcer = null }) {
  const entries = addPacks.map((id) => entryFor(id, { packConfig, packAnswers }));
  return [
    'This repo is to declare the packs below. **Not a fingerprint\'s suspicion**: the fleet',
    `owner requested it by hand${enforcer ? ` (via \`${enforcer}\`)` : ''}, with the configuration and the adoption-interview`,
    'answers already decided. Nothing has been written to this repo — the adoption is this',
    'repo\'s own adopt-requested-packs task\'s job, and its scheduler has been fired.',
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
    'Merge these verbatim into `.claudinite-checks.json`\'s `packs` (into an entry the repo',
    'already carries where one exists — never replacing a config it already chose):',
    '',
    '```json',
    JSON.stringify(entries, null, 2),
    '```',
    '',
    'The `answers` are the owner\'s answers to those packs\' adoption interviews, recorded',
    'verbatim as adopt-pack requires. **Every** question these packs ask is answered above —',
    'the forced fleet run refuses to file this issue otherwise — so nothing here is left to',
    'guess.',
    '',
    'Converged by the fleet\'s add-missing-packs sweep: it closes this `completed` once the',
    'declaration carries the packs.',
  ].join('\n');
}

// --- the run ------------------------------------------------------------------

// Resolve and vet every named repo BEFORE anything is written. Returns
// `{ targets, alreadyDeclared }` — a target carries the member's declaration row
// (default branch included) so the fire step never re-fetches. Anything wrong
// throws, because a force is all-or-nothing (see the header).
export async function resolveTargets(gh, { repos, owner, addPacks, reposByName = new Map() }) {
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
    targets.push({ fullName, missing, defaultBranch: reposByName.get(fullName)?.default_branch ?? null });
  }
  if (problems.length) {
    throw new Error(`${problems.length} named repo(s) cannot be forced, so none were: ${problems.join('; ')}`);
  }
  return { targets, alreadyDeclared };
}

// Converge the REQUESTED work-list issue in one member: open it, or rewrite it when
// the request changed (a repeated force with a corrected config is the case that
// makes rewriting the safe default — the issue is a work list, and a work list
// assembled from a comment thread is one nobody reads to the bottom of). Returns a
// one-line action for the report, or null when the issue was already right.
export async function convergeRequestedIssue(gh, fullName, { body }) {
  await ensureLabel(gh, fullName, LABEL, {
    color: '0E8A16',
    description: 'The fleet asks this repo to declare packs — adopted by the adopt-requested-packs task',
  });
  const { open } = await labeledIssues(gh, fullName, LABEL);
  const existing = open.find((i) => i.title === REQUESTED_TITLE);
  if (existing) {
    if (existing.body === body) return { number: existing.number, action: null };
    // A prior request may still be outstanding; MERGE rather than replace would need
    // the member's declaration re-read against both bodies. Simpler and honest: the
    // new body is built from the full current ask (resolveTargets recomputed what is
    // missing), so it already IS the merge.
    await gh(`/repos/${fullName}/issues/${existing.number}`, { method: 'PATCH', body: { body } });
    return { number: existing.number, action: `updated #${existing.number}` };
  }
  const { status, json } = await gh(`/repos/${fullName}/issues`, {
    method: 'POST', body: { title: REQUESTED_TITLE, body, labels: [LABEL] },
  });
  if (status !== 201) throw new Error(`creating the requested-packs issue in ${fullName} returned ${status}`);
  return { number: json.number, action: `opened #${json.number}` };
}

// Close a member's REQUESTED issue once its declaration carries everything the issue
// asked for. Runs from the weekly sweep, per covered member — completion is a fact
// about the member's declaration, not about which run opened the issue.
export async function closeSatisfiedRequest(gh, fullName, { decl, open }) {
  const issue = open.find((i) => i.title === REQUESTED_TITLE);
  if (!issue) return null;
  const entries = entriesIn(issue.body);
  if (!entries) return null; // unreadable body — leave it for a human, never close it blind
  const declared = new Set((decl.packs ?? []).map((p) => (typeof p === 'string' ? p : p?.id)).filter(Boolean));
  const missing = entries.map((e) => e.id).filter((id) => !declared.has(id));
  if (missing.length) return null; // still outstanding
  await gh(`/repos/${fullName}/issues/${issue.number}/comments`, {
    method: 'POST', body: { body: 'Closed by the fleet\'s add-missing-packs sweep: the declaration now carries every requested pack.' },
  });
  await gh(`/repos/${fullName}/issues/${issue.number}`, {
    method: 'PATCH', body: { state: 'closed', state_reason: 'completed' },
  });
  return `closed #${issue.number} (${fullName}: request satisfied)`;
}

// The force half's own section of the run summary. Reported separately from the
// scan's, because they answer different questions and a reader looking for "what did
// my force do" should not have to read a fleet roster first.
export function renderForceSummary({ owner, addPacks, targets, alreadyDeclared, actions, fired }) {
  return [
    `# Forced pack addition — ${owner}`,
    '',
    `Packs: ${addPacks.map((p) => `\`${p}\``).join(', ')}`,
    '',
    '| requested | work lists placed | schedulers fired | already declaring |',
    '| --- | --- | --- | --- |',
    `| ${targets.length + alreadyDeclared.length} | ${targets.length} | ${fired.length} | ${alreadyDeclared.length} |`,
    '',
    targets.length
      ? `**To adopt (issue in each repo, scheduler fired):**\n${targets.map((t) => `- \`${t.fullName}\` → ${t.missing.join(', ')}`).join('\n')}`
      : '**To adopt:** none — every named repo already declares every named pack.',
    alreadyDeclared.length ? `**Already declaring (untouched):** ${alreadyDeclared.join(', ')}` : '',
    actions.length ? `**Issue actions:** ${actions.join('; ')}` : '',
    '',
    '_Nothing was written to any member\'s tree. Each member\'s own adopt-requested-packs_',
    '_task adopts what its issue says — with the repo checked out, one reviewed PR there._',
  ].filter(Boolean).join('\n');
}
