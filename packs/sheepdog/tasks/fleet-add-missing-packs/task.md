# Fleet: add the packs a member is missing

Two stages. The first is [`worker.mjs`](worker.mjs), which runs as `prework` before you start; by the time you read this, it has already happened. **You are the second stage**, and your job is the same whichever way the work list was made: turn each open work-list issue into a reviewed PR on that member. The whole of *how* is the [adopt-pack](../../../grow_with_claudinite/skills/adopt-pack/SKILL.md) skill — including what to do about failing checks and unanswered interview questions, which that skill defines for unattended runs like this one. Don't re-derive it here.

## The work list, and the two ways an entry got onto it

The open issues labelled `fleet-add-missing-packs` in **this** (sheepdog) repo. There is no work list anywhere else — no branch, no file, nothing threaded into your dispatch issue. Each names one member, and its title says where it came from:

| title | how it was decided | what you owe it |
|---|---|---|
| `Pack fit: <repo> may want packs it does not declare` | a **fingerprint** suspected it — the weekly scan ([`scan-for-needed-packs.mjs`](scan-for-needed-packs.mjs)) ran every canon pack's `detect` against the member's tree | confirm the suspicion first (§1), then adopt what survives |
| `Add packs: <repo>` | the **owner asked for it by hand** — a forced run ([`force-add-packs.mjs`](force-add-packs.mjs)) carrying the packs, the config and the interview answers | adopt exactly what the issue says, with the entry it renders |

The list is often **empty**, and an empty list is a complete run with an empty outcome — a fleet already declaring what it should. Report it as that.

Take them **oldest first**, and take as many as you can finish properly. One member fully adopted beats four half-adopted: a member you started and abandoned mid-adoption is worse than one you never touched, because its declaration now names packs whose content was never vendored.

## 1. Confirm a *suspicion* before acting on it — and never re-litigate a *request*

A fingerprint **suspects**; it does not prove. This is the same judgment the retired `pack-declaration` check was deleted for making automatically (`engine/checks/README.md`) — so on a `Pack fit:` issue, make it deliberately, per pack:

- Read that pack's `README.md` and its `ruleRoutingGuidance`. Does the member's actual use match what the pack owns, or did the marker merely happen to be present? A `package.json` in a repo that ships no JavaScript is a fixture, not a Node project.
- Where the issue lists packs under **Not decided from outside**, you can settle them exactly — you have the member checked out, which the sweep did not. Use `localFits` from this task's own [`fingerprint-fit.mjs`](fingerprint-fit.mjs) against a context built over that checkout; it decides every fingerprint the REST sweep had to defer.
- A pack you judge **not** wanted is a real answer. Say which and why in a comment on the issue, and don't declare it. If every pack on the issue is declined, close it `not planned` — the scan honours a deliberate `not_planned` close and will not reopen it.

On an `Add packs:` issue the confirming is already done, by a human: they named the pack, the repo and the configuration, and the run refused itself unless every one of that pack's interview questions was answered. Adopt it. Your judgment there is about *how* to land it cleanly, never about whether it was wanted. If you believe it is wrong, say so on the issue and leave it for a human — never quietly adopt something else in its place.

## 2. Adopt, per member

For each member with at least one confirmed or requested pack, run **adopt-pack** against that repo. It owns declaring, the interview, re-vendoring, scaffolding, getting the checks green, and landing one PR.

Three things belong to you rather than the skill:

- **One PR per member**, not one per pack — a member's adoption is one reviewed change.
- **On an `Add packs:` issue, write the rendered entry verbatim.** The issue's JSON block is the declaration entry, `config` and `answers` included; the answers are the owner's, recorded as adopt-pack requires. Merge it into an entry the repo already carries — never replace a config that repo already chose.
- **Link both ways**: the PR body names the work-list issue, and you comment the PR link on that issue. The task closes the issue on its own once the member's declaration carries the packs; your comment is what makes the intervening week legible.

## 3. Report

Comment on your dispatch issue: per member, the packs adopted with a PR link, the packs declined with the reason, and any member left for a human — an adoption blocked on an interview question is exactly that, and naming it is the whole handoff.

## What you must not do

- **Never merge.** This task is ceilinged at `open-pr` and the executor enforces it in code (`verify-outcome.mjs`); merging fails the run.
- **Never declare a pack you did not confirm** (on a `Pack fit:` issue) **or that was not requested** (on an `Add packs:` one), and never guess an interview answer to get past a question — see adopt-pack's rule on that. A declaration nobody chose is the failure mode this whole task exists to avoid recreating from the other direction.
- **Never touch a dormant or uncovered member.** Both halves already excluded them; if one is on an issue, that issue is stale — say so rather than acting on it.
- **Never apply `ready-for-agent` or `ready-for-agent-fleet` to a work-list issue.** Both labels are scheduler triggers ([scheduled-tasks.md](../../../basics/scheduled-tasks.md)); a work list is not a dispatch.
