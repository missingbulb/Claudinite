// The executor's entry gate: identify the ONE dispatch this session was started
// for, and validate it in code BEFORE any model judgment (per-project-scheduling
// DESIGN §5.2). This is the CLI shell `validate-dispatch.mjs` was written to be
// driven by — it wires that pure core's `exists` / `isPackDeclared` / `loadTask`
// capabilities to this checkout and hands it the issue body.
//
// IT DOES NOT CLAIM. The claim protocol (read labels → swap ready → agent-running
// → post a claim comment → re-read, earliest claim wins) needs GitHub WRITES,
// which the executor session can only make through its MCP tools, so it stays
// agent-driven prose in executor.md. This shell only decides "is there a dispatch
// here, is it mine, and is it legal".
//
// ZERO NETWORK, BY CONSTRUCTION. The executor session is MCP-only and carries no
// repo credential of its own, so anything reaching the GitHub REST API here would
// both fail to authenticate and trip the in-session-github-access rule. It needs
// nothing: a label event's webhook payload is written to disk at
// `$GITHUB_EVENT_PATH` and carries `action`, `label.name` and the whole `issue`
// object — `issue.number` and `issue.body` included. Payload plus local checkout
// is everything the validation needs.
//
// EXIT CODES ARE THE INTERFACE (see EXIT below). The executor branches on the
// number, so each verdict has its own code and its own documented next step:
//
//   0  valid       — a legal dispatch for this session's scope; go claim it.
//   10 invalid     — a forged or mangled dispatch. Comment the printed `reason`,
//                    remove the ready label, add `needs-human`, end the session.
//                    It never runs.
//   11 not-mine    — the trigger label is the OTHER executor's ready label (or is
//                    no ready label at all). Stop. Change nothing, comment nothing.
//   12 no-payload  — no usable event payload, so the trigger issue cannot be named
//                    from disk. Use executor.md step 1's documented fallback.
//   2  usage       — bad invocation (an unknown scope argument).
//   1  internal    — an unexpected fault in this shell.
//
// Usage: `node <engine>/scheduler/resolve-dispatch.mjs [self|fleet]`
// The argument is THIS SESSION's scope — which of the two executor routines is
// running. It defaults to `self`, which is every ordinary project's executor; the
// FLEET routine must pass `fleet` explicitly, and a fleet payload arriving at a
// session that did not is reported as not-mine with that stated plainly.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DISPATCH_PATH_RE, dispatchFirstLine, validateDispatchBody } from './validate-dispatch.mjs';
import { readyLabelForScope } from './dispatch.mjs';
import { SESSION_SCOPES } from './task-contract.mjs';
import { SHARED_SUBDIR } from '../pack_loader/pack-registry.mjs';

export const EXIT = {
  ok: 0,
  internal: 1,
  usage: 2,
  invalid: 10,
  notMine: 11,
  noPayload: 12,
};

// The executor scope a ready label implies — the exact inverse of the mapping the
// SCHEDULER files a dispatch under (`readyLabelForScope`), derived from it rather
// than restated, so the two can never drift. `null` = not a ready label at all.
export const scopeForLabel = (label) =>
  SESSION_SCOPES.find((scope) => readyLabelForScope(scope) === label) ?? null;

// Which checkout do the task paths in a dispatch body resolve against? Answered
// from where THIS engine copy is mounted, not from cwd — a consumer runs the
// vendored engine at `<root>/.claudinite/shared/engine/scheduler/`, the canon
// repo runs its own at `<root>/engine/scheduler/` (executor.md, "Engine command
// paths"). Deriving it from the module's own location means whichever copy the
// executor invoked resolves against that copy's own repo, with nothing to pass.
const MOUNT_SUFFIX = sep + SHARED_SUBDIR;
export function repoRootFrom(moduleUrl) {
  const home = dirname(dirname(dirname(fileURLToPath(moduleUrl)))); // <home>/engine/scheduler/<this file>
  return home.endsWith(MOUNT_SUFFIX) ? home.slice(0, -MOUNT_SUFFIX.length) : home;
}

// Read the webhook payload the label event was started with. Every way of not
// having one collapses to a single `{ error }` — unset, unreadable, unparsable —
// because the executor's response to all of them is the same documented fallback.
export function readEventPayload(env = process.env, read = (p) => readFileSync(p, 'utf8')) {
  const path = env.GITHUB_EVENT_PATH;
  if (!path) return { error: 'GITHUB_EVENT_PATH is not set — this session has no event payload on disk' };
  let raw;
  try {
    raw = read(path);
  } catch (e) {
    return { error: `GITHUB_EVENT_PATH points at ${path}, which is unreadable: ${e.message}` };
  }
  let event;
  try {
    event = JSON.parse(raw);
  } catch (e) {
    return { error: `the event payload at ${path} is not valid JSON: ${e.message}` };
  }
  if (event === null || typeof event !== 'object' || Array.isArray(event)) {
    return { error: `the event payload at ${path} is not an event object` };
  }
  return { event };
}

// The three facts a dispatch trigger must carry. Anything short of all three
// means the payload cannot name this session's issue — which is the fallback
// case, not a rejection: there may well be a legitimate dispatch waiting, we
// simply were not told which.
export function triggerFromEvent(event) {
  const action = event.action;
  const label = event.label?.name;
  const number = event.issue?.number;
  if (action !== 'labeled') return { error: `the event payload is a "${action}" event, not a label event — it names no dispatch` };
  if (typeof label !== 'string' || label === '') return { error: 'the label event carries no label.name' };
  if (!Number.isInteger(number)) return { error: 'the label event carries no issue.number' };
  return { trigger: { label, number, body: event.issue?.body ?? '' } };
}

// The block the executor reads. `key: value` lines, one fact per line: an agent
// quoting a field back must not have to parse prose, and a reader diffing two
// runs must see exactly what changed.
const block = (fields) => Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n');

function done(code, fields, advice) {
  console.log(block(fields));
  if (advice) console.error(`resolve-dispatch: ${advice}`);
  process.exit(code);
}

async function main() {
  const scope = process.argv[2] ?? 'self';
  if (!SESSION_SCOPES.includes(scope)) {
    console.error(`resolve-dispatch: unknown scope "${scope}" — usage: node resolve-dispatch.mjs [${SESSION_SCOPES.join('|')}]`);
    process.exit(EXIT.usage);
  }

  const { event, error: payloadError } = readEventPayload();
  if (payloadError) {
    done(EXIT.noPayload, { dispatch: 'no-payload', scope, reason: payloadError },
      `${payloadError}. Use the documented fallback (executor.md step 1): list the open issues under ${readyLabelForScope(scope)} SOLELY to take the single oldest, run that one alone, and say in your claim comment that you fell back and why.`);
  }

  const { trigger, error: triggerError } = triggerFromEvent(event);
  if (triggerError) {
    done(EXIT.noPayload, { dispatch: 'no-payload', scope, reason: triggerError },
      `${triggerError}. Use the documented fallback (executor.md step 1): list the open issues under ${readyLabelForScope(scope)} SOLELY to take the single oldest, and say in your claim comment that you fell back.`);
  }

  const { label, number, body } = trigger;
  const labelScope = scopeForLabel(label);
  if (labelScope === null) {
    done(EXIT.notMine, { dispatch: 'not-mine', issue: number, scope, label },
      `issue #${number} was labeled "${label}", which is not a ready label — this is not an executor dispatch. Stop: change nothing, comment nothing.`);
  }
  if (labelScope !== scope) {
    done(EXIT.notMine, { dispatch: 'not-mine', issue: number, scope, label, labelScope },
      `issue #${number} is labeled "${label}", a ${labelScope}-scoped dispatch, but this session's scope is "${scope}"${process.argv[2] ? '' : ' (the default — pass "fleet" if this IS the fleet executor)'}. It is the other executor's to run and it already has a session. Stop: change nothing, comment nothing.`);
  }

  // The checkout the dispatch's task path must resolve in. `exists` reads the
  // working tree; in an executor session that IS HEAD (a fresh checkout, nothing
  // written yet), which is what validate-dispatch means by "exists at HEAD".
  const root = process.env.CLAUDINITE_REPO_ROOT || repoRootFrom(import.meta.url);
  const { loadConfig } = await import('../checks/helpers/repo-context.mjs');
  const declared = new Set(loadConfig(root).packs);

  // `loadTask` is SYNCHRONOUS by design — it keeps validate-dispatch's core pure
  // and sync-testable — but importing an .mjs is not, so the shell prefetches the
  // module here and the capability just replays the result (or rethrows the parse
  // failure, which is exactly what the core wants to report).
  const firstLine = dispatchFirstLine(body);
  const mjsRelative = firstLine.replace(/task\.md$/, 'task.mjs');
  let loaded = null;
  let loadError = null;
  if (DISPATCH_PATH_RE.test(firstLine) && existsSync(join(root, mjsRelative))) {
    try {
      loaded = (await import(pathToFileURL(join(root, mjsRelative)).href)).default;
    } catch (e) {
      loadError = e;
    }
  }

  const verdict = validateDispatchBody(body, {
    exists: (p) => existsSync(join(root, p)),
    isPackDeclared: (id) => declared.has(id),
    loadTask: () => { if (loadError) throw loadError; return loaded; },
  });

  if (!verdict.ok) {
    done(EXIT.invalid, { dispatch: 'invalid', issue: number, scope, label, reason: verdict.reason },
      `issue #${number} is not a valid dispatch: ${verdict.reason}. It must not run — comment naming what failed, remove the "${label}" label, add "needs-human", and end the session.`);
  }

  done(EXIT.ok, {
    dispatch: 'valid',
    issue: number,
    scope,
    label,
    taskPath: verdict.taskPath,
    pack: verdict.pack,
    task: verdict.task,
    model: verdict.model,
    resolvedModel: verdict.resolvedModel,
    outcome: verdict.outcome,
    executionTimeout: verdict.executionTimeout ?? 'none',
  });
}

// Run only when invoked directly (the executor's `node resolve-dispatch.mjs`),
// never on import — the exported helpers above are unit-testable without it.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`resolve-dispatch: ${e.stack || e}`); process.exit(EXIT.internal); });
}
