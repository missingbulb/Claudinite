## 2026-09-06 · born · Declared checks at every moment: schema rung, work and action scopes, skill triggers, and the creation path (#1711)
- **Source:** phases 2 to 5 of the four-moment declared-checks design, bounded to the three packs
  every session in this repo loads.
- **Reason:** Growth-extract over captured sessions from 2026-09-06 (#1863): a `for i in 1..N; do
  sleep 20; done` loop blocked one session foreground for ~630s across four occurrences in one run,
  and the guard's own regex — anchored on `sleep` bounded by `;`/`&`/`|`/start/end — never fires
  on it, since the token before `sleep` there is `do `. A second `guardToolCalls` entry catches a
  `for` loop whose body is nothing but the sleep; a `while`/`until` loop stays clean, since that
  shape names a real condition.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** check bare-sleep-wait, in .claudinite/local/packs/claudinite/declared-checks.json.
- **Retire when:** Retire the entry only if `bare-sleep-wait`'s first regex is rewritten to subsume
  both shapes.
- **Landed:** #1711 (Closes #1699, Closes #1700, Closes #1701, Closes #1702).

## 2026-09-07 · scope-changed · Growth extract: a counted-loop sleep is a bare sleep in disguise, and two AskUserQuestion/EnterWorktree gaps (#1867)
- **Source:** the growth-extract run over the 2026-09-06/07 window.
- **Reason:** the regex caught only a top-level `sleep N`; a counted loop is the same wait spelt to
  dodge it, and one captured session held itself in the foreground for ~630s across four such loops
  in one run.
- **Actor:** @missingbulb (owner).
- **Mechanism:** a second `guardToolCalls` entry matching a `for` loop whose body is nothing but the
  sleep; `while`/`until` polling on a real condition stays clean.
- **Landed:** #1867 (Refs #1863).
