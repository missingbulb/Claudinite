// An invocation endpoint's routine URL moves out of `.claudinite-settings.json` into
// a repository variable named for the endpoint (`CCR_ROUTINE_URL` for `default`),
// set by the owner in each repo's Actions settings. This record drops the `url`
// key the settings file no longer means anything by.
//
// appliesTo reads the member's mount for both halves that stop needing the key: the
// pack's invoker that reads the variable, and the engine validator that stops
// requiring `url`. The two arrive on separate cycles, and dropping the key ahead of
// either leaves the member unable to invoke, or with a settings error. An unreadable
// mount reads as not capable.
//
// THE VERSION IS PAST THE LANDING DAY on purpose: the pack-version-bump task cuts the
// version after the change lands, so the record cannot know it, and a value past the
// landing day keeps it in range for the first converge after the pack update reaches a
// member.
const SETTINGS = '.claudinite-settings.json';
const probe = async (read, path, marker) => {
  const text = (await read(`.claudinite/shared/${path}`)) ?? (await read(path));
  return Boolean(text) && text.includes(marker);
};
const mountReadsTheVariable = async (read) =>
  (await probe(read, 'packs/claudinite-tasks/src/world/sessions.mjs', 'routineUrlVariable'))
  && probe(read, 'engine/checks/helpers/repo-context.mjs', '→ { tokenSecret }');

const URL_VALUE = '"url"\\s*:\\s*"(?:[^"\\\\]|\\\\.)*"';

export default {
  id: 'routine-url-variable',
  landed: '2026-09-27',
  version: '61004.1',
  summary: 'an invocation endpoint\'s routine URL is read from the CCR_ROUTINE_URL repository variable (CCR_<NAME>_ROUTINE_URL for a named endpoint), and its `url` key leaves .claudinite-settings.json',
  appliesTo: mountReadsTheVariable,
  rewrite: [{
    file: SETTINGS,
    replace: [
      // The url followed by another key: drop its whole line.
      { pattern: new RegExp(`^[ \\t]*${URL_VALUE}[ \\t]*,[ \\t]*\\r?\\n`, 'gm'), to: '' },
      // The url as the object's last key: drop it with the comma before it.
      { pattern: new RegExp(`,[ \\t]*\\r?\\n[ \\t]*${URL_VALUE}(?=\\s*\\})`, 'g'), to: '' },
    ],
  }],
  legacyPresent: async (exists) => exists(SETTINGS),
};
