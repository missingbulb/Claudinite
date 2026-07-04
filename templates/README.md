# Project-type templates

One file per **class of project** the owner runs. Each template is a
project-agnostic playbook — *how the owner wants this kind of project run* —
carrying the durable working procedures for that class and none of any one
project's subject matter. A project **links** the template that fits (single
source of truth stays here); it does **not** copy it.

Templates sit apart from the rest of the corpus: `always/`, `tasks/`, and
`technologies/` apply to work regardless of what the project *is*; a template
applies because of what the project *is* — its category.

## Catalog

| template | the class it's for |
|----------|--------------------|
| [research-project.md](research-project.md) | Run an algorithm over a set of similarly-formatted inputs, score it against user-provided ground truth, and improve it in repeatable, reviewable iterations (image-analysis / CV is the archetype). |

Add a row when you add a template.

## How a project picks a template — the two directions

### Forward — categorize at bootstrap (matching template exists)

When [bootstrap.md](../bootstrap.md) adopts Claudinite into a **fresh / empty**
project, it categorizes the project against this catalog (Part 5 there). If one
template fits:

- **Link it from the project's own `CLAUDE.md`** — a soft pointer plus a
  one-line category declaration, e.g.
  `> **Project type:** research-project — follows [.claudinite/templates/research-project.md](.claudinite/templates/research-project.md).`
  Link, don't inline: the template stays canonical here and every linked project
  tracks its improvements for free. (`@`-import it instead only if the project
  wants the whole playbook force-loaded every session.)
- The project then writes its **own** concrete specifics — its inputs, metrics,
  invariants, run commands — in its own docs, as the template instructs. The
  template stays generic; the project's docs hold the particulars.

### Reverse — no template fits

Every project still owes a **category declaration** in its `CLAUDE.md`, even
when nothing in the catalog matches: name the general class of work this project
is (one line). A project that can't name its category hasn't understood itself
yet — define it first.

A category with **no matching template is a signal to uplevel**: the
project-type-level working procedures for that class deserve a template so the
*next* project of that variety starts from it instead of re-deriving them. To
uplevel, distil the portable, subject-matter-free procedures for the class into
a new `templates/<class>.md` (mirror the research template's principle-first
shape), add a catalog row, and link it back from the project.

**When the uplevel runs (proposed — see issue #115 to confirm the trigger):**
the *gap* is detected at bootstrap (no catalog match → the project declares its
own category and the gap is flagged). Authoring the new template happens
**on demand** when the owner asks, or is **swept centrally** by the fleet
maintenance routine ([../routines/auto-all-repos-maintenance.md](../routines/auto-all-repos-maintenance.md)),
which already reads every vendored repo and can notice several projects sharing
an un-templated category and propose one. This mirrors the growth lifecycle's
extract → **promote** shape (a project-local pattern lifted into shared canon),
just at the granularity of a whole project *class* rather than a single lesson.
