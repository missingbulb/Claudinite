// SCRIPTED AGENTIC WORK — what happens after a hand-off.
//
// There is no `src/world/agents.mjs` to stand in for: an agent session is not an
// edge the engine calls, it is a thing the engine STARTS and then never hears
// from again. So this module has no port and no parity row; it exists because a
// scenario has to be able to say what the session did.
//
// A SESSION IS A SCRIPT, NOT A MODEL. The script's body is an ordinary function
// handed the fake GitHub and the item, so a scenario that wants the real
// converge calls `src/session/`'s own code from inside it and the harness
// neither knows nor cares. What this module owns is only what the session costs
// and how it ends: how many virtual minutes it takes, whether it beats while it
// runs, and whether it finishes at all.
//
// A DEAD SESSION IS SILENCE, not an error: the body never runs, nothing is
// written, and the item is left exactly as the hand-off left it. That is the
// whole input to the janitor's agent leash, and a fake that reported a death
// would be handing the engine a signal production does not have.

import { MINUTE } from './clock.mjs';

const HEARTBEAT_MARKER = '<!-- claudinite-heartbeat -->';

export function makeAgents({ clock, github, repo = 'o/r', defaultScript = {} } = {}) {
  const scripts = new Map();   // task id -> script
  const sessions = [];
  const records = [];          // whatever a session "printed"

  const scriptFor = (task) => scripts.get(task?.id ?? null)
    ?? scripts.get(`${task?.pack}/${task?.id}`)
    ?? scripts.get('*')
    ?? defaultScript;

  function start({ task, item, nonce, sessionId = null }) {
    const s = {
      id: sessionId ?? `s-${sessions.length + 1}`,
      item: item.number, task: task?.id ?? null, nonce,
      startedAt: clock.ms(), endedAt: null, dead: false, beats: 0,
    };
    sessions.push(s);

    const { minutes = 45, heartbeatMinutes = null, dies = false, run = null } = scriptFor(task);
    const endsAt = s.startedAt + minutes * MINUTE;

    if (heartbeatMinutes) {
      for (let t = s.startedAt + heartbeatMinutes * MINUTE; t < endsAt; t += heartbeatMinutes * MINUTE) {
        clock.at(t, () => {
          const issue = github.find(item.number);
          if (!issue) return;
          github.port.comment(null, repo, item.number, `${HEARTBEAT_MARKER}\nagent session \`${s.id}\` is working.`);
          s.beats += 1;
        });
      }
    }

    clock.at(endsAt, async () => {
      s.endedAt = endsAt;
      if (dies) { s.dead = true; return; }
      if (run) {
        await run({
          github, clock, repo, item, task, nonce, session: s,
          print: (line) => records.push({ at: clock.ms(), session: s.id, line }),
        });
      }
    });
    return s;
  }

  const harness = {
    start,
    sessions: () => sessions,
    records: () => records,
    // `'*'` is every task; a task id wins over it.
    script: (taskId, script) => { scripts.set(taskId, script); return harness; },
  };
  return harness;
}
