## 2026-07-19 · born · google-identity: prose to skill-owned checks (#350)
- **Source:** missingbulb/TLDR, whose extension requests the ID token for the client id and whose
  API Gateway authorizer expects that same value as the audience.
- **Reason:** one value in two roles, edited in two places, drifts - and a drifted pair rejects
  every well-formed token with an opaque 401.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** an advisory check of the skill, scoped to the work and gated on the client-id
  literal itself; advisory rather than blocking because separate deploy units legitimately hold a
  copy each, so the duplicate is a smell to judge and not a fault, and work-scoped so a repo
  converges without acceptances for legacy copies the change never touched.
- **Landed:** #350 (Refs #303) · pack version 1.

## 2026-09-04 · reworded · the doc: pointer names the path the tree carries (#1676)
- **Reason:** it still named the pre-#385 `skills/<name>/` layout, one of seven such pointers the
  new `doc-pointers-resolve` check found.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Landed:** #1676 (Closes #1675) · pack version 60904.1.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
