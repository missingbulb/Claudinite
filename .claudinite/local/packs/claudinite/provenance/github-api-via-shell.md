## 2026-09-06 · born · converted from references.md (check:github-api-via-shell)
- **Reason:** #880: `Monitor` and shell poll loops reported "still running" until they timed out,
  ~26 minutes lost across two PRs that were already green. The cause is authorization, not egress:
  probed 2026-09-06, `api.github.com` resolves and `/rate_limit` answers 200, while every
  repo-scoped path — this repo's own, and a public one — 403s with "GitHub access is not enabled
  for this session". That asymmetry is why a reachability probe reassures while the real call still
  fails. The guard's other arm holds for a different reason — `gh` is simply absent from `PATH`
  — so the message names both.
- **Mechanism:** a check
- **Retire when:** Retire the rule only if repo-scoped calls start answering from the shell and a
  `gh` CLI is installed.

## 2026-09-06 · severity-changed · Date the three action checks added today so they do not convict the past (#1773)
- **Reason:** an action check is re-judged over the whole session transcript at Stop, so a blocking
  one with no creation date convicts calls made before it existed in the session's tree - and an
  action finding has no clearing move, so it blocks every Stop for the rest of that session. It
  happened within the hour these three landed.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** `since: 2026-09-06`, which `applyGrace` reads as advisory for the grace window.
- **Landed:** #1773 (Closes #1772).

## 2026-09-06 · reworded · Rules to checks with the four-moment mechanisms: 27 bullets retired across basics, the home pack and canon-curation (#1779)
- **Source:** the conversion pass over `docs/declarative-checks/rule-inventory.md`'s A to D rows,
  bounded to the three packs every session in this repo loads; eighteen bullets left this pack's
  prose, 802 rule tokens for 25.
- **Reason:** the guard's other arm gained the `gh ` spelling, since the CLI is absent here for a
  different reason than the API's refusal.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Landed:** #1779 (Closes #1760).

## 2026-09-06 · reworded · Rule revalidation: re-probe five harness claims at their live addresses (#1782)
- **Reason:** the probe says `/rate_limit` answers 200 while every repo-scoped path answers 403
  `GitHub access is not enabled for this session`: not egress, authorization. The advice is
  unchanged and its 26-minute evidence stands; the stated cause was wrong.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Landed:** #1782 (Refs #1767).

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
