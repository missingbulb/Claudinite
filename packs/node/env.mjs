// The node pack's environment requirement — code, not manifest data, because both
// fragments are functions of the project's own config.
//
// The Node runtime ships in the base image, but a repo's modules don't (they are
// devDependencies, usually uncommitted), so `npm test` or a build would trigger a
// confusing mid-session install. Installing at environment-image build instead
// puts them in the snapshot every session reuses.
//
// WHERE the package.json is varies per repo — a root project, a monorepo's
// `functions/` and `server/` — so it is a per-project parameter: set `dirs` in the
// node pack entry's `config` in `.claudinite-checks.json` (default: the repo
// root). That parameter is exactly why this is `env.mjs` and not an inline `env`
// block in pack.json: an inline block is fixed shell, and this shell is derived
// from the config.
//
// A cloud setup script starts in the checkout's PARENT; the engine's env runner
// (engine/pack_loader/env-requirements.mjs) executes the fragment FROM the
// checkout, so each `cd "$d"` below is relative to it.
const dirs = (params) => (params.dirs?.length ? params.dirs : ['.']);

export default {
  label: 'Node dependencies (npm ci)',
  setup: (params) => dirs(params).map((d) => `( cd "${d}" && npm ci ) || true`).join('\n'),
  probe: (params) => dirs(params).map((d) => `[ -d "${d}/node_modules" ]`).join(' && '),
};
