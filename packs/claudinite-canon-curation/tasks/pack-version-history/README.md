# pack-version-history

Each pack's `VERSIONS.md` answers "what did version N ship?" — and since a version is cut on the
base branch after its changes land ([pack-version-bump](../pack-version-bump/README.md)), no
pull request can write that row itself. This task derives it: for every version a pack's
manifest ever declared, the first-parent commits between the previous version's bump and this
one's that touched a shipping file of the pack are the pull requests it shipped, and the row
names them by their squash-merge subjects, which carry the pull request numbers.

Only the versions with no row gain one. A row already in the file stands as written, whatever
wrote it, so a hand-written account of a version is never replaced by a list of titles. The
records that changed land on this task's pull request, amended while it is open and auto-merged
under a policy that covers a pack's `VERSIONS.md` and nothing else.

## Why the declaration reads as it does

Weekly, gated on commits under `packs/`: a row exists per version, a version exists per shipping
change, and a week with no shipping change has nothing to record. `amend_existing_or_create_new_pr`,
so a record still under review absorbs the next week's rows rather than standing beside a second
pull request for the same files. The automerge policy is the pack's own `pack-version-history`
diff class (`merge-rules.json` beside `pack.mjs`): a run that touched anything but a version
record parks for a person. Agentless: which pull requests a version carried is a fact of the
history, and the subject of a squash merge is the pull request's title.
