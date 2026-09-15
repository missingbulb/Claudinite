// The two repository variables a deployment's sign-in is configured in.
//
// Here, in browser-safe code, because BOTH SIDES of the configuration name them and
// neither may guess: the build reads them to bake the pair into the page's config
// (`tooling/deployment-config.mjs`, which re-exports this), and the gate names them
// on the screen a viewer meets when they are unset — which is the one screen where
// the person who can fix it is being told what to set. A second spelling on the page
// would send an owner to set a variable the build does not read.
//
// Namespaced, because a variable's name is repo-global and this pack does not own the
// word `CLIENT_ID`. Keyed by the config name each one falls back to.
export const SIGN_IN_VARS = {
  clientId: 'CLAUDINITE_DASHBOARD_CLIENT_ID',
  exchangeUrl: 'CLAUDINITE_DASHBOARD_EXCHANGE_URL',
};
