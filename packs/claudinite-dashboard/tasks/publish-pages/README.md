# publish-pages

Republishes the dashboard site to GitHub Pages when the page's sources have moved,
and does not report success until the deploy run it started has concluded.

The task runs no agent: `worker.mjs` builds the site with
[`build-site.mjs`](../../build-site.mjs), force-pushes the result as one commit to the
`gh-pages` branch, dispatches [the seeded workflow](../../stubs/workflows/claudinite-dashboard-pages.yml)
on the default branch, and follows that run to its end.

## Why the workflow still exists, and why it is four steps

A Pages deploy with source *GitHub Actions* needs two things only a workflow job has:
an Actions artifact, uploaded through a runtime credential that is handed to action
steps and not to `run:` steps, and an OIDC token minted for a job in this repo, which
the Pages deployment API requires. So there is no deploying that way from code-work,
and the workflow keeps exactly the steps that need it — checkout of `gh-pages`,
`configure-pages`, `upload-pages-artifact`, `deploy-pages` — and nothing that could
ever need to change. The build, its inputs, and the decision to run are all the task's;
`gh-pages` is how the built tree reaches the runner.

## What it needs

| Where | Name | What it is |
|---|---|---|
| `.github/workflows/` | `claudinite-dashboard-pages.yml` | the workflow adoption seeded; a `workflow_dispatch`-only shim |
| Repository setting | Pages, source *GitHub Actions* | the one step no Action can take. Until it is set the run parks at `needs-human-action` naming it |
| Repo **variable** | `CLAUDINITE_DASHBOARD_CLIENT_ID`, `CLAUDINITE_DASHBOARD_EXCHANGE_URL` | *optional*; the sign-in pair, read by the build |

No secret: the push, the dispatch and the follow use the Action's own token.

## When it runs

Daily, after the `claudinite-lifecycle/update` task, and only when the mount or the
member's declaration moved in the window. A change to either repository variable is
not a signal the queue sees — force a republish with `create-work-item --wake` on the
task's standing item.

## What a run does

1. Builds the site into a scratch directory. A build that refuses (no `mode`) fails
   here; a mount that does not carry the page yet ends the run with nothing to publish.
2. Writes `deployed.json` at the site root — the sources' sha — and force-pushes the
   tree as a single root commit to `gh-pages`. No history is kept: the branch holds
   the last build and nothing else.
3. Dispatches the workflow and finds the run it created.
4. Follows the run. `success` reports the run's URL; a failure with Pages not enabled
   parks for the person who can enable it; any other failure parks with the URL.
