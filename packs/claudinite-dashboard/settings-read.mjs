// READING A MEMBER'S SETTINGS FROM THE PAGE — one helper, because the page reads
// that file from three places (the repo view, the fleet view, the contributions
// panel). A repo that is not a member answers with nothing, which is what the
// caller reports as "does not run Claudinite".
//
// The name comes from the engine's browser-pure half: `settings-file.mjs` itself probes
// the disk, and a `node:` import anywhere in the page's graph blocks its first module
// load in the browser (#1286).
import { SETTINGS_FILE } from '../../engine/settings-file-names.mjs';

export { SETTINGS_FILE };

export async function settingsTextAtSha(gh, repo, sha, token) {
  return (await gh.getTextAtSha(repo, sha, SETTINGS_FILE, token)) || null;
}
