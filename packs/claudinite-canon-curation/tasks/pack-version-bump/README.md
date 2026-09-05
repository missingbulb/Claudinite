# pack-version-bump

A pack's directory reaches a member only when the canon's `version` exceeds the one the member
has installed, so every shipping change under `packs/<id>/` needs a new number — and a number
two changes both claim strands whichever members took the first one. This task is the one
writer of that number: it reads the base branch, finds each pack's last version bump, and cuts
the next version cut today for every pack with a shipping change since, in one commit pushed
straight onto the base branch. No pull request bumps a version itself, and nothing checks that
one did.

Two triggers run the same worker:

- the canon's `.github/workflows/pack-versions.yml`, on every push to the base branch — so the
  version lands minutes after the merge that needs it;
- this daily task, for the merges the workflow never sees: GitHub turns a push made with the
  Action's own token into no workflow run, and every pull request the queue lands itself is
  such a push.

Both paths are the same idempotent walk over the base branch, so running twice, or both at once,
cuts each version once: a second run finds no shipping change since the bump the first one
pushed, and a push the base branch moved under is replanned from the new tip.

`VERSIONS.md` is not written here. The [pack-version-history](../pack-version-history/README.md)
task retraces from the same history which pull requests each version shipped.

## Why the declaration reads as it does

Daily, gated on commits under `packs/`: the trigger is the merges the workflow cannot observe,
and a day with no shipping change has nothing to cut. A bump commit carries the task trailer,
so the machinery's own output never re-arms it; a run whose changes were all already versioned
says so and costs one fetch.
`no_code_changes`, because the bump is a commit on the base branch and opens no pull request.
Agentless: which packs and which numbers is arithmetic over git, never a judgment.
