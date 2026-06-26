# Working discipline

The working discipline that isn't itself a GitHub operation — general habits for how to approach a change, independent of any one project.

Start every requested change from the *problem*, not the solution. When the owner asks for a change, don't begin implementing it until the two of you share an explicit understanding of the problem it's meant to solve **and** have agreed that the requested change is the best way to solve it — a different fix, or no change at all, may serve the underlying problem better. Treat the request as a description of a desired outcome, not a specification to execute on sight; surface your read of the problem, raise a better approach if you see one, and reach consensus first. This applies to any repository, not just this one.

Confirm a behavior isn't already provided before building a mechanism for it — verify the gap against a real run first; the cheapest fix is often that it already works.

Fix build/test/CI warnings, don't tolerate them: a clean run with no warnings makes a genuinely new warning or error stand out, so noise here costs detection later. Prefer a small, targeted fix that addresses the *cause* in the same change.

Suppressing a warning — muting it with a flag (e.g. `--disable-warning`), `eslint-disable`, swallowing it, etc. — is **not** a small fix: it hides the signal instead of resolving it. Never reach for suppression as the quick path. It's only ever an option inside the dedicated-issue path below, as a deliberate, reviewed decision once the real fix has been weighed and rejected — never an unattended default.

When a warning can't be fixed with a small cause-addressing change now without hindering current work (e.g. it's waiting on an upstream release, or the real fix is a larger refactor), open a dedicated issue for it (unless one is already open) so it's tracked and not lost — then move on. Resolving it (real fix, or a consciously-chosen suppression) happens in that issue's own change.

An approval — to merge, to ship, to proceed — applies only *backward*, to the work already in front of the owner when it's given, never to anything requested or done *after* it. A later follow-up, even a fix to the just-approved change, needs its own explicit approval; don't carry one approval forward, and don't treat a chosen answer to a multiple-choice prompt as authorization just because an option's wording mentioned the action. When in doubt, surface the new state and wait for a fresh approval.
