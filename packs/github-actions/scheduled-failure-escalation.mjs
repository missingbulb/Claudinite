import { finding } from '../../checks/lib/findings.mjs';
import { workflowFiles } from '../../checks/lib/workflows.mjs';

const rule = {
  id: 'gha/scheduled-failure-escalation',
  severity: 'advisory',
  description: 'A scheduled workflow must escalate its own failure to a human-visible state',
  doc: 'skills/git-github-advanced/SKILL.md',
  why: 'nobody watches a scheduled run — a red run in the Actions list reaches no one',

  run(ctx) {
    const out = [];
    for (const wf of workflowFiles(ctx)) {
      const text = ctx.read(wf);
      if (text === null) continue;
      if (!/^\s*schedule:/m.test(text)) continue;
      if (/failure\(\)/.test(text) || /report-failure/.test(text)) continue;
      out.push(finding(rule, {
        file: wf,
        what: 'runs on a schedule but has no visible failure escalation (no failure() job, no report-failure call)',
        fix: 'add a job that runs on failure() and opens/appends to a standing per-workflow tracking issue (or call a shared report-failure workflow)',
      }));
    }
    return out;
  },
};

export default rule;
