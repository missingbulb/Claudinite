# Worked example — `packs/chrome-extension` as the design renders it

`chrome-extension/` beside this file is the pack as it reads once [the design](../DESIGN.md) is
applied to it — every carrier the transformation touches, the README as the backfill run leaves
it, and the provenance folder in full — placed here because nothing under `packs/` may hold a
`provenance/` folder until the vendor set excludes it. Once the mechanism lands, `provenance/`,
`RULES.md`, `README.md` and the two skills move whole onto `packs/chrome-extension/`, and this
file goes with the rest of `docs/provenance/`.

| Rendered here | What the transformation did to it |
|---|---|
| `RULES.md` | every one of its 22 rules ends with a marker naming its provenance file; nothing else changes (one link is repointed at the real skill and rewrapped so it resolves from this folder; in the pack it stays relative) |
| `README.md` | trimmed to how the pack is used: the paragraph on the release pack's split and collapse, the sentence on the kept `cer/` ids, the drift-guard note with its issue number, the reason the stubs vendor, and the cron the task absorbed all leave — each onto the entry it was evidence for (`pack.md`, `store-release.md`, `cer-version-bumped.md`); what stays is when the pack applies, what each check demands, when a skill is reached for and what the task does (two stub links are repointed so they resolve from here) |
| `skills/chrome-store-releases/SKILL.md`, `skills/extension-host-permissions/SKILL.md` | unchanged: a skill is named by its directory, so its file, its description and its `force-load-on-file-edits-paths` gain nothing — their history, the load triggers' above all, is on the skill's provenance file (the release skill's relative links are repointed here for the same reason as the rules file's) |
| the four coded checks, seven declared checks, the task and the manifest | unchanged and not copied: each is named by the id it already carries |
| `provenance/` | 36 element files and `declined.md`, for 37 carriers: 22 rules, 2 skills, 4 coded checks, 7 declared checks, 1 task, the manifest. `content-script-module-syntax.md` covers two — the classic-content-script rule and the check converted from it — so the file takes the check's name and the rule's marker cites it |

Every file was created by the marking pass (a dry run of `mark` over the real pack, which proposes
a slug per rule; the slugs here are the refined ones a maintainer would land). Fifteen were then
filled by hand from the pack's git history, its pull requests and the two issues behind the skill
triggers, following the backfill method the design states — each entry derived from the adding
commit, its pull request and the `VERSIONS.md` row **before** re-reading the rule, and a field
left out wherever the history is silent — and the README trimmed in the same pass, its history
sentences landing on the entries they evidence. The other 21 files are empty, which is exactly the
state the backfill task consumes. A dry run of `check` over the folder, the rendered `RULES.md` and
the real pack resolves every marker and id to a live file, finds every file named, and finds a
`Mechanism` on every entry whose kind carries one.

| Filled | What it shows |
|---|---|
| `pack.md` | pack-level mechanism decisions: the manifest fingerprint, the split into an opt-in release pack and why it collapsed back into a structural gate, the kept `cer/` ids, why the release set vendors as stubs — the README's history, now where a reader who asks "why" looks |
| `extension-host-permissions.md` | a rule that became a path-forced skill: why `**/manifest.json` and not a source glob, why the description names two moments, the description-only alternative the owner rejected and where that call is recorded |
| `chrome-store-releases.md` | a skill's life — standard, opt-in pack, vendoring, skill, path trigger — with the trigger entry saying which files are forced, which are deliberately not, and what the guard and its backstop do |
| `declined.md` | the three extractions the audit proposed for this pack and the owner declined, each with the reason a later pass can re-derive against |
| `content-script-module-syntax.md` | one element covering a rule **and** the check converted from it: parsed-not-grepped, why coded rather than declared, the deletion-test verdict (prose kept, and why), a later split |
| `declarative-content-set-icon.md` | a check whose prose was deleted on conversion; the README-drift correction; the retire test |
| `cer-permission-added-store-issue.md`, `cer-privacy-permission-alignment.md` | two declared checks born of one decision, one advisory and one blocking, with the severity reasoned from where the fix lives |
| `cer-version-bumped.md` | why a work-scope check and not a world-scope one, with the prior state as the rejected alternative |
| `cer-release-workflows.md` | a legacy tolerance keyed on a migration record's recency, then an advisory and a convergence-window retirement |
| `store-release.md` | a task: why agentless and why it absorbed the workflow's own cron, three policy changes, the `disabledTasks` decision |
| `url-filter-host-operators.md`, `id-token-for-jwt-backends.md`, `silent-refresh-prompt-none.md` | rules born by promotion, then reworded by corpus-wide passes; one line each |
| `tokens-in-session-storage.md`, `token-across-restarts.md` | a split, recorded on both sides |

`Actor` names the person by handle with their role, or the run that decided and who merged it.
`Model` is written where a landing commit's trailer names one and left out where it does not.
`Landed` is the pull request or commit and the pack version that shipped the decision — a locator
from the decision to its diff and to the members that received it, not a proof.
