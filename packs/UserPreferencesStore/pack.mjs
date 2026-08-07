// UserPreferencesStore — the pack that gives a project's people their own voice in
// its sessions.
//
// WHAT IT IS. Personal interaction preferences — how a person wants to be worked
// with: tone, summary style, end-of-turn conventions, the phrases they use to
// trigger a command. Not project conventions (those are the other packs' business),
// and not the canon's content: the canon is mounted by every fleet that adopts
// Claudinite, so it is both the wrong host for one group's preferences and the wrong
// authority on where they live.
//
// SO THE PACK CARRIES AN ADDRESS, NOT CONTENT. Its entry config names the STORE — a
// repository, and a path inside it holding one `<email>.md` per person:
//
//   { "id": "UserPreferencesStore", "config": { "repo": "owner/name" } }
//
// and `session-start.mjs` reads that person's file into the session, fail-soft, every
// session. The engine runs it because the file is there (the pack session-start
// runner's structural discovery) and learns nothing about what it does — which is
// what lets this whole mechanism be a pack at all, rather than a special case wired
// into the session-start machinery of every repo that mounts the corpus.
//
// SEEDED BY DEFAULT. Every project's people can want this, so `--init` declares it;
// the adoption question below is what turns the declaration into a working store,
// and a project with none answers "n/a" and carries an inert pack that says so.
import storeConfigured from './store-configured.mjs';

export default {
  id: 'UserPreferencesStore',
  ruleRoutingGuidance: {
    belongs: 'where a project\'s people keep personal interaction preferences, and reading the current user\'s into the session',
    excludes: 'project conventions and process — those are the packs that own each subject',
  },
  badge: 'badge.svg',
  detect: null,
  marker: null,
  seededByDefault: true,
  prose: 'RULES.md',
  questions: [
    {
      id: 'store',
      prompt: 'Where do this project\'s people keep their personal interaction preferences — the repository holding one `<email>.md` per person? Give an `owner/name` (a fleet usually has one repo for this), or say "n/a — none" if this project has no such store.',
      distill: 'the answer\'s `owner/name` becomes this entry\'s `config.repo` (add `config.path` only when the files do not sit in `preferences/`); "n/a" leaves the entry without a config and the pack inert',
    },
  ],
  worldRules: [storeConfigured],
};
