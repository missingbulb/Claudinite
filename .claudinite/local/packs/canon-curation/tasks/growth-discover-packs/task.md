# Growth — discover canon packs (the fleet sweep)

One weekly pass over **every member**: read what the fleet is actually built on, subtract what the shared canon already homes, and open a PR **for the owner to approve** authoring the pack that is missing. Declared only by Claudinite, so it runs **once, centrally**, never per project.

This is the only thing that notices a technology in use across the fleet with **no canon pack**. Its per-repo namesake in [grow_with_claudinite](../../../../../../packs/grow_with_claudinite/tasks/growth-discover-packs/task.md) is the other side of the same line: that one authors a repo's **own local** packs and is barred from re-creating what a canon pack homes. It cannot close a canon gap; you can, and only you.

**Why central.** One run sees every member, so **first-sight dedup is free**: the third member using a technology is recognised as the same gap as the first, in the same pass, with no cross-run state and no chance of three repos each proposing the same pack.

You run under the executor, dispatched by a `ready-for-agent-fleet` issue whose **Context section is binding scope**: it names the exact members to sweep. Work exactly that list — the fleet enumeration already happened in the precondition; **do not enumerate the fleet yourself or widen past the Context**. Finding nothing unhomed is a perfectly good, common outcome.

The task's declared outcome ceiling is **`open-pr`**: a new canon pack is read by every repo that declares it, so it opens a PR and **never arms auto-merge** — the owner approves it.

## Conventions used in this doc

- **GitHub access is MCP-only** (`mcp__github__*`). You are outside each member repo — read its files over the API (get-file-contents, never a cross-repo checkout; the sandbox has no cross-repo git). The Claudinite PR is opened over MCP too.
- **`main`** stands for Claudinite's default branch.
- **The canon shelf** is Claudinite's own `packs/` tree — the packs every member can declare.

## What each run does

### 1. Manifest each member's stack

For each member named in Context, catalogue what it is built on, exactly as the per-repo task's [manifest step](../../../../../../packs/grow_with_claudinite/tasks/growth-discover-packs/task.md) specifies — the same three axes, the same per-item fields, the same **never infer from "projects like this usually…"** rule, the same comprehensive-over-concise bias. That step owns the method; do not re-derive or re-state it here. The only adaptation: you read the member over the API rather than a working checkout, and you keep one manifest **per member**, tagged with the repo it came from.

Do not consult the canon shelf yet, and decide nothing about packs — this step only observes.

### 2. Fold the members into one fleet view

Merge the per-member manifests into a single list of technologies, keyed by the technology, each carrying **which members use it** and at what prominence. This fold is the whole reason the task is central: the same technology seen in four members is **one** entry, recognised on first sight, so there is no cross-run dedup state and no duplicate proposal.

Drop anything no member uses at `core` or `supporting` prominence — a technology only some member's vestigial config mentions has taught the fleet nothing.

### 3. Find the canon gap

Hold the fleet view against the **canon shelf**. A candidate is a technology (or a domain the fleet shares) that:

- **no canon pack homes** — and, per the per-repo task's rule, **a stub pack counts as homed**: if `packs/` already has any pack owning it, the gap is closed. The action for a member using a homed technology without declaring its pack is to note that ("member X should declare pack Y"), never to author a second pack; **and**
- carries **real, portable working knowledge** the members actually demonstrate — a build/config gotcha, a toolchain rule, a procedure that recurs across them. Judge worthiness by the bar [item-routing.md](../../item-routing.md) owns; don't restate its gates.

Prefer a candidate **more than one member** uses — that is the evidence a pack is portable rather than one repo's local business. A single-member technology can still qualify when the knowledge is plainly general, but it is the weaker case, and the per-repo task already covers the local-pack answer.

### 4. Author the pack — from the members' real usage

Author `packs/<name>/` using the pack-writing mechanics [the generate-project-instructions skill](../../../../../../packs/grow_with_claudinite/skills/generate-project-instructions/SKILL.md) owns — descend the promotion ladder, add the `marker`/`detect` fingerprint when the technology carries a reliable one (`detect: null` otherwise), write `RULES.md`/`pack.json`/`README.md`, and add its `packs/README.md` index row. Apply that method; do not re-derive it.

Two rules from the per-repo task carry over unchanged, and are the ones this task most easily breaks because it is writing from *other* repos' evidence:

- **Ground every rule in a member's real files, and cite which member.** Never author from imagination.
- **Never pad** with speculative best-practice rules the evidence doesn't demonstrate, and **never open an empty stub to fill later**. A small honest pack beats a padded one; a rule you can't ground, you don't write.

Strip the member (names, paths, and product concepts stay in the origin repo — a canon pack is written as if no particular repo existed); a technology mention is the point, a *product* mention is a defect.

**One pack per PR.** A new pack earns its own review surface, so a run that finds two gaps opens two PRs.

### 5. Open the PR

Open a PR against `main` on a per-run-unique branch — never a direct push. Write surface is **`packs/` only**: the new pack's files and the `packs/README.md` index row. Don't "improve" unrelated packs while you're in there. Keep every commit and PR terse, and **put the issue reference in the commit message** (`Refs #<n>` for the tracker below), in the commit itself and not only the PR body.

### 6. Log the run to the tracker

The standing log is the issue titled exactly **`Claudinite tracker: Discover Canon Packs`**.

- **Find it by that exact title, never a fuzzy match or a hard-coded number** (a bare number can dangle).
- **Create it already closed if missing. Never open, close, or reopen it** — its state carries no meaning; only the log does.
- Log every run as a **dated comment**: the members swept; each pack authored (technology, the members that evidenced it, the rungs its rules landed on); each "member X should declare existing pack Y" note; and, for a candidate you rejected, its name and why. "Nothing unhomed this run" is worth a line too.

## What this task must never do

- **Never widen past the Context member list**, and **never touch a member repo** — this task only reads members and writes the Claudinite PR.
- **Never author a pack for a technology the canon already homes** — a stub counts as homed; note the "declare the existing pack" action instead.
- **Never author from imagination or pad, and never open an empty stub** — every rule traces to a named member's real files.
- **Never write a member's product names, paths, or concepts into a canon pack** — that is the local-pack answer, and it belongs to the per-repo task.
- **Never write outside `packs/`** — no engine, no docs, no member-side change.
- **Run on `opus`** — every step is a judgment call (is this technology genuinely unhomed, has the fleet earned a shared pack for it, what does the evidence actually support), and you are authoring from *other* repos' evidence with no owner able to re-derive each call. This task declares `agent_model: opus`.
