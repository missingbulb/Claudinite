## 2026-09-27 · born · the font-readiness half of the retired wait-something-page rule
- **Source:** the prose-to-checks sweep of the canon, over the pack's own prose.
- **Reason:** the wait may legitimately sit in a shared helper, so the probe is repo-wide rather
  than per file; that inference is what keeps it advisory while its sibling blocks.
- **Actor:** the canon-prose-to-checks task.
- **Mechanism:** declared, a repoWide assertion gated on tracked reference images: without one there
  is nothing a capture is compared against and the rule has no subject.
- **Retire when:** a driver awaits font readiness before a screenshot by default.
