## 2026-09-20 · born · Provenance: the mechanism - the grammar, the tool, the checks, the forced skill, the record (#2176)
- **Source:** step 1 of the provenance plan, #2169.
- **Reason:** a person's own rules earn the same record every other pack element gets - why the rule
  reads as it does, and who decided - so the store carries a provenance file per rule beside the
  person's own prose.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a world check in this pack, advisory, carrying `since: 2026-09-20` so the existing
  unmarked backlog reads as advisory rather than failing the repos that hold a store.
- **Landed:** #2176 (Refs #2169) · pack version 60920.1.

## 2026-09-21 · severity-changed · a person's provenance moved inside their own pack (#2188)
- **Reason:** the sidecar `<path>-provenance/<email>/` existed because the store was flat and could
  hold nothing but `<email>.md`. A person's directory is a pack, so its provenance belongs at
  `provenance/` inside it, like every other pack's.
- **Actor:** @missingbulb (owner).
- **Mechanism:** unchanged carrier and severity. Its scope narrowed to the pack's own RULES.md: a
  person's pack also carries skill bodies and its own provenance files, and reading one of those as
  a rule index would report its every bullet.
- **Landed:** #2188

## 2026-09-22 · reworded · the rule takes the run's surface rather than the raw context (#2261)
- **Reason:** the world sweep gained a surface beside check-the-work's, so a rule destructures what
  it reads and receives it preconfigured instead of re-deriving it off `ctx`. Mechanics only: the
  sweep's findings are byte-identical.
- **Actor:** the engine/implement-request run on #2261.
- **Model:** claude-opus-5
- **Landed:** #2268
