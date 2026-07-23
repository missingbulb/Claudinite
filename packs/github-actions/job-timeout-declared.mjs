import { finding } from '../../engine/checks/helpers/findings.mjs';
import { workflowFiles } from '../../engine/checks/helpers/github-workflows.mjs';

// Walk the top-level `jobs:` map and, for each job, decide whether it declares a
// job-level `timeout-minutes`. A job whose body is a reusable-workflow call (a
// job-level `uses:`) is skipped: GitHub rejects `timeout-minutes` on those, and
// the bound lives inside the called workflow's own jobs. Comment lines are
// ignored so an oddly-indented `#` note can't skew the indentation reasoning.
const contentIndent = (line) => (line.trim() && !/^\s*#/.test(line) ? line.search(/\S/) : null);

const rule = {
  id: 'gha/job-timeout-declared',
  severity: 'advisory',
  description: 'Every job that runs steps must declare a job-level timeout-minutes',
  doc: 'skills/git-github-advanced/SKILL.md',
  why: "a job with no timeout-minutes inherits GitHub's 360-minute default, so a hung step burns a runner for six hours before it is killed",

  run(ctx) {
    const out = [];
    for (const wf of workflowFiles(ctx)) {
      const text = ctx.read(wf);
      if (text === null) continue;
      const lines = text.split('\n');

      // Locate the top-level `jobs:` mapping and the line range it spans.
      let jobsLine = -1;
      let jobsIndent = -1;
      for (let i = 0; i < lines.length; i += 1) {
        const m = /^(\s*)jobs:\s*$/.exec(lines[i]);
        if (m) { jobsLine = i; jobsIndent = m[1].length; break; }
      }
      if (jobsLine === -1) continue;
      let jobsEnd = lines.length;
      for (let i = jobsLine + 1; i < lines.length; i += 1) {
        const ind = contentIndent(lines[i]);
        if (ind !== null && ind <= jobsIndent) { jobsEnd = i; break; }
      }

      // Job ids are the shallowest keys inside the jobs block.
      let idIndent = Infinity;
      for (let i = jobsLine + 1; i < jobsEnd; i += 1) {
        const ind = contentIndent(lines[i]);
        if (ind !== null) idIndent = Math.min(idIndent, ind);
      }
      if (!Number.isFinite(idIndent)) continue;

      const headers = [];
      for (let i = jobsLine + 1; i < jobsEnd; i += 1) {
        const m = /^(\s*)([A-Za-z0-9_-]+):\s*(#.*)?$/.exec(lines[i]);
        if (m && m[1].length === idIndent) headers.push({ line: i, id: m[2] });
      }

      for (let h = 0; h < headers.length; h += 1) {
        const start = headers[h].line + 1;
        const end = h + 1 < headers.length ? headers[h + 1].line : jobsEnd;
        // The job's direct-child keys sit at the shallowest indent in its body;
        // a `timeout-minutes` deeper than that is a step's, which does not bound
        // the whole job, so only a key at this indent counts.
        let keyIndent = Infinity;
        for (let i = start; i < end; i += 1) {
          const ind = contentIndent(lines[i]);
          if (ind !== null) keyIndent = Math.min(keyIndent, ind);
        }
        if (!Number.isFinite(keyIndent)) continue;
        let reusable = false;
        let hasTimeout = false;
        for (let i = start; i < end; i += 1) {
          if (contentIndent(lines[i]) !== keyIndent) continue;
          if (/^\s*uses:\s*\S/.test(lines[i])) reusable = true;
          if (/^\s*timeout-minutes:\s*\S/.test(lines[i])) hasTimeout = true;
        }
        if (reusable || hasTimeout) continue;
        out.push(finding(rule, {
          file: wf,
          line: headers[h].line + 1,
          what: `job "${headers[h].id}" declares no job-level timeout-minutes (it inherits GitHub's 360-minute default)`,
          fix: "add `timeout-minutes: <n>` at the job level, sized a little above the job's real worst-case runtime",
        }));
      }
    }
    return out;
  },
};

export default rule;
