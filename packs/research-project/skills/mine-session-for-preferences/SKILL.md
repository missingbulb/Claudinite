---
name: mine-session-for-preferences
description: Mining a revived earlier session's dialogue for the owner's process and working-style preferences and folding them into the research playbook, not continuing the research. Use when the owner revives a prior session and points it at the playbook.
---

# Mine a revived session for preferences

Some of the owner's process preferences live only in the **dialogue of earlier
Claude Code (web) sessions**, not in any committed file. If the owner revives
such a session and points it at the playbook, here is the instruction for that
revived session:

> **Your job in this revived session is to mine our conversation for *process and
> working-style preferences*, and fold them into the playbook — NOT to continue
> the research task itself.**
> Re-read the whole dialogue and extract only the durable, project-agnostic
> signal about *how the owner wants research run*: how they want results shown;
> what they praised or rejected about the workflow (not just the algorithm);
> ground-truth and annotation conventions; anti-overfitting rules they insisted
> on; how they want articles summarized, images extracted, and external data
> fetched; environment constraints they flagged; and how they hand off algorithm
> ideas. For each item, strip out anything specific to this project's subject
> matter and generalise it to the class of "run a CV/analysis algorithm over
> similarly-formatted inputs, scored against user ground truth, improved in
> reviewable iterations." Then propose additions/edits to the relevant numbered
> section of the playbook (merge, don't duplicate; keep the principle-first
> phrasing). Show the owner a diff of what you'd add and confirm the wording
> before committing.
> **Do not run or modify the research pipeline.** If a preference contradicts what
> is already written there, surface the conflict for the owner rather than silently
> overwriting.

To make revival productive, when the owner asks for it they should say **which
session(s)** to revive (a link or a description) and, if possible, what topic the
process discussion centred on — so the revived session knows where in the
transcript to look.
