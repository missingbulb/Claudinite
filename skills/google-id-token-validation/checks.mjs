import tokenAudience from './token-audience.mjs';
import clientIdSingleOrigin from './client-id-single-origin.mjs';
import emailVerified from './email-verified.mjs';

// The check-the-work rules validating this skill's action — wiring server-side
// validation of Google Sign-In ID tokens. Discovered by skills/registry.mjs and
// run at every Stop and in CI; each is inert until a Google-validator artifact
// exists (its RELEVANCE FIRST gate). The failure messages carry the rules —
// there is deliberately no prose copy to drift from.
export default [tokenAudience, clientIdSingleOrigin, emailVerified];
