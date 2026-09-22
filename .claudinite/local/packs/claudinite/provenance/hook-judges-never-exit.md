## 2026-09-06 · born · Declared checks at every moment: schema rung, work and action scopes, skill triggers, and the creation path (#1711)
- **Source:** phases 2 to 5 of the four-moment declared-checks design, bounded to the three packs
  every session in this repo loads.
- **Reason:** the harness reads exit 2 as the one block, and any other exit code, a timeout or
  non-JSON stdout is an error printed beside every call it happens on. One runner exits; the judges
  return verdicts.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a check over the hook modules, beside `engine-tests/hooks/hook-runner.test.mjs`,
  which drives a bad payload, an engine that fails to load, a throwing registry and a closed stdin
  through the real entries. .claudinite/local/packs/claudinite/declared-checks.json.
- **Landed:** #1711 (Closes #1699, Closes #1700, Closes #1701, Closes #1702).
