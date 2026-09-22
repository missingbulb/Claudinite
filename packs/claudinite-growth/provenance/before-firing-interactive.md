## 2026-09-22 · born · serial asks spent idle wall time on answers already in hand (#1886)
- **Source:** CrosswordChat and GCEC runs, where a picker fired for a decision the loaded rules had
  already settled, and where several questions went out one at a time.
- **Reason:** an interactive question costs a full human round-trip, and two distinct habits spend
  it for nothing: asking what context, repo or fleet state already answers, and asking serially when
  the run knows every open decision up front. The "(Recommended)" option being the status quo is the
  tell for the first - a picker whose recommended answer is "carry on" was never a decision.
- **Mechanism:** a guideline on this skill, which loads when an unattended or dispatched run is
  under way; the judgment is about whether a decision exists at all, which no check can read.
- **Retire when:** questions are batched by the harness itself, or a picker can declare its own
  answerable-from-state precondition.
- **Actor:** claudinite-canon-curation growth-promote run, rebased and resolved in an owner session.
- **Model:** claude-opus-5
- **Landed:** #1886
