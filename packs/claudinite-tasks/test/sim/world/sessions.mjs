// THE FAKE AGENT INVOCATION — the routine fire, with the trichotomy the whole
// hand-off design turns on.
//
// It stands in for `src/world/sessions.mjs`: `port` carries exactly that
// module's names, and the scenario levers hang off the harness beside it.
//
// ONLY `agentInvoker` IS FAKED, because only `agentInvoker` reaches outside.
// `resolveEndpoint` and `firePayload` are config reading and prose composition —
// no world edge at all — and the two constants are ours, so all four come
// straight from the real port. A fake that re-spelled them would be a second
// implementation of something nobody needed faked, and would go on agreeing with
// itself after the real one changed.
//
// THE THREE OUTCOMES ARE NOT THREE DEGREES OF THE SAME THING:
//
//   fired       a session exists, and this module starts it on the clock
//   refused     the endpoint ANSWERED and said no — no session, ever
//   unanswered  nothing came back. A session may or may not have started, and
//               `started` is the fake's private truth about which — the thing
//               the executor cannot see and must never guess at.

import {
  DEFAULT_ENDPOINT, DEFAULT_HEADERS, firePayload, resolveEndpoint,
} from '../../../src/world/sessions.mjs';

export function makeSessions({ clock, agents = null, repo = 'o/r' } = {}) {
  const fired = [];
  // Scripted answers, consumed one per invocation; an empty script fires.
  const pending = [];
  let seq = 0;

  const port = {
    DEFAULT_ENDPOINT,
    DEFAULT_HEADERS,
    resolveEndpoint,
    firePayload,
    agentInvoker: ({ repo: slug = repo, config } = {}) => async function invoke({ task, item, nonce }) {
      // The configuration faults are the real port's own, decided before any
      // call, so they are read from the real resolver rather than scripted here.
      const endpoint = resolveEndpoint(config, task);
      if (endpoint.error) return { ok: false, answered: true, error: endpoint.error };

      const scripted = pending.shift() ?? { kind: 'fire' };
      const record = {
        at: clock.ms(), repo: slug, item: item.number, nonce, task: task?.id ?? null,
        text: firePayload({ repo: slug, item, nonce }), kind: scripted.kind,
      };
      fired.push(record);

      if (scripted.kind === 'refuse') {
        return { ok: false, answered: true, error: scripted.error ?? `endpoint "${endpoint.name}" returned 401` };
      }
      if (scripted.kind === 'unanswered') {
        // The far side may have taken it. When it did, the session runs — which
        // is exactly the world the executor cannot distinguish.
        if (scripted.started && agents) agents.start({ task, item, nonce });
        return { ok: false, answered: false, error: scripted.error ?? `endpoint "${endpoint.name}" gave no answer: socket timeout` };
      }
      const sessionId = `s-${(seq += 1)}`;
      record.sessionId = sessionId;
      if (agents) agents.start({ task, item, nonce, sessionId });
      return { ok: true, sessionId, sessionUrl: `https://claude.ai/code/${sessionId}` };
    },
  };

  const harness = {
    port,
    fired: () => fired,
    // The endpoint answers with an error status: no session exists, and no
    // retry can change that.
    refuseNext: (error = null) => { pending.push({ kind: 'refuse', error }); return harness; },
    // Nothing comes back. `started` is whether the far side took it anyway.
    leaveNextUnanswered: ({ started = false, error = null } = {}) => {
      pending.push({ kind: 'unanswered', started, error });
      return harness;
    },
  };
  return harness;
}
