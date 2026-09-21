## 2026-09-20 · declined · flutter analyze at zero issues, as a workflow check
- **Source:** the prose-to-checks sweep of the canon, #2164.
- **Reason:** convertible in shape - a workflow running `flutter analyze` without `--fatal-infos` is
  a static signature - but the check would rest on an unverified claim about that flag's default,
  and no Flutter toolchain is reachable from a session here to settle it against a real run.
- **Actor:** @missingbulb (owner), on the canon-prose-to-checks task.
- **Landed:** #2164 (work item #2142) · pack version 60920.1.

## 2026-09-20 · declined · the import boundary, the golden mechanics and the test-runner rules, as checks
- **Source:** the prose-to-checks sweep of the canon, #2164, re-deriving the tracker rejections of
  2026-07-26 through 2026-08-30.
- **Reason:** the forbidden plugin-prefix list the import boundary would scan for is the consuming
  project's and unbounded from here; the rest is runtime or authoring judgment with no artifact to
  read. The earlier rejections were re-derived rather than cited, and still hold.
- **Actor:** @missingbulb (owner), on the canon-prose-to-checks task.
- **Landed:** #2164 (work item #2142) · pack version 60920.1.
