# Prompt: generate the default working-instructions for this project

Paste this into a session inside any repository. It asks the session to work out
what kind of project it is in and produce the working-procedures document that
fits that kind of project.

---

You are working inside an existing software project. Your task is to produce a
single document that defines the **default working instructions for THIS
project** — how to set it up, change it, verify changes, and ship them — so that
a new contributor or a fresh session can be productive without reverse-engineering
the whole repo.

The core of the task is this: **first work out what category of project you are
in, then generate the instruction set that a project of that category should
have.** Do not assume a shape. A throwaway personal script, a maintained
community library, and a production service each deserve a materially different
document; the right one falls out of the category once you've identified it.

## Step 1 — Investigate (ground everything in evidence, invent nothing)

Read the actual project before writing a word. Look at, as they exist:
- README, existing docs, CONTRIBUTING / AGENTS.md / CLAUDE.md, ADRs, wiki.
- Dependency + build manifests (package.json, pyproject/requirements, go.mod,
  Cargo.toml, pom.xml, Makefile, Dockerfile, etc.) and lockfiles.
- Scripts and entry points (bin/, cmd/, scripts/, npm/make targets) — how it is
  actually built, run, and tested.
- CI/CD config (.github/workflows, .gitlab-ci, etc.), lint/format/type configs,
  pre-commit hooks, release config.
- Test layout and coverage conventions; environment/config files (.env.example),
  secrets handling.
- Git history (commit message style, branch naming, tag/release cadence) and, if
  accessible, open/recent PRs and issues (review norms, labels, templates).
- Any conversation the user has had with you about how they want to work.

Prefer reproducing the project's real conventions over imposing best-practice
defaults. When you state a command or rule, it must be one you verified from the
repo, not a guess. If something important is genuinely undetermined and the
answer changes the document, ask the user one focused question; otherwise pick
the sensible default and note it.

## Step 2 — Determine the project category (answer each from evidence)

Place this project on each axis below, briefly, from what you found. Together
these define the category, and the category drives which sections you include and
what they say:

- Technology stack & ecosystem conventions (language(s), framework, package
  manager, idioms the code already follows).
- Maturity / production-worthiness: throwaway or prototype vs. internal tool vs.
  production-grade with users depending on it. This sets the bar for testing,
  error handling, observability, and review rigor.
- Client vs. server vs. both (and where the trust boundary sits).
- Shape of the artifact: one-shot tool / CLI / batch job vs. long-running
  process / service / daemon (their lifecycle, config, health, shutdown, and
  resource concerns differ).
- Library vs. application; single package vs. monorepo.
- UI-centrality: heavily UI/UX-design-driven vs. UI-agnostic / headless (drives
  whether you cover a design system, accessibility, visual review, and how to
  *see* a change).
- Audience & longevity: a one-time personal utility vs. something used
  repeatedly / maintained for a community / published (drives versioning, API
  stability, changelog, docs, backward compatibility, contribution flow).
- Openness: open-source public vs. internal / proprietary (licensing, secret
  hygiene, what may be pushed).
- Team & collaboration: solo vs. team; review requirements; sync vs. async.
- Maturity of the codebase: greenfield vs. legacy with constraints.
- Domain constraints if any: performance-critical, security-sensitive,
  regulated/compliance, data/privacy.

These are the axes; a project's **category** is a recognizable bundle of them.
The gallery below is to calibrate the *granularity* of that call — name the
category at roughly this altitude. It is **not exhaustive**, categories
**compose** (a repo can be several at once), and if none fit, **coin your own**.
Treat a label as shorthand for its axis-values, not a substitute for reasoning
through them.

- **Client / UI-heavy:** client-only browser extension · cross-platform mobile
  app · native mobile app · static marketing/docs site · single-page web app ·
  browser/canvas game · desktop GUI app (Electron/Tauri)
- **Server / backend / infra:** stateless REST/GraphQL API · long-running worker
  / queue consumer · realtime (WebSocket/streaming) service · serverless
  functions · scheduled batch job / ETL · infrastructure-as-code repo
- **Libraries / tools:** published open-source library / SDK · internal shared
  library · standalone CLI tool · one-off personal script · editor/build plugin
- **Data / ML / specialized:** analysis notebook repo · ML training +
  model-serving · monorepo spanning several of the above
- **Cutting across all of these** (often the bigger driver than tech): prototype
  vs. production-with-SLAs · public OSS vs. internal/proprietary · solo vs. team
  · greenfield vs. legacy · regulated/security-sensitive · embedded/firmware

Write down your read of the category before drafting — it is the decision that
everything downstream depends on.

## Step 3 — Decide the document's shape from the category

Include the sections a project of this category actually needs; omit the ones
that don't apply and say nothing performative. A one-off script should get a
short, punchy doc (setup, run, the one gotcha). A community production service
should get the full set. Scale the document to the project.

## Step 4 — Write the default instruction set

Cover the universal core, then add the conditional sections the category calls
for.

Universal core (almost always):
- **What this project is** and its boundaries (one short paragraph).
- **Set up from a clean clone**: exact install/build steps, required
  runtime/tooling versions, environment/config, and any non-obvious prerequisite
  the environment may lack.
- **Run it / see it work**: the exact commands to run, and how to observe a
  change actually working (not just that it compiles).
- **Verify a change**: how to run tests/lint/typecheck/format; what "green" means
  here; the project's real bar for adding or updating tests.
- **Make & propose a change**: branch naming, commit message style, PR/review
  conventions, and the project's **definition of done**.
- **Match the existing conventions**: code style, structure, and idioms a change
  must follow to look native to this codebase.
- **Continuity / handoff**: what to commit/push, and what a new contributor or
  fresh session needs to resume without re-deriving the project.

Conditional sections — include only those the category triggers, e.g.:
- Production-grade → error handling, logging/metrics/observability, config &
  secrets, rollback/deploy, on-call/runbook pointers, backward compatibility.
- Server / long-running → lifecycle, health checks, graceful shutdown, resource &
  concurrency limits, migrations, environments (dev/staging/prod).
- Client / UI-centric → how to view UI changes, design-system/tokens, responsive
  and theme handling, accessibility, and visual/manual review expectations.
- CLI / one-shot tool → argument/UX conventions, exit codes, idempotency, safe
  handling of destructive actions.
- Library / community package → public API surface & stability, semver &
  changelog, docs/examples, deprecation policy, contribution & release flow.
- Security / regulated / performance-sensitive → the specific guardrails and how
  they're enforced/measured.
- Monorepo → package boundaries, cross-package changes, shared tooling.

## Constraints

- Be concrete and copy-pasteable: real commands, real paths, real file names.
- Match the project's existing voice and conventions; don't impose a foreign
  process.
- No boilerplate for its own sake — every line should help someone act.
- Keep it maintainable: state where deeper detail lives rather than duplicating
  it, and note anything you were unsure about so it can be corrected.
- **Treat later "do it a different way" corrections as standing preferences.**
  When the user changes how something should be done, fold it back into this
  document (or a doc linked from it) so the next session inherits it, rather than
  applying it only once.

## Output

Write the document to a sensible home for this repo — merge into an existing
CONTRIBUTING.md / AGENTS.md / CLAUDE.md / docs guide if one exists, otherwise
create one (propose the path). Before finalizing, give me a short summary of the
category you settled on (Step 2) and which conditional sections you included or
skipped and why.
