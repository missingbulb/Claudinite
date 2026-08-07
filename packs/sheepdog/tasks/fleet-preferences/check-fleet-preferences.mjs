#!/usr/bin/env node
// The sheepdog pack's fleet-PREFERENCES sweep — the enforcer telling every member
// where this fleet's people keep their personal preferences. Run by this pack's
// `fleet-preferences` scheduled task (tasks/fleet-preferences/), whose worker calls
// `main()` below as the task's `prework`, Action-side inside the enforcer repo's
// scheduler workflow where FLEET_GITHUB_TOKEN is reachable. Still runnable by hand
// (`node check-fleet-preferences.mjs`) via the CLI guard at the foot.
//
// WHAT IT WRITES, and why nothing else can. Personal preferences are read into a
// session by the UserPreferencesStore pack, whose entry config names the STORE they
// live in. Every member needs that declaration, and no member can derive it: the
// store is a fact about the FLEET. Canon cannot supply it either — a bootstrap run
// does not know which fleet it is bootstrapping into, and one fleet's repo hardcoded
// in shared code is the coupling the whole shape exists to remove. The enforcer knows
// exactly: it IS the fleet. So the declaration is written from here.
//
// IT WRITES — the one sweep in this pack that does. The others report a condition and
// converge an issue for a human; this one lands a pack declaration that carries no
// human decision (the fleet's store is a fact this repo holds), so an issue asking
// someone to copy it into every member would be ceremony around a mechanical edit.
// The write is one PUT to the member's default branch, guarded by the blob sha the
// read returned. It is not a content migration and does not use the maintenance-branch
// lane (migrations/fleet-apply.mjs): there is no code in it, nothing to review, and it
// is idempotent — a member already naming the right store is read and left alone. It
// does REFORMAT the declaration it edits to canonical 2-space JSON (the shape `--init`
// writes), because it round-trips the file through JSON rather than text-editing
// settings.
//
// THE MOUNT GATE, and why the rollout needs one. A declared pack whose code is not in
// the member's mount is a blocking `config` error ("declares unknown pack"), and a
// member's mount carries only what that member declared as of its last converge. So
// the sweep writes only where the pack is already ON DISK — which, for the fleet that
// existed when this landed, is what the one-time baseline migration arranges: it
// declares the pack in the same transactional commit that re-vendors the mount. Here
// `not-vendored` is a WAIT, not a finding: members converge nightly, and each is
// written the first run after its own mount carries the pack.
//
// A DORMANT member is never written to, like everywhere else in this pack: it declared
// itself out of the recurring work, and a commit landed from outside is exactly the
// upkeep it opted out of.
//
// A member whose store is a DIFFERENT repo is reported, never overwritten. The fleet
// is the authority on where its preferences live, but a store someone set deliberately
// is a decision, and silently replacing it would be the sweep deciding what it cannot
// know.
//
// Dependency-free (global fetch, Node 20+). Reads every member; writes one pack
// declaration to the members that need it, and nothing else anywhere.
//
// It lives IN its task's folder (tasks/fleet-preferences/) because nothing else uses
// it — only this task's worker.mjs imports it. What IS shared with the other sweeps
// sits at the pack root: the cross-repo REST primitives (fleet-api.mjs) and the config
// reader (fleet-config.mjs).

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { makeGh, paged, fileExists, readDeclaration, putFile, isDormant, DECLARATION } from '../../fleet-api.mjs';
import { parseSheepdogConfig } from '../../fleet-config.mjs';

// The pack that reads a person's preferences into their session, and where its code
// sits in a member's tree. Named here rather than imported: the sweep runs against
// ANOTHER repo's tree over the API, and there is nothing of that member's mount to
// import.
export const PACK_ID = 'UserPreferencesStore';
const PACK_IN_MOUNT = `.claudinite/shared/packs/${PACK_ID}/pack.mjs`;
const PACK_IN_CANON = `packs/${PACK_ID}/pack.mjs`;

// --- classification (pure) ----------------------------------------------------

export const SET = 'set';

// `config` is the member's parsed declaration, `wanted` the fleet's store repo,
// `vendored` whether that member's tree carries the pack's code yet. Kept free of I/O
// so every branch is testable directly.
export function classifyPreferences({ config, wanted, vendored }) {
  const entry = (Array.isArray(config?.packs) ? config.packs : [])
    .find((e) => (typeof e === 'string' ? e : e?.id) === PACK_ID);
  const current = entry && typeof entry === 'object' ? entry.config?.repo : undefined;

  if (typeof current === 'string' && current.trim()) {
    if (current.toLowerCase() === wanted.toLowerCase()) {
      return { state: SET, detail: `already names ${current}` };
    }
    return {
      state: 'elsewhere',
      detail: `names ${current}, not the fleet's ${wanted} — left alone, because a store someone set deliberately is a decision`,
    };
  }
  if (!vendored) {
    return {
      state: 'not-vendored',
      detail: `its mount does not carry the ${PACK_ID} pack yet — waiting for the converge that vendors it, rather than declaring a pack whose code is absent (a blocking config error there)`,
    };
  }
  return {
    state: 'writable',
    detail: entry === undefined
      ? `declares no preferences store — naming ${wanted}`
      : `declares ${PACK_ID} with no usable store — naming ${wanted}`,
  };
}

// --- the write ----------------------------------------------------------------

// The member's declaration with the pack declared at the fleet's store, as text.
// Round-trips through JSON so the result is canonical settings (2-space, trailing
// newline — what `--init` writes) rather than the product of editing JSON as text. An
// existing entry keeps its position and its other properties; a new one lands at the
// end of `packs`.
export function withPreferencesPack(text, wanted) {
  const config = JSON.parse(text);
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('the declaration is not a JSON object');
  }
  const packs = Array.isArray(config.packs) ? [...config.packs] : [];
  const at = packs.findIndex((e) => (typeof e === 'string' ? e : e?.id) === PACK_ID);
  const prior = at === -1 || typeof packs[at] === 'string' ? { id: PACK_ID } : packs[at];
  const entry = { ...prior, id: PACK_ID, config: { ...(prior.config ?? {}), repo: wanted } };
  if (at === -1) packs.push(entry); else packs[at] = entry;
  return `${JSON.stringify({ ...config, packs }, null, 2)}\n`;
}

const commitMessage = (wanted) => [
  `Declare where this project's people keep their preferences (${wanted})`,
  '',
  'Personal interaction preferences belong to this fleet\'s people, so each project',
  'declares the UserPreferencesStore pack and names the repo holding them; that',
  'pack\'s session-start step reads the current user\'s <email>.md from it.',
  '',
  'Written by the sheepdog pack\'s fleet-preferences sweep.',
].join('\n');

// --- main ---------------------------------------------------------------------

export async function main() {
  const token = process.env.FLEET_GITHUB_TOKEN;
  const home = process.env.GITHUB_REPOSITORY;
  if (!token) {
    throw new Error('FLEET_GITHUB_TOKEN is not set. Add a repo secret with a fine-grained PAT '
      + '(this account, ALL repositories, Metadata read, Contents READ AND WRITE, Issues read/write) — '
      + 'this sweep writes one pack declaration into each member, so Contents read alone is not enough.');
  }
  if (!home || !home.includes('/')) throw new Error('GITHUB_REPOSITORY is not set (owner/repo)');
  const gh = makeGh(token);

  const homeCfg = await readDeclaration(gh, home);
  if (homeCfg === null) throw new Error(`the sheepdog repo ${home} has no readable ${DECLARATION}`);
  const { owner, exclude, preferencesRepo } = parseSheepdogConfig(homeCfg, home);

  const mine = (await paged(gh, '/user/repos?affiliation=owner'))
    .filter((r) => r.owner.login.toLowerCase() === owner);
  if (mine.length === 0) {
    throw new Error(`enumeration returned no repos owned by ${owner} — wrong token user or scope`);
  }

  const written = []; const already = []; const waiting = []; const elsewhere = [];
  const dormant = []; const outOfScope = []; const unknown = [];
  for (const r of mine.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullName = r.full_name.toLowerCase();
    if (r.archived || r.fork || exclude.has(fullName)) { outOfScope.push(`${fullName} — archived, a fork, or excluded`); continue; }
    try {
      // The declaration is read WITH its bytes and sha: the write below hands that sha
      // back as its precondition, so the file this sweep decided about is the file it
      // writes — one read, no window.
      const read = await readDeclaration(gh, r.full_name, DECLARATION, { withFile: true });
      if (read === null) { outOfScope.push(`${fullName} — uncovered (the census owns it)`); continue; }
      if (isDormant(read.config)) { dormant.push(fullName); continue; }

      // Is the pack's code on that member's disk? The vendored mount first, then the
      // repo root — which is how the canon repo (it runs its own live tree, mounting
      // nothing) is swept by the same code path instead of a special case.
      const vendored = await fileExists(gh, r.full_name, PACK_IN_MOUNT)
        || await fileExists(gh, r.full_name, PACK_IN_CANON);

      const verdict = classifyPreferences({ config: read.config, wanted: preferencesRepo, vendored });
      if (verdict.state === SET) { already.push(fullName); continue; }
      if (verdict.state === 'elsewhere') { elsewhere.push(`${fullName} — ${verdict.detail}`); continue; }
      if (verdict.state === 'not-vendored') { waiting.push(fullName); continue; }

      const next = withPreferencesPack(read.text, preferencesRepo);
      await putFile(gh, r.full_name, {
        path: DECLARATION, text: next, sha: read.sha, message: commitMessage(preferencesRepo),
      });
      written.push(`${fullName} — ${verdict.detail}`);
    } catch (e) {
      unknown.push(`${r.full_name} — ${e.message}`);
    }
  }

  // The full roster, every repo under exactly one state — a report that names only the
  // exceptions has silent holes, and a reader cannot tell "fine" from "fell out of the
  // report".
  const summary = [
    `# Fleet preferences sweep — ${owner} (store: ${preferencesRepo})`,
    '',
    '| already set | written | waiting on the mount | naming another store | dormant | out of scope | unknown |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    `| ${already.length} | ${written.length} | ${waiting.length} | ${elsewhere.length} | ${dormant.length} | ${outOfScope.length} | ${unknown.length} |`,
    '',
    written.length ? `**Written:**\n${written.map((w) => `- ${w}`).join('\n')}` : '**Written:** none',
    already.length ? `**Already naming the fleet's store:** ${already.join(', ')}` : '',
    waiting.length ? `**Waiting on their next converge (the pack is not in their mount yet):** ${waiting.join(', ')}` : '',
    elsewhere.length ? `**Naming a different store (left alone):**\n${elsewhere.map((e) => `- ${e}`).join('\n')}` : '',
    dormant.length ? `**Dormant (self-declared, not written to):** ${dormant.join(', ')}` : '',
    outOfScope.length ? `**Out of scope:**\n${outOfScope.map((o) => `- ${o}`).join('\n')}` : '',
    unknown.length ? `**UNKNOWN (read or write failed — fix the token/scope):** ${unknown.join('; ')}` : '',
  ].filter(Boolean).join('\n');

  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);

  if (unknown.length) {
    throw new Error(`${unknown.length} repo(s) could not be read or written — this run fails so the cause is escalated `
      + 'rather than leaving a member quietly without its preferences store');
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error(`fleet-preferences sweep failed: ${e.message}`); process.exit(1); });
}
