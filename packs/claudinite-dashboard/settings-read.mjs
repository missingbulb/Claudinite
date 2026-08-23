// READING A MEMBER'S SETTINGS FROM THE PAGE — one helper, because the page reads
// that file from three places (the repo view, the fleet view, the contributions
// panel) and the rename (#1252) gave it two names to try instead of one.
//
// The page has no disk to probe, so "which name does this member carry" is a read
// per candidate, in SETTINGS_FILES order: a member that has run the rename record
// answers on the first, one that has not answers on the second, and a repo that is
// not a member answers on neither and gets null — which is what the caller reports
// as "does not run Claudinite".
import { SETTINGS_FILES, SETTINGS_FILE } from '../../engine/settings-file.mjs';

export { SETTINGS_FILE };

export async function settingsTextAtSha(gh, repo, sha, token) {
  for (const name of SETTINGS_FILES) {
    const text = await gh.getTextAtSha(repo, sha, name, token);
    if (text) return text;
  }
  return null;
}
