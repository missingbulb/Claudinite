import { finding } from '../../checks/lib/findings.mjs';
import { classifiedTurns } from '../../checks/lib/transcript.mjs';

const SPEC = 'dev/requirements/requirements.md';

// A file whose change is product work rather than specification: anything that
// is neither markdown nor part of the requirements tree. Goldens and harness
// code under dev/requirements/ count as the spec's own machinery, not "code
// before the spec".
const isCode = (f) => !f.endsWith('.md') && !f.startsWith('dev/requirements/');

// Conversation-surface rule enforcing the feature run's doc-first ordering on
// the branch: after the owner's latest feature-classified comment, an
// independent commit updating the spec (no code alongside) must precede the
// first code commit. Scoped by the comment's timestamp so earlier work already
// on the branch — a previous task, a previous run — is never re-litigated.
const rule = {
  id: 'feature-requirements-first',
  severity: 'blocking',
  description: 'A feature run must land an independent requirements-doc commit before its first code commit',
  doc: 'packs/executable-requirements/RULES.md',
  why: 'the feature run is doc-first: the spec change is the requirement\'s durable home and must precede the code that satisfies it',

  run(ctx) {
    const entries = ctx.conversation();
    if (!entries) return [];
    const featureTurns = classifiedTurns(entries).filter((t) => t.classes.has('feature'));
    if (!featureTurns.length) return [];
    const since = Date.parse(featureTurns[featureTurns.length - 1].timestamp ?? '') || 0;

    let specSeen = false;
    for (const commit of ctx.commitsWithFiles()) {
      if ((Date.parse(commit.date) || 0) < since) continue;
      const codeFiles = commit.files.filter(isCode);
      if (!codeFiles.length) {
        if (commit.files.includes(SPEC)) specSeen = true;
        continue;
      }
      if (specSeen) return [];
      return [finding(rule, {
        file: '(branch)',
        what: `commit ${commit.sha.slice(0, 7)} ("${commit.subject}") changes code (${codeFiles[0]}) before any independent commit updating ${SPEC}`,
        fix: `record the requirement first: land a commit updating ${SPEC} with no code alongside, then the tests and implementation — rebase to reorder if the code is already committed`,
      })];
    }
    return [];
  },
};

export default rule;
