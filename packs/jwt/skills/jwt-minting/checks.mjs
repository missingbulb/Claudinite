import hardcodedSecret from './hardcoded-secret.mjs';
import signSetsExpiry from './sign-sets-expiry.mjs';

// The check-the-world rules validating this skill's action — minting JWTs.
// Discovered by engine/pack_loader/pack-registry.mjs onto the jwt pack and run
// when it is active; each is inert until a token-minting artifact exists (its
// RELEVANCE FIRST gate). The failure messages carry the rules — there is
// deliberately no prose copy to drift from.
export default [hardcodedSecret, signSetsExpiry];
