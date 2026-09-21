## 2026-09-15 · born · Scope claudinite-growth to local packs, give the shelf its own tasks (#2047)
- **Reason:** the growth sweeps declared a local-pack write surface but a config key widened them
  onto the canon shelf, so every canon-side run produced a diff its own policy could not cover and
  parked. A pack owns a corpus rather than a config key naming one; widening the growth policy would
  have authorised every member's growth task to write a tree it must never touch.
- **Actor:** @missingbulb (owner).
- **Model:** Claude, per the commit trailer.
- **Mechanism:** a task over the shelf, automerging `under:packs`, whose corpus is the canon
  config's roots so nothing here names a particular canon. It loads the growth pack's
  prose-to-checks skill, which states the method and names no corpus. The run titles itself
  `Claudinite canon: …` so the growth write-scope gate reads it as out of its scope.
- **Landed:** #2047 (Closes #2044) · pack version 60915.3.
