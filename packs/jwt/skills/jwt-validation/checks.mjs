import noneNotAccepted from './none-not-accepted.mjs';
import verifyPinsAlgorithms from './verify-pins-algorithms.mjs';
import verifyBindsAudience from './verify-binds-audience.mjs';

// The check-the-world rules validating this skill's action — wiring JWT
// verification. Discovered by engine/pack_loader/pack-registry.mjs onto the jwt
// pack and run when it is active; each is inert until a JWT verification
// artifact exists (its RELEVANCE FIRST gate). The failure messages carry the
// rules — there is deliberately no prose copy to drift from.
export default [noneNotAccepted, verifyPinsAlgorithms, verifyBindsAudience];
