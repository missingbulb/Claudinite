import { finding } from '../../checks/lib/findings.mjs';

// The effect check behind the squash-only platform setting: the setting is never
// trusted — a merge commit in main's first-parent history proves it was off or
// bypassed. One finding per merge commit, keyed by sha, so a legacy merge can be
// accepted individually while a new one still fires.
const rule = {
  id: 'squash-merge-history',
  severity: 'blocking',
  description: "The default branch's first-parent history must be squash-only (no merge commits)",
  doc: 'always/merge-to-main.md',
  why: 'the squash-only repo setting can be off or bypassed; the history is the effect that proves it held',

  run(ctx) {
    if (!ctx.baseRef) return [];
    const refShort = ctx.baseRef.replace(/^origin\//, '');
    return ctx.mergeCommitsOn(ctx.baseRef).map(({ sha, subject }) =>
      finding(rule, {
        file: `${refShort}@${sha}`,
        what: `merge commit on ${refShort}: ${subject}`,
        fix: 'enable squash-only merges in the repo settings (allow squash; disallow merge commits and rebase merges); accept this sha with a reason if it is a known legacy merge, or turn the rule off if the project deliberately runs a non-squash policy named in its CLAUDE.md',
      })
    );
  },
};

export default rule;
