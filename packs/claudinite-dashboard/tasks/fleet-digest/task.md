# fleet-digest worker (agent stage)

Write this fleet's **morning brief** for one day: the few things the owner actually
accomplished, and one project worth returning to.

Code-work has already done everything that is not judgment. It enumerated the fleet,
found every pull request merged and every issue closed during the day, dropped the
Claudinite maintenance PRs, ranked what was left **by size of change**, and pushed the
top slice to a data branch. You are here for the one thing it could not do: **read
those candidates and decide which were the real accomplishments.**

Your whole job is four short paragraphs' worth of reading and one file. It should take
minutes.

## The hard rules

These are the owner's, verbatim in intent, and they are not negotiable:

- **Read the text. Change nothing else.** Never edit code, never run tests, never run a
  build, never touch any repo but this one. You are writing a summary, not doing work.
- **Do not load context you were not given.** Do not read `CLAUDE.md`, pack prose,
  requirements documents, or a project's source to "understand" an item better. The
  candidate's own title, body and discussion are what you have, and they are enough. An
  item you cannot summarize from its own text is an item that ranks below one you can.
- **Do not widen past the shortlist.** The item's Context is binding scope.
  Never enumerate the fleet, never search for items code-work did not hand you, and never
  substitute an item you happen to know about.
- **Be very succinct.** Hard ceiling of **20 words per item**. Shorter is better. No
  preamble, no throat-clearing, no "this PR appears to".

## 1. Read the shortlist

The item's **`### Delivered by code-work`** section names a branch. Read
`shortlist.json` from it — over your GitHub tools, at that ref.

**That branch is a required input.** A work item that names none — or names one whose `shortlist.json` is not there — is a failed run: converge to `needs-human` naming what was missing.
Never fall back to the newest branch, to a shortlist from an earlier run, or to enumerating the
fleet yourself — the whole point of the shortlist is that code-work decided which candidates this
brief covers.

> **It will not come back inline, and what does come back is not yet JSON.** The shortlist
> carries every candidate's body text, so it runs tens of KB and overflows the file-read
> tool's result limit; the tool spills it to a file and hands you the path instead. That
> file's **first line is a `[Resource from github at repo://…]` banner**, so parsing it
> straight off fails on the banner, not on anything wrong with the shortlist. Strip the
> banner, then parse. Expect this every run — it is the size of the payload, not a fault.

It carries `pick` — **how many items to choose per brief**, configured; do not
substitute your own number — and `days`, an array. **Write one brief per entry**, each
one landing at `digests/<that entry's date>.md`.

`days` usually holds a single day. A catch-up run hands you several; nothing about the
job changes, you just do it more than once. Judge each day **on its own** — a quiet
Tuesday's best item is that Tuesday's, not a runner-up borrowed from a busy Monday.

Each entry carries:

| field | what it is |
|---|---|
| `date` | the UTC day this brief is about — the file is named for it |
| `shortlist` | the candidates, ranked by size, each with repo, number, title, url, size and body text |
| `nudge` | the quiet project to prod about, already chosen — or `null` when the nudge is off or every member is active |
| `considered`, `maintenance`, `capped` | what the ranking drew on; context for you, not content for the brief |

## 2. Choose `pick` of them

The shortlist is longer than `pick` **on purpose** — size got you a strong field, and
choosing within it is the judgment you are here for. Rank by what the owner would call
an accomplishment, in this order:

1. **A new project or a first working version of something** — the largest kind of
   progress there is.
2. **The biggest improvement to something that already existed** — a capability that
   was not there yesterday.
3. **The most complex work** — the thing that was hard, whether or not it was large.

Prefer variety across projects when the choice is close: four items from one repo tells
the owner less about their day than four from three. Never pad — if only two items were
genuinely substantial, write two and say so. A short honest brief beats a padded one.

Size got them onto the shortlist; it does not decide the order you write them in.
Lead with the most significant.

## 3. Write `digests/<date>.md`

**The brief is plain text, not markdown.** The file has a `.md` name and it is still
plain text, because it is not read here — an ad-hoc session sends it verbatim as a
notification, through a renderer that parses no markdown and keeps no line breaks. A `#`,
a `-`, a `**bold**`, a backtick and a `[#750](url)` all arrive as those literal
characters, in one running paragraph. So: no headings, no markdown bullets, no bold, no
backticks, no link syntax. A `• ` opens each item, because it stays a visible separator
once the newlines collapse, and each URL goes in bare, because the renderer autolinks it.
A check enforces this over the landed series (`digest-plain-text`).

Exactly this shape, and nothing beyond it:

```text
Fleet operations — 2026-08-08

Yesterday's biggest work:

• TicketWatch — #289 Ticket refresh now recovers from partial API failures. https://github.com/an-owner/TicketWatch/pull/289

• LaughCounter — #147 New release pipeline; version bumps are one command. https://github.com/an-owner/LaughCounter/pull/147

Worth returning to:

• an-owner/CrosswordChat — last meaningful change 2026-07-29: #157 Store release automation. https://github.com/an-owner/CrosswordChat/pull/157

Three weeks quiet. The store release landed but nothing has used it since — worth a look.
```

- One item per chosen candidate: `• `, the repo name, ` — `, the number, then the
  accomplishment in **≤20 words**, then the URL. Say what it *does* now, not what the
  diff touched.
- The **Worth returning to** section: reproduce `nudge.repo` and its `nudge.last` exactly
  as given — those are facts, do not re-derive or re-word them — except that a title
  carrying backticks or asterisks is flattened (backticks become double quotes), then add
  **one sentence** suggesting the owner return to it. If `nudge` is `null`, omit the
  section entirely.
- Nothing else. No statistics table, no methodology note, no list of what you rejected.
  The run summary already carries all of that.

## 4. Land it

Follow the shared procedure — [deliver-pr.md](../../../../engine/scheduler/deliver-pr.md) — on a
branch of your own. **One pull request for the whole run**, however many days you wrote:
`digests/<date>.md` per day, added, nothing else touched. The task's ceiling is
`merged-pr`; this repo's `maintenance.delivery` decides whether it lands unreviewed, and
that procedure reads it.

**Do not touch the shortlist branch.** It is code-work's, it is force-pushed nightly, and
nothing downstream reads it after you.

**The landed file is the whole deliverable.** An ad-hoc session reads it out verbatim
later in the day — nothing downstream edits or re-summarizes your prose — so the file
has to read as the finished brief, not as notes for one.

## If a file already exists

`digests/<date>.md` on the default branch means that day's brief has already been
written — a re-dispatch, or a run that landed and was re-armed. **Do not rewrite it:**
the brief is the record of a day, and a day has one. Code-work filters those days out
before the shortlist reaches you, so a written day is not a decision you are being asked
to make — it is an entry whose work is already done, and its outcome is empty. Write the
entries that are not, and name the already-written ones when you close the run out. A run
where every entry is already written is a complete run with an empty result: open
nothing, and say that on the item.
