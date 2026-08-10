# Fleet fit — adopt the packs a member's shape suspects

Two stages. The first is [`worker.mjs`](worker.mjs) → the sweep ([`check-fleet-fit.mjs`](check-fleet-fit.mjs)), which runs as `prework` before you start: it enumerates the fleet, runs every canon pack's fingerprint against every covered member, and converges one `fleet-fit` issue per member in **this** (sheepdog) repo. By the time you read this, that has already happened.

**You are the second stage.** Your job is to turn accepted suspicions into reviewed PRs on the members, and the whole of *how* is the [adopt-pack](../../../grow_with_claudinite/skills/adopt-pack/SKILL.md) skill — including what to do about failing checks and unanswered interview questions, which that skill defines for unattended runs like this one. Don't re-derive it here.

## 1. Read the work list

The open issues labelled `fleet-fit` in this repo. Each names one member and the packs its shape fingerprints but its declaration does not carry. There is no work list anywhere else — no branch, no file, nothing threaded into your dispatch issue.

The list is often **empty**, and an empty list is a complete run with an empty outcome — a fleet already declaring what it should. Report it as that, in the words the sweep used: no member carries an undeclared fit this week.

Take them **oldest first**, and take as many as you can finish properly. One member fully adopted beats four half-adopted: a member you started and abandoned mid-adoption is worse than one you never touched, because its declaration now names packs whose content was never vendored.

## 2. Confirm the suspicion before acting on it

A fingerprint **suspects**; it does not prove. This is the same judgment the retired `pack-declaration` check was deleted for making automatically (`engine/checks/README.md`) — so make it deliberately, per pack:

- Read that pack's `README.md` and its `ruleRoutingGuidance`. Does the member's actual use match what the pack owns, or did the marker merely happen to be present? A `package.json` in a repo that ships no JavaScript is a fixture, not a Node project.
- Where the issue lists packs under **Not decided from outside**, you can settle them exactly — you have the member checked out, which the sweep did not. Use `localFits` from this task's own [`fingerprint-fit.mjs`](fingerprint-fit.mjs) against a context built over that checkout; it decides every fingerprint the REST sweep had to defer.
- A pack you judge **not** wanted is a real answer. Say which and why in a comment on the fit issue, and don't declare it. If every pack on the issue is declined, close it `not planned` — the sweep honours a deliberate `not_planned` close and will not reopen it.

## 3. Adopt, per member

For each member with at least one confirmed pack, run **adopt-pack** against that repo with the confirmed packs. It owns declaring, the interview, re-vendoring, scaffolding, getting the checks green, and landing one PR.

Two things belong to you rather than the skill:

- **One PR per member**, not one per pack — a member's adoption is one reviewed change.
- **Link both ways**: the PR body names the `fleet-fit` issue, and you comment the PR link on that issue. The sweep closes the issue on its own once the member's declaration carries the packs; your comment is what makes the intervening week legible.

## 4. Report

Comment on your dispatch issue: per member, the packs adopted with a PR link, the packs declined with the reason, and any member left for a human — an adoption blocked on an interview question is exactly that, and naming it is the whole handoff.

## What you must not do

- **Never merge.** This task is ceilinged at `open-pr` and the executor enforces it in code (`verify-outcome.mjs`); merging fails the run.
- **Never declare a pack you did not confirm**, and never guess an interview answer to get past it — see adopt-pack's rule on that. A declaration nobody chose is the failure mode this whole sweep exists to avoid recreating from the other direction.
- **Never touch a dormant or uncovered member.** The sweep already excluded them; if one is on an issue, that issue is stale — say so rather than acting on it.
- **Never apply `ready-for-agent` or `ready-for-agent-fleet` to a fit issue.** Both labels are scheduler triggers ([scheduled-tasks.md](../../../basics/scheduled-tasks.md)); a fit issue is a work list, not a dispatch.
