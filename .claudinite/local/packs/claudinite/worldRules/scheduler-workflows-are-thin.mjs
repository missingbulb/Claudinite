import { finding } from '../../../../../engine/checks/helpers/findings.mjs';

// `.github/workflows/` IS THE ONE VENDORED PATH A CONVERGE CANNOT PUSH INTO. A
// push authored with the default `GITHUB_TOKEN` — which every converge uses —
// may not write a workflow file, so a member's copy of the scheduler and executor
// workflows moves only through a pull request a human merges, in every repo, one
// at a time. Every other engine file converges nightly and unattended.
//
// So a line of LOGIC in these two files costs a fleet-wide human-merged PR to
// change, and a line of PROSE in them costs the same for a wording fix. The rule
// is therefore structural rather than stylistic: these files carry triggers,
// permissions, concurrency and a `run:` naming an engine module — nothing that
// can ever need editing for a reason the engine could have absorbed.
//
// TWO SHAPES ARE BANNED, both of them "a program living in the YAML":
//   - `actions/github-script`, which is JavaScript in a workflow file;
//   - a block `run:` (`run: |`, `run: >`), which is a shell script in one.
// A single-line `run: node <module>` is the sanctioned form, and the module it
// names is where the logic belongs.
//
// BOTH COPIES, always: the stub every member is vendored and the canon's own
// hand-maintained copy beside it, which no converge writes (#1138 — a check that
// watches one of two structurally-identical vendored surfaces is half a check).

// Matched by BASENAME, so the rule holds for the stub tree and `.github/workflows/`
// alike without naming either directory twice.
const WORKFLOW = /(?:^|\/)claudinite-(?:scheduler|executor)\.yml$/;

const GITHUB_SCRIPT = /^\s*-?\s*uses:\s*actions\/github-script@/;
// A block scalar opens a program; `run: node …` on one line does not.
const BLOCK_RUN = /^\s*-?\s*run:\s*[|>][-+0-9]*\s*$/;

const rule = {
  id: 'scheduler-workflows-are-thin',
  severity: 'blocking',
  scope: 'world',
  description: 'The scheduler and executor workflows carry no inline program — every decision lives in an engine module they name',
  doc: 'packs/claudinite-tasks/stubs/claudinite-scheduler.yml',
  why: 'a converge cannot push to .github/workflows/, so logic left in these two files can only be changed by a human-merged PR in every member repo, while the engine module it belongs in converges nightly',

  run(ctx) {
    const files = ctx.tracked.filter((f) => WORKFLOW.test(f)).sort();
    const out = [];
    // A pattern that matches nothing reads as live and catches nothing. These two
    // workflows are core, present in this repo by construction, so an empty scope
    // is the check having gone blind — say so rather than pass silently.
    if (files.length < 4) {
      out.push(finding(rule, {
        file: 'packs/claudinite-tasks/stubs/claudinite-scheduler.yml',
        what: `this rule found ${files.length} scheduler/executor workflow file(s), expected the 4 that exist (2 stubs, 2 canon copies)`,
        fix: 'the workflows moved or were renamed — repoint the rule at their new home, or restore them; a scope this rule cannot see is a rule that enforces nothing',
      }));
      return out;
    }
    for (const file of files) {
      const source = ctx.read(file);
      if (source === null) continue;
      source.split('\n').forEach((text, i) => {
        const line = i + 1;
        if (GITHUB_SCRIPT.test(text)) {
          out.push(finding(rule, {
            file,
            line,
            what: `${file} runs github-script — a program living in a file a converge cannot update`,
            fix: 'move the script into a module under packs/claudinite-tasks/queue/ and call it with a single-line `run: node <module>`; the engine converges nightly, this file needs a human-merged PR per repo',
          }));
        }
        if (BLOCK_RUN.test(text)) {
          out.push(finding(rule, {
            file,
            line,
            what: `${file} carries a block \`run:\` — a shell script living in a file a converge cannot update`,
            fix: 'move the script into a module under packs/claudinite-tasks/queue/ and call it with a single-line `run: node <module>`; the engine converges nightly, this file needs a human-merged PR per repo',
          }));
        }
      });
    }
    return out;
  },
};

export default rule;
