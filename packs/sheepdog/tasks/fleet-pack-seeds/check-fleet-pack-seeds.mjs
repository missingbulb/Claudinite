#!/usr/bin/env node
// The sheepdog pack's fleet PACK-SEED sweep — the enforcer making sure every member
// declares the packs this fleet has decided its repos should run, with the parameters
// only the fleet knows. Run by this pack's `fleet-pack-seeds` scheduled task, whose
// worker calls `main()` below as the task's `prework`, Action-side inside the enforcer
// repo's scheduler workflow where FLEET_GITHUB_TOKEN is reachable. Still runnable by
// hand (`node check-fleet-pack-seeds.mjs`) via the CLI guard at the foot.
//
// WHY IT EXISTS. Some packs need a parameter no member can derive, because the answer
// is a fact about the FLEET rather than about that repo — where its people's files
// live, which repo holds something shared, what the group calls itself. Canon cannot
// supply it: a bootstrap run does not know which fleet it is bootstrapping into, and
// one fleet's value hardcoded in shared code is exactly the coupling packs exist to
// prevent. The enforcer can: it IS the fleet. So this repo's own config lists what its
// members should declare, and this sweep converges that list across them.
//
// IT KNOWS NO PACK BY NAME. Every id and every config below comes from `packSeeds` on
// this repo's sheepdog entry (fleet-config.mjs). That is the whole point: the enforcer
// contributes the MECHANISM — "these declarations, in every member" — and the fleet
// that declares this pack supplies the content. A sweep that named a pack would make
// the enforcer a second place packs are known, and the next fleet would inherit a
// choice that was never theirs.
//
// IT WRITES — the one sweep in this pack that does. The others report a condition and
// converge an issue for a human; a seed carries no human decision (the fleet already
// made it, in this repo's config), so an issue asking someone to copy it into every
// member would be ceremony around a mechanical edit. The write is one PUT to the
// member's default branch, guarded by the blob sha the read returned. It is not a
// content migration and does not use the maintenance-branch lane
// (migrations/fleet-apply.mjs): there is no code in it, nothing to review, and it is
// idempotent — a member already declaring the seed is read and left alone. It does
// REFORMAT the declaration it edits to canonical 2-space JSON (the shape `--init`
// writes), because it round-trips the file through JSON rather than text-editing
// settings.
//
// THE MOUNT GATE. A declared pack whose code is not in the member's mount is a blocking
// `config` error there ("declares unknown pack"), and a member's mount carries only what
// that member declared as of its last converge. So a seed is written only where the
// pack's code is already ON DISK — for a pack arriving with canon, that is what the
// baseline migration arranges (it declares and re-converges in one transactional
// commit). `not-vendored` is a WAIT, not a finding: members converge nightly, and each
// is written the first run after its own mount carries the pack.
//
// SEED, NEVER OVERRIDE. A member that already declares the pack keeps its entry, and
// one that already carries a config for it keeps that config: both are that repo's
// decisions, and the fleet's list is a floor, not a ceiling. The same contract the
// `declarePacks` migration op keeps, for the same reason.
//
// A DORMANT member is never written to, like everywhere else in this pack: it declared
// itself out of the recurring work, and a commit landed from outside is exactly the
// upkeep it opted out of.
//
// Dependency-free (global fetch, Node 20+). Reads every member; writes declarations to
// the members that need them, and nothing else anywhere.
//
// It lives IN its task's folder because nothing else uses it — only this task's
// worker.mjs imports it. What IS shared with the other sweeps sits at the pack root:
// the cross-repo REST primitives (fleet-api.mjs) and the config reader
// (fleet-config.mjs).

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { makeGh, paged, fileExists, readDeclaration, putFile, isDormant, DECLARATION } from '../../fleet-api.mjs';
import { parseSheepdogConfig } from '../../fleet-config.mjs';

// Where a pack's code sits in a member's tree. Checked rather than assumed: the mount
// is what makes a declaration legal.
const inMount = (id) => `.claudinite/shared/packs/${id}/pack.mjs`;
const inCanon = (id) => `packs/${id}/pack.mjs`;

// --- classification (pure) ----------------------------------------------------

export const SET = 'set';

// One member against one seed. `config` is the member's parsed declaration, `seed` the
// `{ id, config }` the fleet wants declared, `vendored` whether that member's tree
// carries the pack's code. Kept free of I/O so every branch is testable directly.
export function classifySeed({ config, seed, vendored }) {
  const entry = (Array.isArray(config?.packs) ? config.packs : [])
    .find((e) => (typeof e === 'string' ? e : e?.id) === seed.id);
  const declared = entry !== undefined;
  const hasConfig = entry !== undefined && typeof entry === 'object' && entry.config !== undefined;

  // Declared, and carrying whatever parameters it chose: converged. The fleet's list is
  // a floor — "this pack, with these parameters if you have none" — never an override.
  if (declared && (hasConfig || !seed.config)) {
    return { state: SET, detail: hasConfig ? `already declares ${seed.id} with its own config` : `already declares ${seed.id}` };
  }
  if (!vendored) {
    return {
      state: 'not-vendored',
      detail: `its mount does not carry the ${seed.id} pack yet — waiting for the converge that vendors it, rather than declaring a pack whose code is absent (a blocking config error there)`,
    };
  }
  return {
    state: 'writable',
    detail: declared ? `declares ${seed.id} with no config — adding the fleet's` : `does not declare ${seed.id} — adding it`,
  };
}

// --- the write ----------------------------------------------------------------

// The member's declaration with every writable seed applied, as text. Round-trips
// through JSON so the result is canonical settings (2-space, trailing newline — what
// `--init` writes) rather than the product of editing JSON as text. An existing entry
// keeps its position and its other properties; a new one lands at the end of `packs`.
export function withSeeds(text, seeds) {
  const config = JSON.parse(text);
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('the declaration is not a JSON object');
  }
  const packs = Array.isArray(config.packs) ? [...config.packs] : [];
  const idOf = (e) => (typeof e === 'string' ? e : e?.id);
  for (const seed of seeds) {
    const at = packs.findIndex((e) => idOf(e) === seed.id);
    if (at === -1) {
      packs.push(seed.config ? { id: seed.id, config: seed.config } : seed.id);
      continue;
    }
    if (!seed.config) continue;
    const prior = typeof packs[at] === 'string' ? { id: seed.id } : packs[at];
    if (prior.config !== undefined) continue;      // the repo's own parameters — untouched
    packs[at] = { ...prior, id: seed.id, config: seed.config };
  }
  return `${JSON.stringify({ ...config, packs }, null, 2)}\n`;
}

const commitMessage = (ids) => [
  `Declare the pack${ids.length > 1 ? 's' : ''} this fleet runs everywhere (${ids.join(', ')})`,
  '',
  'These carry a parameter no repo can derive on its own — it is a fact about the',
  'fleet, held by the fleet\'s own repo. Seeded, never overridden: a declaration or a',
  'config this repo already had is left exactly as it was.',
  '',
  'Written by the sheepdog pack\'s fleet-pack-seeds sweep.',
].join('\n');

// --- main ---------------------------------------------------------------------

export async function main() {
  const token = process.env.FLEET_GITHUB_TOKEN;
  const home = process.env.GITHUB_REPOSITORY;
  if (!token) {
    throw new Error('FLEET_GITHUB_TOKEN is not set. Add a repo secret with a fine-grained PAT '
      + '(this account, ALL repositories, Metadata read, Contents READ AND WRITE, Issues read/write) — '
      + 'this sweep writes a declaration into each member, so Contents read alone is not enough.');
  }
  if (!home || !home.includes('/')) throw new Error('GITHUB_REPOSITORY is not set (owner/repo)');
  const gh = makeGh(token);

  const homeCfg = await readDeclaration(gh, home);
  if (homeCfg === null) throw new Error(`the sheepdog repo ${home} has no readable ${DECLARATION}`);
  const { owner, exclude, packSeeds } = parseSheepdogConfig(homeCfg, home);

  if (!packSeeds.length) {
    // Nothing declared to seed is a legitimate fleet: the sweep says so and stops,
    // rather than walking every repo to decide nothing.
    const none = `# Fleet pack seeds — ${owner}\n\nNo \`packSeeds\` on this repo's sheepdog entry: this fleet asks its members to declare nothing in particular.`;
    console.log(none);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${none}\n`);
    return;
  }

  const mine = (await paged(gh, '/user/repos?affiliation=owner'))
    .filter((r) => r.owner.login.toLowerCase() === owner);
  if (mine.length === 0) {
    throw new Error(`enumeration returned no repos owned by ${owner} — wrong token user or scope`);
  }

  const written = []; const already = []; const waiting = []; const dormant = [];
  const outOfScope = []; const unknown = [];
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

      const toWrite = []; const waitingHere = []; const setHere = [];
      for (const seed of packSeeds) {
        // Is the pack's code on that member's disk? The vendored mount first, then the
        // repo root — which is how the canon repo (it runs its own live tree, mounting
        // nothing) is swept by the same code path instead of a special case.
        const vendored = await fileExists(gh, r.full_name, inMount(seed.id))
          || await fileExists(gh, r.full_name, inCanon(seed.id));
        const verdict = classifySeed({ config: read.config, seed, vendored });
        if (verdict.state === SET) setHere.push(seed.id);
        else if (verdict.state === 'not-vendored') waitingHere.push(seed.id);
        else toWrite.push(seed);
      }

      if (waitingHere.length) waiting.push(`${fullName} — ${waitingHere.join(', ')}`);
      if (!toWrite.length) {
        if (!waitingHere.length) already.push(fullName);
        continue;
      }
      const ids = toWrite.map((s) => s.id);
      await putFile(gh, r.full_name, {
        path: DECLARATION, text: withSeeds(read.text, toWrite), sha: read.sha, message: commitMessage(ids),
      });
      written.push(`${fullName} — ${ids.join(', ')}`);
    } catch (e) {
      unknown.push(`${r.full_name} — ${e.message}`);
    }
  }

  // The full roster, every repo under exactly one state — a report that names only the
  // exceptions has silent holes, and a reader cannot tell "fine" from "fell out of the
  // report".
  const summary = [
    `# Fleet pack seeds — ${owner} (seeds: ${packSeeds.map((s) => s.id).join(', ')})`,
    '',
    '| already declaring | written | waiting on the mount | dormant | out of scope | unknown |',
    '| --- | --- | --- | --- | --- | --- |',
    `| ${already.length} | ${written.length} | ${waiting.length} | ${dormant.length} | ${outOfScope.length} | ${unknown.length} |`,
    '',
    written.length ? `**Written:**\n${written.map((w) => `- ${w}`).join('\n')}` : '**Written:** none',
    already.length ? `**Already declaring every seed:** ${already.join(', ')}` : '',
    waiting.length ? `**Waiting on their next converge (the pack is not in their mount yet):**\n${waiting.map((w) => `- ${w}`).join('\n')}` : '',
    dormant.length ? `**Dormant (self-declared, not written to):** ${dormant.join(', ')}` : '',
    outOfScope.length ? `**Out of scope:**\n${outOfScope.map((o) => `- ${o}`).join('\n')}` : '',
    unknown.length ? `**UNKNOWN (read or write failed — fix the token/scope):** ${unknown.join('; ')}` : '',
  ].filter(Boolean).join('\n');

  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);

  if (unknown.length) {
    throw new Error(`${unknown.length} repo(s) could not be read or written — this run fails so the cause is escalated `
      + 'rather than leaving a member quietly undeclared');
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error(`fleet-pack-seeds sweep failed: ${e.message}`); process.exit(1); });
}
