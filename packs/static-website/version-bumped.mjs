import { finding } from '../../engine/checks/helpers/findings.mjs';
import { BumpError, compare, readVersion } from './stubs/actions/bump-site-version/bump.mjs';
import { parseConfig } from './stubs/actions/read-site-config/read-config.mjs';
import { shipsPipeline } from './release-workflows.mjs';
import { CONFIG_PATH } from './site-config.mjs';

// THE VERSION BELONGS TO THE CHANGE. The release flow ships whatever version it
// finds on `main` and writes none of its own, so a change that alters the
// published site without raising the version has nowhere to land: the pipeline
// sees a version it has already released, no-ops, and the edit sits on `main`
// serving nothing. The version is also what a reviewer reads to know what the
// PR in front of them will be released as, which is only true while the two
// arrive together.
//
// The relevance test is the repo's OWN publish set — the same `publish_root` +
// `publish_paths` the artifact is assembled from — so a README, a tooling
// commit or a workflow edit is free, exactly as it is for the release trigger.
// Which means the version file itself only demands a bump when the repo
// publishes it, and a version-only change is trivially satisfied.
//
// WORK SCOPE: the tree always carries a version; only the diff says whether it
// moved with the content beside it. The pack-side twin in Claudinite's own canon
// is `pack-version-bumped`, which holds the identical line for a pack directory.

// Repo-relative prefixes of the publish set. Mirrors the resolution the deploy
// does — publish paths are relative to publish_root, and "." means they already
// are repo-relative.
export function publishPrefixes(values) {
  const root = values.get('publish_root');
  const prefix = !root || root === '.' ? '' : `${root}/`;
  return (values.get('publish_paths') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => (p === '.' ? (prefix || '.') : `${prefix}${p}`));
}

export function touchesPublishSet(changed, prefixes) {
  return (changed ?? []).filter((f) => prefixes.some((p) => (p === '.' ? true : f === p || f.startsWith(`${p}/`))));
}

const rule = {
  id: 'sw/version-bumped',
  severity: 'blocking',
  scope: 'work',
  description: 'A change to the published site raises the site version in the same change',
  doc: 'packs/static-website/skills/static-site-releases/SKILL.md',
  why: 'the release flow releases the version it finds on main and never writes one, so a published change that does not raise the version is never released — the pipeline no-ops on a version it has already shipped',

  run(work) {
    if (!shipsPipeline(work)) return [];
    const configText = work.read(CONFIG_PATH);
    if (configText === null) return [];          // sw/site-config owns a missing or broken config
    const { values } = parseConfig(configText);

    const prefixes = publishPrefixes(values);
    if (!prefixes.length) return [];
    const touched = touchesPublishSet(work.changedFiles, prefixes);
    if (!touched.length) return [];

    const versionFile = (values.get('version_files') ?? '').split(/\s+/).filter(Boolean)[0];
    if (!versionFile) return [];                 // no declared version record — sw/site-config's finding

    const headText = work.read(versionFile);
    const baseText = work.readBase(versionFile);
    if (headText === null || baseText === null) return [];  // the record arrives (or leaves) with this change
    let head;
    let base;
    try {
      head = readVersion(versionFile, headText);
      base = readVersion(versionFile, baseText);
      if (compare(head, base) > 0) return [];
    } catch (err) {
      // An off-scheme version on either side is sw/version-scheme's finding, and
      // it has no place in an ordering — say nothing here rather than twice.
      if (err instanceof BumpError) return [];
      throw err;
    }

    return [finding(rule, {
      file: versionFile,
      what: head === base
        ? `this change edits the published site (${touched[0]}${touched.length > 1 ? `, +${touched.length - 1} more` : ''}) but leaves the version at ${head}`
        : `the site version moves backwards, ${base} → ${head}`,
      fix: head === base
        ? 'raise the version in every version_files record together — `node .github/actions/bump-site-version/bump.mjs $(the repo\'s version_files)` writes them all, or the release flow\'s dispatch does it for a deliberate major'
        : 'site versions only ever increase — the release flow reads them as an ordering, so a lowered number releases nothing and the site stops updating',
    })];
  },
};

export default rule;
