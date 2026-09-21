## 2026-09-21 · born · nothing said a person could carry more than prose (#2188)
- **Reason:** the pack shape makes a skill, a check and an `env` declaration available to a person
  for the first time, and a capability nobody knows about is one nobody uses. It also carries the
  one constraint that comes with it: what is poured travels into every project the person opens, so
  a project's own convention does not belong there.
- **Actor:** @missingbulb (owner).
- **Mechanism:** prose in the pack's RULES.md, triggered by wanting more than rules. No check:
  whether a person's pack holds a project convention is a judgment about content in another
  repository, which nothing here can read.
- **Landed:** #2188

## 2026-09-21 · weakened · it no longer promises an `env` declaration will be installed (#2189)
- **Reason:** a pack's `env` is installed when the container is built, from the repository's own
  declared packs. A pack that arrives at session start has missed that, so the rule was offering
  something the mechanism cannot do.
- **Actor:** @missingbulb (owner).
- **Landed:** #2189
