# claude-code-web-users-support — working from Claude Code on the web

- **A person asking to change one of their personal rules** - edit the pack that travels with
  them, `<path>/<email>/` in the store repo this pack names, never here and never in the canon,
  and append the entry on the rule's provenance file inside that pack, the person the actor; a
  project convention in disguise belongs in the pack owning its subject, and a rule triggering a
  command owns only the trigger phrase. (person-asking-change)

- **A person asking to record their personal rules with nothing there yet** - create
  `<path>/<email>/RULES.md` in that store repo, the directory named for their exact identity,
  case included: the reader copies `<path>/<email>/` and nothing else, so any other name is
  silently never copied. (person-asking-record)

- **A person wanting a skill or a check of their own, not just rules** - put it in that same
  directory, which is an ordinary pack: `skills/<name>/SKILL.md`, `worldRules/`,
  `declared-checks.json`, and a `pack.mjs` setting neither `id` nor `version` where one is
  needed at all. It is copied into every session they open on a project declaring this pack, so
  it may hold nothing a project owns. (person-wanting-skill)

- **A web session halt-gated on a missing toolchain requirement** — re-paste
  [`environment-setup-command.sh`](environment-setup-command.sh) whole and unedited into the
  environment's Setup script field, then rebuild; a project-specific step belongs in its own
  pack's `env` declaration, never in that body. (web-session-halt)

- **A scratch clone of a repository outside this session's own GitHub scope is read-only in
  practice** — a `git fetch` against it succeeds while a `git push` `403`s, because the session's
  access is scoped to the repos actually added to it, not organization-wide. Don't re-diagnose the
  `403` as a broader block, don't retry with another remote or a token, and don't route around it
  by editing a vendored or mirrored copy of that repo's content in place — the next sync overwrites
  the edit. Finish and verify the change in the scratch clone, then hand it off as a patch (a diff
  posted on an issue, a comment) for a session whose scope actually reaches that repo to apply.
  (scoped-scratch-clone)
