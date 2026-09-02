# claude-code-web-users-support — working from Claude Code on the web

- **Adding or changing someone's personal interaction preference** — edit that person's
  `<email>.md` in the store repo this pack's entry config names, never in this repo and never in
  the canon, one distilled preference per bullet and in the imperative. A preference that is a
  project convention in disguise belongs in the pack that owns its subject; where one triggers a
  defined command, it owns the trigger phrase alone and the mechanics stay in their own doc.

- **Adding a file to a preferences store this repo holds** — name it for that person's exact
  identity plus `.md`, directly under the store path, case included: the reader builds
  `<path>/<email>.md` and opens nothing else, so a nickname, a subdirectory or any stray doc that
  is not the store's own `README.md` sits in the tree looking fine and is never read by anyone.

- **A web session halt-gated on a missing toolchain requirement** — re-paste
  [`environment-setup-command.sh`](environment-setup-command.sh) whole and unedited into the web
  environment's Setup script field, then rebuild. Never hand-edit a project-specific step into it;
  that step belongs in its owning pack's `env` declaration, which the generic body already
  installs.
