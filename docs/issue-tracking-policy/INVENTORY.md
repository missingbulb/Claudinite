# Issue tracking by repo policy: inventory of what must change

Status: analysis, no code changed. Scope and direction set by the owner on 2026-09-27.

## The direction

- A repo declares an **issue-tracking policy**: GitHub Issues (today's behavior), an in-repo
  backlog file, or an external tracker (Jira, Monday). Every repo must set it explicitly the first
  time, so this needs an adoption question and a one-pass backfill for existing members.
- Anywhere the canon today says "open / reference / close / search an issue", it should say
  **"… per the repo's issue policy"**. The policy supplies:
  - where an item is written;
  - how it is referenced (`#123`, `ABC-123`, `BACKLOG.md#slug`);
  - how it is closed and searched.
- **Scheduled tasks are out of scope.** The task queue stays on GitHub Issues. That covers
  `packs/claudinite-tasks/`, every `packs/*/tasks/**`, the fleet-sheepdog's issue families, and
  the queue's labels, claims and body fields.
- **The user-to-queue bridge degrades.** do-later, verify-in-production, retrospectives and
  migration-plan chains file an issue that the queue later runs. Under a non-GitHub policy they
  record the item in the policy's tracker, without queue fields, and **our tasks do not run
  them**.

## Change kinds

| Kind | Meaning |
|---|---|
| **R** reword | Generic issue wording → "per the repo's issue policy". No behavior change under the GitHub policy. |
| **D** degrade | Bridge to the queue. Keep today's queue form only when the policy is GitHub Issues and `claudinite-tasks` is declared. Otherwise file a plain tracker item and say it will not come back on its own. |
| **G** GitHub mechanic | Names a GitHub-only feature: closing keywords and the Development panel, sub-issues, `mcp__github__issue_write` / `add_issue_comment`, labels, search. Needs a per-policy equivalent or an explicit "GitHub policy only". |
| **T** trigger / guard | A skill trigger or declared check keyed on `mcp__github__issue_write`. It silently never fires under another policy, so the discipline it carries is lost there. |
| **S** stale | Already wrong today, whatever the policy. Fix independently. |
| **N** no change | Out of scope (queue, scheduled task, this repo's own local pack), a historical record, or a false positive. |

## Inventory

### packs/basics/RULES.md: the lifecycle rules every repo loads

| Location | Today | Kind | Change |
|---|---|---|---|
| :58-65 planning-migration | Points to writing-migration-plans. |: | Follows that skill. |
| :67-71 filing-issues-multi | "Filing the issues a … plan decomposes into." | R | Wording is neutral apart from "issues". |
| :97-106 verifying-now-genuinely | The follow-up must be "a mechanism that comes to you, never a human's memory". | D | Under a non-GitHub policy no mechanism exists. State the fallback honestly: a tracker item a person owns. |
| :108-115 finishing-larger-element | "phased tracking issue"; a scheduled review. | D | Same as above. |
| :121 writing-anything | "open one issue" as an example. | N | An example only. |
| :175-178 deferring-warning-cant | "open a dedicated issue". | R | |
| :180-184 searching-issue-finding | "Search the invariant identifier." | R | Searching is the policy's operation (grep a backlog file, JQL, …). |
| :186-199 starting-change-will | `Refs/Fixes/Closes #123`; "fills GitHub's *Development* panel"; update the issue by comment or close. | R+G | The core rewrite: the reference and closing syntax come from the policy. The Development-panel sentence is GitHub-only. |
| :201-203 ending-session-change | "its issue … that number". | R | |
| :205-208 spotting-change-should | Points to do-later. | D | |
| :210-215 filing-anything-ad | "the ad-hoc queue … any marked issue". | D | Applies only under GitHub policy with the queue declared. |
| :217-219 finding-queue-cannot | Do now, hand to a routine, or don't file. | D | Add a fourth outcome: record it in the tracker. |
| :222-228 handing-step-only | "its own issue … with a checkbox per step". | R | Checklists render in all three tracker types. |

### packs/basics/skills

| Location | Today | Kind | Change |
|---|---|---|---|
| committing/SKILL.md:3, :16-18 | "Reference the issue: `Refs #n`, or `Fixes #n` / `Closes #n`." | R+G | Use the policy's reference syntax. |
| do-later/SKILL.md (whole; :14-16, :22-23, :51-63, :77-82, :135-140) | An ad-hoc queue issue with a field block (`Blocked-by`, `Not-before`, `Model`, `Automerge`, `Task`) and the `task:origin:ad-hoc` label. | D+G | Split: the queue form when the policy is GitHub with the queue; otherwise a tracker item carrying the brief and what it waits on, reported as "will not run on its own". The description at :3 promises "queued behind it". |
| verify-in-production/SKILL.md :75, :101-104, :113-238 | Coded and agentic queue forms; `Original-issue:` plus `sub_issue_write`; the human form is an "ordinary issue". | D+G | The human form becomes a tracker item per policy. The queue forms are GitHub-only. The "a GitHub read" probe class (:75) is unchanged. |
| production-retrospective/SKILL.md :35, :54, :65, :84-123, :155 | An ad-hoc queue issue, a sub-issue of the tracking issue; findings "become issues". | D+G | Same split as do-later. Findings are filed per policy. |
| writing-handover-issues/SKILL.md :2-3, :8-9, :14-121 | Body guidance is neutral. The trigger is `mcp__github__issue_write.body /- \[ \]/`. | R+T | Rename the concept to "handover item". The trigger needs a policy-neutral route (by description, or per-policy tool names). |
| writing-migration-plans/SKILL.md :32, :44-47, :61-64, :283-301 | The plan lives in a tracking issue; phase zero is a handover issue. | R | The tracking item goes wherever the policy says. |
| writing-migration-plans/SKILL.md :146-152, :175-275, :329-336 | Chain links are ad-hoc issues, `Blocked-by` the previous one, sub-issues of the tracker; closing is the trigger; `Closes #<tracker>` warning. | D+G | Chains exist only under the GitHub policy with the queue. Otherwise every phase is a checkbox a person advances. |
| writing-migration-plans:192, verify-in-production:160 | Cite RULES.md *"Filing an issue that belongs under another"*. | S | That rule does not exist in basics/RULES.md. Only the `sub-issue-without-parent` check carries it. |
| improve-comments/SKILL.md:55-56 | A TODO whose issue is closed is deleted; a live one gets "the issue number". | R | Use the policy's reference and state. |

### packs/basics: checks and manifest

| Location | Today | Kind | Change |
|---|---|---|---|
| declared-checks.json:297-312 `sub-issue-without-parent` | Guard on `mcp__github__issue_write` body. | T+G | GitHub policy only. It never fires elsewhere, which is correct because there is nothing to attach. |
| pack.mjs:18 `belongs` | "issue-branch-PR lifecycle". | N | Routing text only. |
| README.md:21, :42, :48, :89 | Catalog rows. | R | Follow the renamed skills and rules. |
| *(new)* | Nowhere to declare the policy. |: | Needs a config key, an adoption question and a session-start line that states it. |

### packs/git-github

| Location | Today | Kind | Change |
|---|---|---|---|
| merge-to-main/SKILL.md:18-19, :35 | The PR body carries `Closes #<issue>`; "don't re-read an issue to confirm it closed". | G | Under a non-GitHub policy nothing closes the item on merge. Merge-to-main must close it per policy, which is a new step. |
| merge-to-main/SKILL.md:32 | Files the verify-in-production issue. | D | Follows that skill. |
| git-github-advanced/SKILL.md:15-21 | Status via `add_issue_comment`; issue and PR numbers share one counter. | G | GitHub policy only; keep, scoped. |
| git-github-advanced/SKILL.md:154-156 | An unattended workflow escalates its failure by opening a `workflow-failure` issue. | N | Machine escalation inside GitHub Actions. Its reader could be the policy's tracker, but that is CI plumbing. Flag, don't change now. |
| git-github-advanced/SKILL.md:242-251 | Attaching a patch to an issue; searching issues. | G | GitHub-scoped already. |
| declared-checks.json:68 | The fix text says to open a `workflow-failure` tracking issue. | N | Same as :154. |
| declared-checks.json:165-174 `issue-labels-overwrite` | Guard on `issue_write` labels. | T | GitHub only; correct as is. |
| README.md:10 | Cites the `task-lifecycle` check. | S | That check no longer exists. |

### packs/claudinite-lifecycle: adoption

| Location | Today | Kind | Change |
|---|---|---|---|
| adopt-claudinite/SKILL.md:12-13 | "Open the adoption issue first (the work-scope sweep blocks a commit that references no issue)." | S | The gate is gone; the adoption PR is the tracker (bootstrap.md:17). |
| adopt-claudinite/SKILL.md:18, :21, :38 | A commit referencing the issue; a handover issue with checkboxes. | S+R | Drop the adoption-issue step. The handover item is filed per policy. **This is also where the policy question is asked.** |
| bootstrap.md:47, :49, :264 | "referencing the issue", `capture-log.mjs --issue <adoption-issue>`. | S | These contradict bootstrap.md:17 ("no adoption issue"). |
| bootstrap.md:54-58 | "File the hand-over issue." | R | |
| bootstrap.md:245 | "whether a commit references its issue" as a work-sweep example. | S | That sweep no longer checks it. |
| adopt-pack/SKILL.md:37, :60, :106, :118-133 | Read "the issue tracker"; a handover tracking issue per repo; commit referencing the task's issue. | R | |
| updates/install.mjs:283-285 | Prints "open a tracking issue for these". | R | A code string. |
| engine/pack_loader/pack-schema.mjs:64, :87 | `adoptionHandover` is "filed as a tracking issue". | R | Description strings. |
| RULES.md:44 | "before filing an issue claiming it was never shipped". | N | About reporting to the canon, which is on GitHub. |

### Packs whose prose files adoption handovers or tracking issues

| Location | Today | Kind | Change |
|---|---|---|---|
| github-pages/README.md:44, skills/github-pages-pipeline/SKILL.md:32 | "File the pack's `adoptionHandover` as an issue." | R | |
| cloudflare-site/README.md:17, skills/releasing-a-cloudflare-site/SKILL.md:66 | Same. | R | |
| claude-code-web-users-support/README.md:13, pack.mjs:32 | "the issue asking …" | R | |
| claudinite-dashboard/pack.mjs:80-82 | "somebody's handover issue". | R | A comment. |
| chrome-extension/skills/chrome-store-releases/SKILL.md:249-259, :389-393 | A first-publication tracking issue ("search the tracker first"); open a tracking issue when a permission is added. | R | |
| chrome-extension/skills/chrome-store-releases/SKILL.md:87, :126, :147, :220 | `workflow-failure` issues from the reusable release workflows. | N | CI escalation; see git-github :154. |
| chrome-extension/declared-checks.json:132-148 `cer/permission-added-store-issue` | The fix text says "open a tracking issue". | R | The check's id says "issue". Rename only if the wording is swept. |
| spec-driven-product/RULES.md:107 | "linking the issue that tracks closing the gap". | R | |
| product-wiki/skills/writing-wiki-pages/SKILL.md:85 | "(and a repo issue)". | R | |
| executable-requirements/pack.mjs:22 | Adoption prompt: "… the issue tracker …". | N | Already neutral. |

### Growth and provenance (session-facing parts only)

| Location | Today | Kind | Change |
|---|---|---|---|
| capture-log.mjs, session-end.mjs, engine/hooks/session-end-command.mjs | Capture filename key `--issue-<n>--`, taken from `CLAUDINITE_SESSION_ISSUE`. | N | Only the queue sets that variable. An interactive session captures as `issue-0`. |
| growth/provenance.mjs:273 | The history brief says "read the promote tracker and the extract issues on GitHub". | N | Canon curation runs on GitHub. |
| growth/provenance.mjs:298-348, :818-823 | Parses `Refs/Fixes/Closes #n` from commits; notes Development-panel semantics. | G | A Jira or backlog reference in a commit is not parsed as a ref. Extend the grammar when the policy lands. |
| skills/extract-from-activity/SKILL.md:13, :40, :73 | Mines the "issue discussion" of the window. | G | Invoked by a scheduled task, and also by hand. Under a non-GitHub policy the issue half reads nothing. Say so rather than read it as "no lessons". |
| skills/extract-from-conversations/SKILL.md:118-120 | Posts a summary on the capture's PR or issue. | N | Keyed to queue items or PRs. |
| skills/backfilling-provenance/SKILL.md:35-44, :134 | Reads tracker comments and referenced issues. | G | Same as extract-from-activity. |
| skills/prose-to-checks/SKILL.md:167 | Log an uncertain candidate to an issue marked `task:origin:ad-hoc`. | D | |
| skills/learning-a-technology/SKILL.md:49 | A handover step (`writing-handover-issues`). | R | Follows the rename. |
| skills/triaging-usage-findings, unattended-agents, writing-tasks, growth-dedup, revalidating-rules | Usage-finding issues, standing trackers, queue items. | N | Task-side. |
| `packs/*/provenance/*.md`, VERSIONS.md, `retire:#n` markers | Issue and PR numbers cited as history. | N | Opaque references in the canon's own history, which is on GitHub. |

### Dashboard (browser app; reads the GitHub REST API directly)

| Location | Today | Kind | Change |
|---|---|---|---|
| derive/fleet.mjs:418-429 `humanWork`; derive/board.mjs:299-315 `quietTail`; derive/explore.mjs:142-163 `plainIssuePanel`; derive/activity.mjs `otherClosed` | Plain (non-queue) GitHub issues as "waiting on a person". | G | Under a non-GitHub policy these read zero. Per *lacking-field-report*, name them "tracked outside GitHub" rather than showing 0. |
| derive/fleet-ledger.mjs, derive/repo-ledger.mjs, read/pr-fields.mjs | Issue→merge lead time, joined through `Closes #n` in PR bodies. | G | Same: mark as absent under another policy. |
| everything else under src/ | Queue items. | N | The queue stays on GitHub. |

### Out of scope (listed so nobody re-surveys them)

- **`packs/claudinite-tasks/**`**: the queue.
  - Its session guard `issue-label-outside-the-queue-vocabulary` blocks any `issue_write` label outside `task:*`, including ordinary user labels on GitHub-policy repos.
  - That is a pre-existing friction, not a policy issue.
- **`packs/*/tasks/**`**, `packs/claudinite-fleet-sheepdog/**`, `packs/claudinite-canon-curation/tasks`: scheduled tasks.
- **`.claudinite/local/packs/claudinite/`**: this repo's own local rules and checks. Claudinite itself stays on GitHub Issues.
- **False positives**: `packs/flutter` ("zero issues" in analyzer output), `packs/jwt` ("issue" a token), and historical `#n` mentions in comments (engine/pack_loader/renamed-packs.mjs:45, packs/aws-sam/worldRules/handler-path.mjs:4, engine/checks/DESIGN.md, engine/RELEASES.md, migrations).

## Stale today, whatever the policy

1. **The `task-lifecycle` gate is cited but no longer exists.** Only test fixtures still name it. Cited at:
   - adopt-claudinite/SKILL.md:12-13
   - bootstrap.md:245
   - packs/git-github/README.md:10
   - canon-rule-revalidation/task.md:33, canon-prose-to-checks/task.md:32, rule-revalidation/task.md:27, growth-dedup/task.md:77
2. **bootstrap.md contradicts itself.** :17 says there is no adoption issue; :47, :49 and :264 (and adopt-claudinite) still open one.
3. **A rule two skills cite is missing.** writing-migration-plans:192 and verify-in-production:160 cite a *"Filing an issue that belongs under another"* rule that is not in basics/RULES.md.

## Open decisions before design

1. **Where the policy lives and whether it has a default.**
   - *deciding-config-value* argues for an explicit value materialized into every member.
   - *choosing-value-right* argues for a pack default.
   - The owner asked for the policy to be set initially, which is the explicit route: a basics adoption question plus a backfill that writes `github-issues` into existing members.
2. **How a session learns the policy.**
   - Option: a session-start line stating it, so the prose can say "per the repo's issue policy" without every skill re-reading config.
3. **What "per policy" supplies for each of the four operations**: file, reference, close, search.
   - Jira and Monday need a connector or MCP server that the session may not have.
   - Decide whether a missing connector means "hand the item to the owner as text" or "stop".
4. **What a skill's tool-keyed trigger becomes** under a non-GitHub policy: writing-handover-issues, and the `sub-issue-without-parent` / `issue-labels-overwrite` guards.
