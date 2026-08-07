#!/usr/bin/env node
// The sheepdog pack's fleet-PREFERENCES sweep — the enforcer telling every member
// where this fleet's users keep their personal preferences. Run by this pack's
// `fleet-preferences` scheduled task (tasks/fleet-preferences/), whose worker calls
// `main()` below as the task's `prework`, Action-side inside the enforcer
// repo's scheduler workflow where FLEET_GITHUB_TOKEN is reachable. Still runnable by
// hand (`node check-fleet-preferences.mjs`) via the CLI guard at the foot.
//
// WHY IT EXISTS. Personal preferences — how a person wants to be worked with — belong
// to a FLEET's users, not to any one project and not to the canon: the canon is shared
// by every fleet that mounts it, so it is both the wrong host for one owner's
// preferences and the wrong authority on where they live. What each project needs is
// therefore a POINTER, and it carries one in its own settings:
//
//   "preferences": { "repo": "<the fleet's preferences home>" }
//
// read by the session-start step (engine/hooks/steps/inject-preferences.mjs). Nothing
// in the CANON can populate that pointer — a bootstrap run from canon does not know
// which fleet it is bootstrapping into, and hardcoding one fleet's repo there is the
// coupling this whole shape exists to remove. The enforcer, though, knows exactly:
// it IS the fleet. So the pointer is written from here, once per member, by the repo
// whose whole job is being that fleet's own.
//
// IT WRITES — the one sweep in this pack that does. The others report a condition and
// converge an issue for a human to fix; this one converges a single additive settings
// key that no human decision is involved in (the fleet's preferences home is a fact
// about the fleet, and this repo holds it), so an issue asking someone to copy it into
// every member would be ceremony around a mechanical edit. The write is one PUT to the
// member's default branch, guarded by the blob sha the read returned. It is not a
// content migration and does not use the maintenance-branch lane
// (migrations/fleet-apply.mjs): there is no code in it, nothing to review, and it is
// idempotent — a member already pointing at the right repo is read and left alone.
// It does REFORMAT the declaration it edits to canonical 2-space JSON (the shape
// `--init` writes), because it round-trips the file through JSON rather than
// text-editing settings.
//
// THE ENGINE GATE, and why the rollout needs one. A top-level settings key the
// engine does not know is a BLOCKING `config` error (an unknown setting is as much an
// error as invalid JSON — engine/checks/helpers/repo-context.mjs). A member runs the
// engine version its vendored mount carries, so writing the pointer into a member
// whose mount predates the `preferences` key would break that repo's checks until its
// next baselining. The sweep therefore reads the member's OWN vendored engine and
// writes only when it accepts the key — `engine-behind` is a wait, not a finding. It
// needs no cutoff date, no ref arithmetic and no coordination: members re-vendor
// nightly, and each one is written the first run after its mount learned the key.
//
// A DORMANT member is skipped, like everywhere else in this pack: it declared itself
// out of the recurring work, and a commit landed in it from outside is exactly the
// upkeep it opted out of. Its mount is frozen too, so it would sit at `engine-behind`
// indefinitely anyway. Its sessions fall back to default interaction behavior (the
// step is fail-soft) until the repo wakes up, re-vendors, and is written then.
//
// A member pointing at a DIFFERENT repo is reported, never overwritten. The fleet is
// the authority on which repo hosts its preferences, but a pointer someone set
// deliberately is a decision, and silently replacing it would be the sweep deciding
// something it cannot know.
//
// Dependency-free (global fetch, Node 20+). Reads every member; writes one settings
// key to the members that need it, and nothing else anywhere.
//
// It lives IN its task's folder (tasks/fleet-preferences/) because nothing else uses
// it — only this task's worker.mjs imports it. What IS shared with the other sweeps
// sits at the pack root: the cross-repo REST primitives (fleet-api.mjs) and the
// config reader (fleet-config.mjs).

import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import {
  makeGh, paged, readFile, readDeclaration, putFile, isDormant, preferencesLocation, DECLARATION,
} from '../../fleet-api.mjs';
import { parseSheepdogConfig } from '../../fleet-config.mjs';

// Where a member's engine lives: the vendored mount first, then the repo root — which
// is how the canon repo itself (it runs its own live tree, mounting nothing) is swept
// by the same code path as every other member instead of being special-cased out.
const ENGINE_PATHS = [
  '.claudinite/shared/engine/checks/helpers/repo-context.mjs',
  'engine/checks/helpers/repo-context.mjs',
];

// --- the engine gate (pure) ---------------------------------------------------

// Does this engine source accept the `preferences` setting? Read off the closed
// vocabulary itself (`CONFIG_KEYS`) rather than a version or a date, because that
// list IS what will reject the key: whatever else changed in that member's mount, if
// its own CONFIG_KEYS names the setting then writing it cannot produce a config error.
const CONFIG_KEYS_RE = /CONFIG_KEYS\s*=\s*\[([^\]]*)\]/;
export function engineKnowsPreferences(source) {
  const m = CONFIG_KEYS_RE.exec(source ?? '');
  return m ? /['"]preferences['"]/.test(m[1]) : false;
}

// --- classification (pure) ----------------------------------------------------

export const SET = 'set';

// `config` is the member's parsed declaration, `wanted` the fleet's preferences repo,
// `engineKnows` what the gate above said about that member's own engine. Kept free of
// I/O so every branch is testable directly.
export function classifyPreferences({ config, wanted, engineKnows }) {
  const current = preferencesLocation(config);
  if (current) {
    if (current.repo.toLowerCase() === wanted.toLowerCase()) {
      return { state: SET, detail: `already points at ${current.repo}` };
    }
    return {
      state: 'elsewhere',
      detail: `points at ${current.repo}, not the fleet's ${wanted} — left alone, because a pointer someone set deliberately is a decision`,
    };
  }
  const malformed = config?.preferences !== undefined;
  if (!engineKnows) {
    return {
      state: 'engine-behind',
      detail: `its vendored engine does not accept the "preferences" setting yet — waiting for its next baselining rather than writing a key that would be a blocking config error there`,
    };
  }
  return {
    state: 'writable',
    detail: malformed
      ? `carries a "preferences" setting that does not resolve (${JSON.stringify(config.preferences)}) — replacing it with ${wanted}`
      : `declares no preferences home — pointing it at ${wanted}`,
    malformed,
  };
}

// --- the write ----------------------------------------------------------------

// The member's declaration with the pointer set, as text. Round-trips through JSON so
// the result is canonical settings (2-space, trailing newline — what `--init` writes)
// rather than the product of editing JSON as text. An existing key is replaced in
// place; a new one lands at the end.
export function withPreferences(text, wanted) {
  const config = JSON.parse(text);
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    throw new Error('the declaration is not a JSON object');
  }
  return `${JSON.stringify({ ...config, preferences: { repo: wanted } }, null, 2)}\n`;
}

const commitMessage = (wanted) => [
  `Declare the fleet's preferences home (${wanted})`,
  '',
  'Personal interaction preferences belong to this fleet\'s users, so each project',
  'points at the repo that holds them rather than carrying (or hardcoding) them:',
  'the session-start preferences step reads this pointer to find <email>.md.',
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
      + 'this sweep writes one settings key into each member, so Contents read alone is not enough.');
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
    if (r.archived || r.fork || exclude.has(fullName)) { outOfScope.push(fullName); continue; }
    try {
      // The declaration is read WITH its bytes and sha: the write below hands that sha
      // back as its precondition, so the file this sweep decided about is the file it
      // writes — one read, no window.
      const read = await readDeclaration(gh, r.full_name, DECLARATION, { withFile: true });
      if (read === null) { outOfScope.push(fullName); continue; }  // uncovered — the census owns it
      if (isDormant(read.config)) { dormant.push(fullName); continue; }

      let engineKnows = false;
      for (const path of ENGINE_PATHS) {
        const engine = await readFile(gh, r.full_name, path);
        if (engine === null) continue;
        engineKnows = engineKnowsPreferences(engine.text);
        break;
      }

      const verdict = classifyPreferences({ config: read.config, wanted: preferencesRepo, engineKnows });
      if (verdict.state === SET) { already.push(fullName); continue; }
      if (verdict.state === 'elsewhere') { elsewhere.push(`${fullName} — ${verdict.detail}`); continue; }
      if (verdict.state === 'engine-behind') { waiting.push(fullName); continue; }

      const next = withPreferences(read.text, preferencesRepo);
      await putFile(gh, r.full_name, {
        path: DECLARATION, text: next, sha: read.sha, message: commitMessage(preferencesRepo),
      });
      written.push(`${fullName} — ${verdict.detail}`);
    } catch (e) {
      unknown.push(`${r.full_name} — ${e.message}`);
    }
  }

  const summary = [
    `# Fleet preferences sweep — ${owner} (home: ${preferencesRepo})`,
    '',
    '| already set | written | waiting on engine | pointing elsewhere | dormant | out of scope | unknown |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    `| ${already.length} | ${written.length} | ${waiting.length} | ${elsewhere.length} | ${dormant.length} | ${outOfScope.length} | ${unknown.length} |`,
    '',
    written.length ? `**Written:**\n${written.map((w) => `- ${w}`).join('\n')}` : '**Written:** none (every member the sweep can write already points home 🎉)',
    waiting.length ? `**Waiting on their next baselining (engine predates the setting):** ${waiting.join(', ')}` : '',
    elsewhere.length ? `**Pointing elsewhere (left alone):**\n${elsewhere.map((e) => `- ${e}`).join('\n')}` : '',
    dormant.length ? `**Dormant (self-declared, not written to):** ${dormant.join(', ')}` : '',
    unknown.length ? `**UNKNOWN (read or write failed — fix the token/scope):** ${unknown.join('; ')}` : '',
  ].filter(Boolean).join('\n');

  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);

  if (unknown.length) {
    throw new Error(`${unknown.length} repo(s) could not be read or written — this run fails so the cause is escalated `
      + 'rather than leaving a member quietly without its preferences pointer');
  }
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  main().catch((e) => { console.error(`fleet-preferences sweep failed: ${e.message}`); process.exit(1); });
}
