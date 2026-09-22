## 2026-08-16 · born · the two OS floors are compared by a check (#901)
- **Reason:** a two-files-must-agree invariant has a false-positive-free signature once both claims
  are present and readable, and nothing in a build compares them. Absence is never a finding,
  because which plist is the app's is not something a scan can know, and a value that is a build
  substitution is not a claim. Both sides are parsed rather than grepped: the `.macOS(...)` calls
  come from inside the `platforms:` array's own brackets with Swift comments stripped, and the
  plist's XML comments are blanked length-preservingly so the finding still points at the real line.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a coded check, `packs/macos/minimum-system-version-agrees.mjs`, blocking. Coded
  rather than declared for the cross-file comparison.
- **Rejected:** deleting the prose bullet it converts. Under the deletion test the bullet stays
  whole: it also asks that the key exist at all, which the check deliberately does not enforce.
- **Landed:** #901, the weekly prose-to-checks sweep (tracker #450) · pack version 2.

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
