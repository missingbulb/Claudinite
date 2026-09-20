## 2026-09-10 · born · converted from references.md (learning-a-technology-1): "Probe egress before you research, and stop on a block."
- **Reason:** The session that wrote the skill probed `developers.cloudflare.com` from a Claude Code
  web sandbox and got `CONNECT tunnel failed, response 403` — the environment's network policy,
  which the `fetching-from-the-web` skill says no alternate source and no later pass crosses.
  Neither of the two asks it was written from (missingbulb/ClaudiniteWebsite#454) could tell whether
  its research had reached the vendor's documentation at all, and nothing in either result recorded
  which.
- **Mechanism:** a step of the learning-a-technology skill, a workflow
- **Retire when:** Retire only once every session's environment is known to allow
  vendor-documentation egress, or the `## Verified` record is checked by machine against a real
  fetch log.

## 2026-09-10 · strengthened · converted from references.md (learning-a-technology-2): "A canon pack's territory"
- **Reason:** Owner request on missingbulb/ClaudiniteWebsite#454: "consider the difference between
  the project-specific task and the technology skills, and try to assess if the project-specific
  task is also an ad-hoc thing for the current project or could fit in a different pack". The
  recorded verdict is what the promote stage reads to know whether a task travels with its skill;
  the bar a lesson clears and the ladder it descends stay
  [extracting-lessons.md](../extracting-lessons.md)'s.
- **Mechanism:** a step of the learning-a-technology skill, a workflow
- **Retire when:** Retire only if the lifecycle gains a way to read a task's intended home other
  than a recorded verdict.

## 2026-09-10 · strengthened · converted from references.md (learning-a-technology-3): "The worker reaches the skill's code through one path constant at its top"
- **Reason:** Promotion lifts a skill's folder into a canon pack and the dedup stage then removes
  the local copy; a worker that spells the skill's code path in more than one place breaks at that
  removal, with nothing red naming the cause.
- **Mechanism:** a step of the learning-a-technology skill, a workflow
- **Retire when:** Retire only if the engine resolves a skill's code by skill name rather than by
  path.
