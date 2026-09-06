---
name: searching-for-a-tool
description: Finding a harness tool by name — the select form for a deferred tool, and what an empty search means. Use before any ToolSearch, and when a search finds nothing.
metadata:
  force-load-on-tool-calls:
    - 'ToolSearch'
  force-load-on-tool-results-matching:
    - 'ToolSearch /no (matching )?tools/i'
---

# Searching for a tool

- **A search that finds nothing** is evidence about your query, not about the environment: the bare
  short name returns "no matching tools", which reads exactly like absence.
- **Search the fully-qualified name** — `select:mcp__<server>__<tool>`, copied off the
  deferred-tools listing — and try the tool before telling the owner a step is theirs.
