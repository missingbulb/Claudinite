---
name: unattended-agents
description: Architecture and practices for unattended, automation-invoked agents and recurring routines. Use when building, structuring, or running an AI agent, a scheduled routine, or a multi-stage agent pipeline.
---

Follow [tasks/agent-architecture.md](../../tasks/agent-architecture.md) (the judgment-boundary
and write-surface guarantees) and [tasks/agenticBestPractices.md](../../tasks/agenticBestPractices.md)
(the operating practices) — both canonical there. The spine: leave the agent only the judgment
step, hard-code the rest, and enforce its write surface from outside with a post-hoc diff check.
