import noWindowApiInServiceWorker from './service-worker-speech.mjs';

// The coded check validating this skill's action — wiring browser voice I/O;
// the skill's other two ride declared-checks.json beside this file, which the
// registry loads onto the same set. Discovered by engine/pack_loader/pack-registry.mjs and
// run at every Stop and in CI; each is inert until its narrow signature appears
// (an MV3 manifest naming a source service worker; a direct webkit-prefixed
// recognizer construction; a mic capture with no pagehide teardown anywhere).
// The failure messages carry the rules — there is deliberately no prose copy to
// drift from. The runtime/behavioural gotchas with no static signature stay
// prose in the web-speech pack's RULES.md.
export default [noWindowApiInServiceWorker];
