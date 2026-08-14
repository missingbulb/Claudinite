import clientIdSingleOrigin from './client-id-single-origin.mjs';

// The coded rule validating this skill's action — wiring server-side validation
// of Google Sign-In ID tokens; the skill's other two ride declared-checks.json
// beside this file, which the registry loads onto the same set. Discovered by
// engine/pack_loader/pack-registry.mjs and run at every Stop and in CI; each is inert until a
// Google-validator artifact exists (its RELEVANCE FIRST gate). The failure
// messages carry the rules — there is deliberately no prose copy to drift from.
export default [clientIdSingleOrigin];
