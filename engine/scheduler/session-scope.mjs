// Which executor session a task's dispatch goes to — and whose decision that is.
//
// Two executor routines exist: the ordinary one, whose session holds this repo
// alone, and a broader one whose session holds the owner's repos. Keeping the
// fleet-wide grant off every project's executor is the whole point of the split, so
// something has to say which a dispatch belongs to.
//
// IT IS THE PACK'S DECISION, NOT THE TASK'S (owner ruling, 2026-08-09). A pack whose
// entire purpose is reaching other repos gives every task it contributes that reach —
// the task does not opt into it, and a task author asked to choose can only get it
// wrong in one of two ways: forget it, and the task runs in a session that cannot see
// what it was written to read (silently, forever — the executor declines the dispatch
// and the scheduler re-arms it hourly); declare it where it was not warranted, and an
// ordinary project's dispatch carries a fleet-wide grant it never needed. Declaring it
// once, on the pack, makes it a property of the reach rather than a per-task
// checkbox — and there is exactly one place to look to find out which packs have it.
//
// The task-level `session_scope` field is DEPRECATED and still honoured. It is the
// older spelling of the same fact, it still routes correctly, and nothing that
// declares it breaks; it is simply no longer where the decision belongs. The
// `deprecated-session-scope` conformance check (basics) is the migration pressure.

// The vocabulary itself lives with the manifest spec, because a pack's `sessionScope`
// is where the scope is declared; re-exported here so the scheduler side has one
// import for the whole concept. (The direction matters: scheduler imports pack_loader,
// never the reverse — the loader's fixtures build a canon tree without a scheduler.)
import { SESSION_SCOPES } from '../pack_loader/pack-schema.mjs';

export { SESSION_SCOPES };
export const DEFAULT_SESSION_SCOPE = 'self';

export const isSessionScope = (v) => SESSION_SCOPES.includes(v);

// Resolve the scope for one task, and say WHERE the answer came from — callers
// report the deprecated path rather than silently accepting it.
//
//   { scope, source }  source: 'pack' | 'task (deprecated)' | 'default'
//
// The pack wins when it declares `fleet`. That is not an arbitrary precedence: a pack
// declaring fleet reach is asserting something about every task it contributes, and a
// task inside it cannot be less-reaching than the executor it is filed to — `self` on
// such a task would be a narrowing the routing cannot express anyway. A pack that
// declares nothing (or `self`) leaves the answer to the deprecated task field, which
// is exactly the compatibility path.
export function resolveSessionScope({ pack = null, decl = {} } = {}) {
  if (pack?.sessionScope === 'fleet') return { scope: 'fleet', source: 'pack' };
  if (isSessionScope(decl?.session_scope)) {
    return { scope: decl.session_scope, source: 'task (deprecated)' };
  }
  return { scope: DEFAULT_SESSION_SCOPE, source: 'default' };
}
