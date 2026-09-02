# Visual identity — the ledger sheet

The product is a scheduler that keeps a ledger against a rulebook, and the page is opened
once a day by its only reader. So it is drawn as the thing it is: **one ruled sheet**, a stub
column, entries in a typewriter mono, totals under a double rule, a timetable for the days
ahead. Cool paper, cool ink; warmth only where a person is addressed. The committed drawings
are [mocks/fleet.html](mocks/fleet.html) and [mocks/repo.html](mocks/repo.html), and their
`:root` blocks are the tokens below.

## Palette

| Token | Light | Dark | Role |
|---|---|---|---|
| `--paper` | `#eef1ef` | `#131917` | page ground, a cool green-grey cast |
| `--sheet` | `#fbfcfb` | `#1b2321` | the ruled sheet |
| `--ink` | `#16211f` | `#e6ebe7` | text; also the *now* line |
| `--ink-2` | `#4b5956` | `#b2bdb8` | secondary text, deltas, units |
| `--muted` | `#7c8a86` | `#7d8a86` | labels, notes, declined cells |
| `--rule` | `#d5ddda` | `#2c3634` | band rules, the sheet's edge |
| `--ledger` | `#c3d5dc` | `#2f4149` | the ruled lines, column rules, the board's day rules |
| `--wash` | `rgba(43,98,161,.06)` | `rgba(127,178,232,.08)` | the past on any timeline; inline code ground |
| `--machine` | `#2b62a1` | `#7fb2e8` | the machine's own marks: PR bars, predicted cells, this week's series, links |
| `--machine-wash` | `rgba(43,98,161,.13)` | `rgba(127,178,232,.16)` | PR bar fill |
| `--dim` | `#b9cad8` | `#3b5570` | the previous window's series |
| `--you` | `#c98a12` | `#e3b458` | every "waits for you" mark; the approval park |
| `--you-text` | `#8a5f05` | `#e3b458` | text in that voice |
| `--you-paper` | `#fdf3e2` | `#2e2717` | the Start-here slip's paper |
| `--good` / `--good-text` | `#1f8a4c` / `#17703c` | `#4dbb7a` | a run that happened; a quick-win |
| `--serious` / `--serious-text` | `#d0602a` / `#a3451a` | `#ee8a58` | a verdict a person should act on; the tinted delta |
| `--critical` / `--critical-text` | `#bf3b2e` / `#a02f24` | `#ee6d60` | broken, never ran, a failure park, a broken lane |

Dark is a **selected set, not an inversion**: the same paper turned over — a cool near-black,
never pure, off-white ink at ~90 %, the wash at 8 % with a hue so the past stays visible on
the board, `--dim` two steps below `--machine` so the two weeks' series keep their contrast,
and each status hue re-stepped lighter and less saturated to hold ≥ 3:1 on the dark sheet.

The **semantic set** is `good · you · serious · critical`, reserved for verdicts and never
used as a series hue. `warning` *is* `you`: one amber, one meaning — a person.

## Type

Two faces, with a real contrast between them, at three sizes.

- **Archivo** (Google Fonts, variable: `wdth 62–125`, `wght 100–900`) — the text face. One
  family gives two voices: normal width for sentences, and `wdth 78` bold caps at 10.5 px with
  `0.09em` tracking for stub labels, column heads, group headers and the wordmark — the
  condensed timetable voice. Archivo is a grotesque cut from late-19th-century American record
  type; the register is a record, not a brand. Fallback
  `"Archivo Narrow", "Helvetica Neue", Arial, sans-serif`.
- **DM Mono** (Google Fonts) — every figure, id, time, delta, count and command. A ledger's
  entries are typed: mono digits align without `tabular-nums`, `#1583` reads as an id and not
  a word, and `−14` carries a real minus. Fallback
  `ui-monospace, "SF Mono", Menlo, Consolas, monospace`.
- **No display face.** The biggest thing on the page is a figure: the mono at 21/500 in the
  machine cells, 18/500 in the ledger, 16/500 in the totals; the slip's headline is the text
  face at 17/700. Body is 12.5/1.4; labels 10.5 caps; deltas 12 mono; board text 11 with ids
  at 10.5 mono.

The unit sits in the text column, never on the figure's baseline.

## Layout

- **One sheet.** The top block is a single ruled surface with a **112 px stub column** naming
  its bands — START HERE · THE MACHINE · THIS WEEK · PULSE, then MEMBERS or WORK — each stub
  with the band's question in small italics beneath. Bands are separated by rules of two
  weights (`--rule` between bands, `--ledger` within), totals sit under a **double rule**
  (`3px double var(--ledger)`), and the board is the same sheet continued: its day columns
  ruled in ledger blue, its rows in the same 36 px rhythm as the ledger.
- **No cards.** Nothing is a bordered, rounded, shadowed box; the sheet has one 2 px radius
  and one 1 px `--rule` edge. Exactly one thing sits *on* the sheet: the Start-here slip.
- **A 4 px base**: 8 / 12 / 16 / 24 only.
- **Fixed ledger tracks** — figure · text · delta · spark — so figures, deltas and sparks form
  three vertical columns down all three ledger columns. The alignment is the design.
- **Expands are text links** in the totals row (`per member ▾`, `per task ▾`), and a detail is
  a ruled table under the double rule, never a second card.
- **One tick vocabulary** across the heartbeat, the wake strip and the board: square, 2 px
  gaps, a count as a number and never as a height. Pulse bars are capped in width, gapped 2 px,
  28 px tall; sparks are the same marks at row scale.
- **Nothing clips.** The slip wraps; the one line the reader must read is never cut.

## The one bold move — warm means you

The whole page is cool: paper, ink, the machine's blue. The only warm things are the ones
addressed to the person — the Start-here slip on `--you-paper`, and every *waits for you* flag
and approval park in `--you`. Nothing else is warm unless it is broken. The eye finds its job
before it reads a word.

## The delta-tint rule

A signed delta is set in `--ink-2` unless the figure's own *bad when* rule (stated in
[fleet-page.md](fleet-page.md) and [repo-page.md](repo-page.md)) fires; then, and only then,
it takes `--serious-text`. A merely-down week and a merely-up lead time under its bar are
figures, not verdicts. A good move is never coloured — nothing green needs a person — and the
critical hue is never spent on a delta, so the one critical square on the sheet (a member
that never ran) is not camouflaged. On the board, amber means exactly one thing, *waits for
you*; it never marks a direction.

## The board's mark vocabulary

Every mark encodes in **form** as well as colour, so the board reads in either theme and in
greyscale.

| Mark | Form | Colour | Encodes |
|---|---|---|---|
| bar | 10 px tall, `rx 2`, from opened to *now*; 16 px when collapsed | `--machine-wash` fill, `--machine` stroke | an open PR; its length is its age; a thick bar with a count is several under one policy |
| `▲` | a triangle above the bar's *now* end | `--you` | this PR waits for a person |
| filled circle | at *now* | `--machine` | a running item |
| hollow circle | at its predicted time | `--ink-2` stroke | a queued item — blocked on a date, an issue, or ready for the next tick |
| dashed hollow circle | as above | `--ink-2` | an item on no queue mark — nothing will pick it |
| square with `×` | 12 px at *now* | `--serious` | an action park |
| square with `–` | 12 px at *now* | `--you` | an approval park — it is a PR waiting for you |
| square with `?` | 12 px at *now* | `--serious` | a decision park |
| hatched square | 12 px | `--critical` stroke, hatch fill | a failure park |
| diamond, hollow | at the head of the edge it blocks | `--ink` | a plain issue |
| diamond, filled | | `--good` | a `quick-win` |
| diamond, dotted outline | | `--ink` | rotting (idle ≥ 14 d) |
| diamond, ghost | in the past wash, no time | `--muted` | a migration-ladder phase with no queue mark |
| solid edge with arrowhead | | `--ink-2` | a `Closes` / `Ends-when` link |
| dashed edge | | `--muted` | a `Blocked-by` link that will release |
| dashed edge with `»` | | `--critical` | a broken lane — nothing scheduled can move its upstream end |
| grid cell, filled | 18 × 12 | `--good` | a scheduled run that happened |
| grid cell, hollow | | `--muted` stroke | asked and declined |
| grid cell, hollow | | `--machine` stroke | predicted |
| grid cell, **half-height** hollow | 18 × 6 | `--muted` | will decline again |
| grid cell, filled | | `--you` | parked on approval |
| grid cell, hatched | | `--critical` | a failure park, on its task's own row |
| a count inside a cell | 9.5 px mono | sheet on a filled cell, `--ink-2` on a hollow one | more than one occurrence that day |
| `◂` / `▸` | gutter notes in mono | `--muted` | items past the window's edges |
| the *now* line | 1 px solid, mono flag | `--ink` | now |
| the past | a wash | `--wash` | before now |
| a 6 px severity square | at a row label | the semantic set | the row's worst verdict — never a rail |

Text in a lane is one finding per row in `--serious-text`; everything else is a hover title.

## The theme token pattern

The complete light palette is defined on bare `:root`. The dark set is redefined twice, in
full, and nowhere else: under `@media (prefers-color-scheme: dark)` guarded as
`:root:not([data-theme="light"])`, and under `:root[data-theme="dark"]`, so an explicit toggle
wins in both directions and the system default follows the OS. `color-scheme` is set in each
block. No colour has its only definition inside a media or `[data-theme]` block, and `body`
paints `--paper` explicitly. Both mocks carry the pattern verbatim.

## Rules a future change must respect

Distilled from the design reviews; each is a line a change can be held to.

1. **Severity colour only on a verdict.** A delta, a direction, a series or a category is
   never coloured by the semantic set. Colour says *act*, not *up* or *down*.
2. **Warm means you.** `--you` and `--you-paper` appear only on things addressed to the
   person. Nothing else on the page is warm unless it is broken.
3. **Critical is scarce.** It marks *broken* and *never ran*; it never marks a slower week,
   an old PR or an ordinary park.
4. **One large object per page.** The pulse is the fleet page's one chart at readable size;
   the board is the repo page's. Nothing else competes for ink.
5. **One sheet, no cards.** A new panel is a band with a stub, not a bordered box; a detail
   is a ruled table under a double rule.
6. **Figures in mono, words in the text face.** Every number, id, time, delta and command is
   DM Mono; the unit and the sentence are Archivo. No third face.
7. **Three sizes, not five.** Label 10.5 caps · text 12.5 · figure 18–21. A new element takes
   one of them.
8. **Ids printed once.** The gutter names a row by its head item and a count; the lane carries
   the other ids once, beside their marks.
9. **Form before colour on every mark.** Predicted and declined differ by height, never by
   dash pattern; a park's kind is its glyph; a plain issue is a diamond whatever its state.
10. **One tick vocabulary.** Heartbeat, wake strip, pulse, sparks and grid cells are the same
    square mark at different scales; a count is a number, never a height.
11. **One rule colour.** Hairlines are `--rule` between bands and `--ledger` within; there is
    no second grey.
12. **The past is washed, now is solid, the future is hollow.** Every timeline on both pages
    — the wake strip, the pulse, the board — obeys the same grammar, and an unfolded stretch
    is a named gap, never a floor.
13. **A sub-line is a second actionable figure, or nothing.** Assumptions and colour go to the
    hover title and the disclosed *how these are counted* block.
14. **A gap is stated in the muted step, on one line.** *lines · not recorded* — never an
    italic sentence on the figure grid.
15. **Nothing clips.** A line the reader must read wraps.
16. **A group header carries one derived sentence** in the lane and nothing else; every
    other count is a hover.
17. **Dark is chosen per role**, never inverted: check each status hue at ≥ 3:1 on
    `--sheet` and keep `--dim` two steps below `--machine`.
