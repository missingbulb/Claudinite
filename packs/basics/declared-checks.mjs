import { patternRule } from '../../engine/checks/helpers/pattern-rules.mjs';

// This pack's declared checks — pattern specs, not code. The spec vocabulary is
// documented in the helper's header; each declaration below reads as its own
// contract (what it scans, what it requires, what the failure says).

export const claudeMdLength = patternRule({
  id: 'claude-md-length',
  severity: 'advisory',
  description: 'A CLAUDE.md over ~200 lines costs context and reduces adherence',
  doc: 'skills/authoring-agent-docs/SKILL.md',
  why: 'everything in CLAUDE.md loads every session; past ~200 lines it crowds out the rules that matter',
  scanFiles: 'CLAUDE.md',
  maxLines: {
    limit: 200,
    what: '{lines} lines (target under {limit})',
    fix: 'move multi-step procedures to skills and part-of-repo rules to path-scoped packs; keep CLAUDE.md to always-true facts',
  },
});

export const generatedMergeDriver = patternRule({
  id: 'generated-merge-driver',
  severity: 'advisory',
  description: 'A GENERATED file needs a .gitattributes merge=ours entry',
  doc: 'skills/engineering-practices/SKILL.md',
  why: 'without merge=ours a conflicting merge on a generated file gets hand-resolved and desyncs from its source',
  coveredByGlobLine: [{
    eachPathMatching: /(?<base>[^/]*GENERATED[^/]*)$/,
    includeVendored: true,
    globFile: '.gitattributes',
    globLineMatching: /\bmerge=ours\b/,
    what: 'a GENERATED file with no merge=ours .gitattributes entry',
    fix: 'add `{base} merge=ours` to .gitattributes (plus a one-time `git config merge.ours.driver true`) so a conflicting merge auto-resolves',
  }],
});

export const catalogCompleteness = patternRule({
  id: 'catalog-completeness',
  severity: 'blocking',
  description: 'packs/README.md lists every packs/<name>/',
  doc: 'packs/README.md',
  why: 'a hand-maintained catalog that omits a real pack misroutes readers and hides capability; the check keeps the index honest against the tree',
  relevantWhen: { trackedFileMatches: /^engine\/pack_loader\/pack-registry\.mjs$/ },
  listedInFile: [{
    eachTrackedPathMatching: /^packs\/(?<name>[^/]+)\/pack\.mjs$/,
    listFile: 'packs/README.md',
    asText: '({name}/',
    what: 'the pack "{name}" exists on disk but is not listed in packs/README.md',
    fix: 'add a "{name}" entry to packs/README.md (or delete the pack if it is dead)',
  }],
});

export default [claudeMdLength, generatedMergeDriver, catalogCompleteness];
