## 2026-09-26 · born · a leftover pointer after a click/drag opens a stray hover-tip in a capture (#906)
- **Source:** two cases in the same window, fixed the same way: an off-fare fix (whose own label
  would otherwise open over the picture) and an off-button fix (whose own label would otherwise
  open over the days).
- **Reason:** recurred 3 times across 2 PRs; distinct failure mode from the already-landed rule
  that opens hover-driven UI at capture time (that one is scroll-triggered `mouseleave` between
  drive and capture steps; this is a leftover hover-tip from an unrelated preceding gesture), fixed
  the same way each time by parking the pointer at `(0, 0)`.
- **Mechanism:** a bullet in a requirements-harness skill's "traps the harness already paid for"
  list, distilled here into this pack's own Capturing rules.
- **Retire when:** the originating harness's own capture helper parks the pointer automatically
  before every capture, making the per-case comment there unnecessary — this pack's rule still
  stands for every other harness.

## 2026-09-26 · promoted · from a member's local pack (https://github.com/missingbulb/Claudinite/pull/2283)
