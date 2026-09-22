#!/usr/bin/env node
// Work-scope conformance runner (see DESIGN.md): the rules that judge the
// current change — the branch's diff against the merge-base, and (at Stop) the
// session transcript — each declaring `scope: 'work'` and receiving the fluent
// work view (helpers/work.mjs). Repo-state rules and settings diagnostics run in
// check_the_world.mjs, which this file shares no code with (only the scope-blind
// mechanism helpers). The Stop hook runs this; CI runs the world runner.
//   --transcript PATH   the session transcript — conversation rules self-skip without it
//   --changed / --base REF / --root DIR   as in check_the_world.mjs
import { buildContext } from './helpers/repo-context.mjs';
import { discoverPacks } from '../pack_loader/pack-registry.mjs';
import { runActivePackRules } from './run-active-pack-rules.mjs';
import { READS_THE_SESSION } from './helpers/work.mjs';
import { reportFindings } from './report-findings.mjs';
import { ruleFailed } from './helpers/findings.mjs';
import { renderTiming } from './check-timing.mjs';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);
const root = value('--root') || process.cwd();

const { packs } = await discoverPacks({ localRoot: root });
const ctx = buildContext({
  root,
  mode: has('--changed') ? 'changed' : 'all',
  baseOverride: value('--base'),
  transcriptPath: value('--transcript'),
});

const timings = [];
const started = performance.now();
// A rule that throws is that rule's own finding and costs nothing else: the Stop
// hook reads this sweep to decide whether the session may end, so one rule tripping
// over a half-written file in the working tree must not blank the other eighty.
const failures = [];
const findings = [
  ...runActivePackRules(ctx, packs, {
    includeRule: (rule) => READS_THE_SESSION.has(rule.scope),
    onRuleError: (pack, rule, e) => failures.push(ruleFailed({ pack, rule, error: e, root: ctx.root })),
    timings,
  }),
  ...failures,
];
const sweepMs = performance.now() - started;
const blocking = reportFindings(findings, ctx.config, { scopeLabel: 'work', mode: ctx.mode, baseRef: ctx.baseRef });
// The timing record last, on its own line: the Stop hook lifts it off stdout and
// relays it through the hook log, so it must not be inside the findings block it
// hashes to decide whether a session is converging.
console.log(renderTiming('work', sweepMs, timings));
// An exit CODE, never process.exit(): a findings report can run to hundreds of
// lines, stdout is a pipe whenever a caller captures it, and a pipe write is
// asynchronous — process.exit() drops whatever is still queued, which loses the
// tail of the report while still reporting the right status. The world runner
// carries the full story.
process.exitCode = blocking ? 1 : 0;
