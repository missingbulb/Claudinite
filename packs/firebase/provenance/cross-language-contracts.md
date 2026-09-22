## 2026-07-08 · born · Add executable-requirements pack; fill the flutter pack stub (#165)
- **Source:** missingbulb/ShoutsAndWhispers, a Firestore + Functions + FCM app with Google sign-in.
  The evidence names the project for the set of rules rather than one per rule.
- **Reason:** "both use the standard algorithm" is not a proof, and a derived value that disagrees
  across client and server fails silently and far from its cause. Committing identical
  input-to-output vectors in both suites and diffing the literals is the only check that runs
  without both runtimes in one process.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** a RULES.md rule, triggered on "Cross-language contracts get mirrored test
  vectors.".
- **Landed:** #165 (Closes #180) · pack version 1.
