#!/usr/bin/env node
// Work-scope conformance runner (see DESIGN.md): the rules that judge the
// current change — the branch's diff against the merge-base, and (at Stop) the
// session transcript — each declaring `scope: 'work'` and receiving the fluent
// work view (helpers/work.mjs). Repo-state rules run in check_the_world.mjs;
// the Stop hook (engine/hooks/stop-command.mjs) and CI run both.
//   --transcript PATH   the session transcript — conversation rules self-skip without it
//   --changed / --base REF / --root DIR   as in check_the_world.mjs
import { runSweep } from './sweep.mjs';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const value = (flag) => (args.includes(flag) ? args[args.indexOf(flag) + 1] : null);

const blocking = await runSweep({
  scope: 'work',
  root: value('--root') || process.cwd(),
  mode: has('--changed') ? 'changed' : 'all',
  baseOverride: value('--base'),
  transcriptPath: value('--transcript'),
});
process.exit(blocking ? 1 : 0);
