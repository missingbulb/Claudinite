## 2026-09-27 · born · the font-readiness half of the retired wait-something-page rule
- **Source:** the prose-to-checks sweep of the canon, over the pack's own prose.
- **Reason:** the wait may legitimately sit in a shared helper, so the probe is repo-wide rather
  than per file; that inference is what keeps it advisory while its sibling blocks.
- **Actor:** the canon-prose-to-checks task.
- **Mechanism:** declared, a repoWide assertion gated on tracked reference images: without one there
  is nothing a capture is compared against and the rule has no subject.
- **Retire when:** a driver awaits font readiness before a screenshot by default.

## 2026-09-27 · scope-changed · the pack's own directory leaves the scan set
- **Reason:** a real-tree run of the check found it firing on the fixture file that exists to spell
  the shape it bans. The engine self-excludes a skill-scoped declaration's own directory and a
  pack-root one's not at all, so the exclusion is written by hand; a member never sees it, its copy
  of the pack living under the unscanned mount.
- **Actor:** the canon-prose-to-checks task.
- **Mechanism:** the pack path added to the check's `excludeFiles` alternation, and a clean fixture
  per check pinning it.
