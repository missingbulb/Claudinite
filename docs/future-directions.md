# Future directions

Things the corpus **would** do but deliberately does not yet — each with the blocker that
stops it, so the next reader does not re-derive the idea and then re-discover the wall.

This file is **documentation, never prose**. Nothing here is injected into a session: a pack's
`prose: 'RULES.md'` is what loads at session start, and a deferred idea has no business
spending that budget. Entries move out of here when they are built (into the code and its
own docs) or when they are ruled out for good (deleted, with the reason in the commit).

Not a backlog — GitHub issues are the backlog, and every entry below names its issue. This is
the *reasoning*, kept where it survives the issue being closed, reopened, or renumbered.

---

## Fleet-wide repo settings the sheepdog sweeps cannot align

**Issue:** #590 · **Blocker:** credential scope

Two repository settings decide whether a member's baselining can deliver at all:

| setting | without it |
|---|---|
| *Allow GitHub Actions to create and approve pull requests* | the maintenance PR is never created (#585) |
| *Allow auto-merge* | an `auto-merge` member's PR opens and never lands |

Both are plain REST — `PUT /repos/{o}/{r}/actions/permissions/workflow` and
`PATCH /repos/{o}/{r}` — so converging them alongside the `fleet-freshness` sweep would be the
natural home: a sweep keeps them true, where adoption only sets them once and cannot notice a
later flip.

It is not done because **`FLEET_GITHUB_TOKEN` is not an admin token**. Both endpoints require
admin on the member, and this pack's PAT deliberately carries only Metadata + Contents read and
Issues read/write — widening it to admin-on-every-repo to fix a two-field settings drift is a
poor trade.

So the settings stay an owner action, and the sweeps report the *symptom* — a member stuck
`behind` — never the cause. Revisit if a narrower administration scope appears, or if the fleet
grows past the point where setting them by hand at adoption is reliable.
