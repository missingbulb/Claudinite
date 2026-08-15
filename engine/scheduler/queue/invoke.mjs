// Agent invocation (tasks-dispatch DESIGN §12, §14.6). The executor starts the
// agent session with an API CALL rather than by arming a label event, which is
// what retires the re-arm, the grace window and the transport dance — and what
// makes a lost hand-off a synchronous, visible failure at the executor instead of
// a label event fired into the void.
//
// A TASK NAMES AN ENDPOINT, NEVER A URL. The declaration is vendored verbatim
// into every consuming repo, so it must never carry deployment detail or anything
// adjacent to a credential: `invocation_endpoint: 'fleet'` names a key, and the
// repo's own config maps that key to a URL and to the NAME of the repo Actions
// secret holding its token. That indirection is also what replaces the whole
// self/fleet apparatus — reach is a property of which endpoint you call, so a
// task needing wider access names a different endpoint and nothing else in the
// system needs a concept of scope.
//
// THE PROMPT NAMES ONE ITEM AND CARRIES NO INSTRUCTIONS. Everything
// behavior-defining is read by the session from the tracked task files at HEAD;
// the prompt says which issue and which nonce, and the session validates both in
// code before acting (DESIGN §7).

export const DEFAULT_ENDPOINT = 'default';

// The endpoint a task's hand-off calls, resolved against the repo's config.
// Returns `{ name, url, tokenEnv, body }` or `{ name, error }` — a task naming an
// endpoint the repo has not configured is a repo-configuration fact, reported
// where the operator reads it, never a crash.
export function resolveEndpoint(config, task) {
  const name = task?.decl?.invocation_endpoint ?? DEFAULT_ENDPOINT;
  const endpoints = config?.taskScheduler?.endpoints ?? {};
  const entry = endpoints[name];
  if (!entry) {
    return { name, error: `this repo's config declares no invocation endpoint "${name}" (taskScheduler.endpoints)` };
  }
  if (!entry.url) return { name, error: `invocation endpoint "${name}" declares no url` };
  if (!entry.tokenSecret) return { name, error: `invocation endpoint "${name}" declares no tokenSecret (the NAME of the repo Actions secret holding its token)` };
  return { name, url: entry.url, tokenEnv: entry.tokenSecret, body: entry.body ?? {} };
}

// The prompt the session is started with. Deliberately minimal: an invoked
// session is TOLD its item, so none of the slot mechanism's trigger-discovery
// dance survives — but the session still re-resolves the task path at HEAD and
// validates the item in code, because a prompt is trusted no more than a label
// event was.
export const invocationPrompt = ({ repo, item, nonce }) => [
  `Execute Claudinite work item #${item.number} in ${repo}.`,
  '',
  `Invocation nonce: ${nonce}`,
  '',
  'Read that issue, validate it in code (its first body line is the task path — confirm the file exists at HEAD and the pack is declared), post your agent claim comment carrying the nonce above, and stop without touching the item if an earlier agent claim already exists.',
  'Then run the task file at its declared model, honour the item\'s Context as binding scope, verify your outcome against the task\'s declared ceiling, and converge the item to exactly one terminal state with one comment saying what happened.',
].join('\n');

// The invoker seam the executor calls. Failure is DATA (`{ ok: false, error }`),
// never a throw: the caller's retry/revert path is what turns a platform outage
// into delay rather than a queue converged to triage.
export function agentInvoker({ repo, config, env = process.env, fetchImpl = fetch, attempts = 2, timeoutMs = 60e3 }) {
  return async function invoke({ task, item, nonce }) {
    const endpoint = resolveEndpoint(config, task);
    if (endpoint.error) return { ok: false, error: endpoint.error };
    const token = env[endpoint.tokenEnv];
    if (!token) {
      // The `required_secrets` posture, applied to the endpoint token: nothing
      // fails silently, the task just doesn't work yet, and the item names which
      // secret to set (DESIGN §14.7).
      return { ok: false, error: `the Actions secret \`${endpoint.tokenEnv}\` for invocation endpoint "${endpoint.name}" is not set in this repo` };
    }

    const payload = {
      ...endpoint.body,
      prompt: invocationPrompt({ repo, item, nonce }),
      // Standing entry 11: if the session-creation API honours an idempotency key,
      // this collapses a timeout-retry duplicate at creation and leaves the
      // agent-side lease as a backstop rather than the mechanism. An endpoint that
      // ignores the field loses nothing — the lease still collapses the pair.
      idempotency_key: nonce,
    };

    let lastError = 'unknown error';
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        const res = await fetchImpl(endpoint.url, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${token}`,
            'user-agent': 'claudinite-executor',
          },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(timeoutMs),
        });
        let json = null;
        try { json = await res.json(); } catch { json = null; }
        if (res.status >= 200 && res.status < 300) {
          return { ok: true, sessionId: json?.id ?? json?.session_id ?? null };
        }
        lastError = `endpoint "${endpoint.name}" returned ${res.status}${json?.error ? `: ${JSON.stringify(json.error)}` : ''}`;
        // A 4xx is a decision, not a blip — retrying it buys nothing and doubles
        // the chance that a call which DID create a session creates a second.
        if (res.status < 500) break;
      } catch (e) {
        // A client-side timeout is the at-least-once case: the call may still have
        // created a session, which is exactly why the agent-side lease exists.
        lastError = `endpoint "${endpoint.name}" call failed: ${e.message}`;
      }
    }
    return { ok: false, error: lastError };
  };
}
