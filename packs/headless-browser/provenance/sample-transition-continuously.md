## 2026-09-26 · born · a CSS-transition assertion must sample every frame, not one delayed sample (#906)
- **Source:** a fade case in an animated-planner harness: a first fix replaced a bare timeout with
  a wait on the state change plus a further timeout, which still wasn't robust; the commit that
  actually landed replaced it with a `MutationObserver`/`requestAnimationFrame` loop collecting
  every frame across a bounded window and asserting some frame lies strictly between the start/end
  values.
- **Reason:** the reusable part is the sampling *technique* (continuous rAF sampling vs. a single
  delayed sample gated on the state change), not the specific fade it was found on — the next
  animated custom-property transition in any such harness faces the same choice.
- **Mechanism:** a bullet in a requirements-harness skill's "traps the harness already paid for"
  list, distilled here into this pack's own Capturing rules; a testing-judgment call about async
  sampling strategy, not a static shape a check could assert.
- **Retire when:** the originating harness grows a shared helper that does this sampling
  generically — this pack's rule still stands as the general technique for any other harness.

## 2026-09-26 · promoted · from a member's local pack (https://github.com/missingbulb/Claudinite/pull/2283)
