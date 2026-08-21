# Pack-contributed dashboard metrics

How any pack surfaces its own key figures on the dashboard — a release pack the last
release, `executable-requirements` the requirements that moved, the canon the packs it
recently gained — without the dashboard knowing any pack's business and without a pack
being able to hurt the page.

The whole contract in one line: **a pack contributes data, never code.**

## The contract

A pack that wants figures on the dashboard carries one file, `packs/<id>/dashboard.json`
— the **descriptor** — vendored with the pack like everything else it ships. It declares,
in a closed vocabulary the dashboard owns:

- a **card** on the repo page (up to six widgets),
- at most one compact **signal** per member row on the fleet page,
- optionally one deployment-scope **card** on the fleet page,
- and, per widget, which **source** its value comes from.

The page executes nothing from any pack. Descriptors and values are JSON lifted as text
over the API — the same way task-declaration fields already are, and for the same reason:
there is no `import` when reading another repo. The fleet view renders repos the viewer
merely has read access to; importing their modules would run every member's code in the
viewer's browser, with the viewer's token in scope. Data only has to be *tolerated*
across pack versions; code would have to be version-matched and sandboxed.

## The descriptor

```jsonc
// packs/<id>/dashboard.json
{
  "$schema": "../claudinite-dashboard/dashboard-descriptor.schema.json",
  "repo": {
    "widgets": [
      { "id": "last", "kind": "event", "label": "last release", "source": "latest-release" },
      { "id": "landed", "kind": "window", "label": "requirements changed" },
      { "id": "recent", "kind": "list", "label": "recently changed" }
    ]
  },
  "fleet": {
    "member": { "id": "last", "kind": "event", "label": "release", "source": "latest-release" }
  }
}
```

There is no templating and no expression language: a widget's `id` is the key its value
is looked up under, and everything else is fixed vocabulary. A schema
(`dashboard-descriptor.schema.json`, owned by the dashboard pack, pointed at by
`$schema`) validates descriptors with ordinary tooling, and a canon check holds every
pack's descriptor to it. The page revalidates structurally on read and treats an invalid
descriptor as one named fault line on that pack's card — never a broken page, never an
invented value.

## Sources — where a value comes from

Two kinds, and the vocabulary is the dashboard's to extend, one deliberate kind at a
time:

- **`generated`** (the default): the value is read from the pack's own generated file in
  the member's tree, `.claudinite/local/dashboard/<pack>.GENERATED.json`, keyed by widget
  `id`:

  ```jsonc
  { "generatedAt": "2026-08-20T04:12:00Z",
    "values": {
      "landed": { "value": 5, "previous": 8 },
      "recent": { "items": [ { "text": "REQ-041 checkout retry", "url": "…", "at": "…" } ] } } }
  ```

  The owning pack's own machinery writes it — a task landing through
  `deliver-generated`, on whatever cadence its signal moves. One file per pack: two
  independently-adopted packs never share a write target or a format.

- **`latest-release`**: the repo's latest GitHub release — tag and published time,
  rendered as an `event`. This is the one platform fact several packs want that no file
  in the tree carries and no pack task should have to mirror; the dashboard makes the
  read once per repo, ETag-revalidated, and every pack that asks shares it.

## Widgets — how a value renders

Four kinds, all rendered by the dashboard's own `ui.mjs` renderers, all through
`textContent`:

| kind | value shape | for |
|---|---|---|
| `stat` | `{ "value", "unit"? }` | a point-in-time fact — pages in the wiki, requirements in the spec |
| `event` | `{ "text", "at", "url"? }` | the last time something happened, and what — "v1.4.2 · 3 days ago" |
| `window` | `{ "value", "previous" }` | a count of things that happened, this window against the previous |
| `list` | `{ "items": [{ "text", "url"?, "at"? }] }` | the few most recent named things — capped at 5 by the renderer, overflow shown as a count, never silently |

`window` is the only sanctioned shape for a count of happenings — `stat` is for facts
that are true now, and there is deliberately no shape a monotonic cumulative total fits.
The schema cannot check meaning, so the descriptor schema's own description states the
rule and review enforces it.

Rendering is bounded everywhere: labels, texts and item counts truncate at renderer-owned
budgets with the overflow named; a `url` must parse as `https:` or renders as plain text.

## The two views

**Repo page** gets a *What the packs report* region after the core panels: one card per
declared pack whose mount carries a descriptor with a `repo` half — the pack's badge and
id, then its widgets. A widget whose value is missing renders as the absent state the
page already has, naming the file that would carry it.

**Fleet page** gets two things:

- **Member signals** — one compact chip per pack per member (`fleet.member`, kinds
  `event` or `stat` only), in a *Packs* column group beside the existing three. At most
  three chips render in the cell; the rest are a "+n" the hover expands.
- **Deployment cards** (`fleet.deployment`, same shape as a repo card) — rendered once,
  from the packs the deployment repo itself declares; its `generated` source may name
  `"repo": "canon"`, which resolves to the configured `canonRepo` (absent that config,
  the card is absent and says so). This is how the canon shows recently added packs on
  a fleet page.

Pack contributions never feed the attention ranking, the member ordering, or the rollup
tiles. Attention is earned by engine-defined truths the page can defend; a pack cannot
rank across a fleet it does not know, and a viewer must be able to trust that a
worst-first ordering was not claimed by whoever shouted loudest.

## What it costs

Discovery is free: both views already read `.claudinite-checks.json` and the tree
listing at the head sha, so a contribution exists exactly when
`…/packs/<id>/dashboard.json` — and its values file — appear in a listing already in
hand. No probe reads.

Descriptors and values files are content at a sha: read once when the default branch
moves, cached forever, **zero** requests while it has not. `latest-release` is one
ETag-revalidated read per repo — free on a 304 — shared across every pack that asks.
Cold, the worst case is two reads per contributing pack per member, only for packs that
actually carry the files.

Pack metrics are decoration in the budget policy's terms: priced by the planner and
skipped below `tight` — the same rung as the commit graphs — before anything core is. A
withheld read renders as withheld, never as a pack with nothing to say.

## Faults, absences and version skew

Every miss is one state, named: a missing values file, a missing key, an unreadable
repo, a withheld read and a malformed file are each rendered as what they are —
*not read is not zero* holds here as everywhere on the page.

Descriptor and values come from the member's own tree at the same sha, so a member on an
older pack version renders that version's contract, self-consistently — no coordination
between canon, member and deployment. Readers drop unknown keys; a descriptor carrying a
widget or source kind newer than the deployed page renders that widget as "this
dashboard predates the descriptor", never a guess.

## Alternatives

- **Pack render code, imported by the page** — executes member code in the viewer's
  browser with the viewer's token in scope, must be version-matched per member, and can
  fetch, making its cost invisible to the budget planner.
- **HTML fragments in the values file** — markup is code by another name (injection
  through the same door), and the fleet stops being one page the moment two packs style
  themselves.
- **One shared metrics file all packs write** — write contention between
  independently-adopted packs' tasks, and one format every pack must agree on; per-pack
  files keep pack independence.
- **Descriptor embedded in the values file** (self-describing, as the usage fold's
  `fields` header is) — one read and zero drift, but it cannot describe a live source
  (`latest-release` has no values file), and the descriptor belongs with the pack —
  versioned, reviewed, schema-checked — not inside a generated artifact.
- **Contributing through the usage fold** — couples every pack to `claudinite-growth`'s
  presence and format; a member without that pack could contribute nothing.
- **Free-form live sources** ("GET this endpoint") — unpriceable, unbounded, and points
  the viewer's token wherever a pack says.
