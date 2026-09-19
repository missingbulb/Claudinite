import { resolveRetentionDays } from './prune-logs.mjs';

// logs-prune's own precondition term: the oldest capture is aged past this repo's
// retention. Nothing built in can say that, and no movement condition would — logs
// sit long enough to expire on exactly the repos that went quiet. The task is asked
// only when somebody wakes it, so this is the content gate on that wake rather than
// a trigger: nothing aged out declines the run instead of pruning nothing.

export const terms = {
  'log-past-retention': {
    signals: ['conversationLogs'],
    holds(signals) {
      // NO READING IS NOT A DECLINE. The executor collects this signal at every pick,
      // so absence here is a bare item evaluated with no world behind it — and a
      // decline on data that was not there would close the one lever this task has,
      // `task:status:rejected`, without ever running. The worker reads the branch and
      // the declaration first-hand and deletes nothing it should not, so it is the
      // authority when the gate has nothing to judge.
      const logs = signals.conversationLogs;
      if (logs === undefined || logs === null) {
        return { holds: true, reason: 'no conversation-logs reading — the worker decides what is deletable' };
      }
      if (logs.present !== true) {
        return { holds: false, reason: 'no conversation-logs branch — nothing captured yet' };
      }
      // The signal reports what the declaration SAYS (null when nothing declares a
      // numeric `retention_days`) and knows nothing about this pack's policy — it is
      // keyed by the parameter rather than by the pack, deliberately. So the default
      // and the opt-out are applied here, through the same resolver the worker uses,
      // and a repo that declared itself out is declined before it costs an item.
      const retention = resolveRetentionDays(logs.retentionDays);
      if (retention === null) {
        return { holds: false, reason: `retention_days is ${logs.retentionDays} — capture-only by this repo's own choice, so the prune deletes nothing` };
      }
      const oldest = logs.oldestLogAgeDays;
      // An unreadable branch tree leaves `oldestLogAgeDays` null, which is unknown
      // rather than expired — and the safe reading of unknown is "delete nothing".
      if (!(typeof oldest === 'number' && oldest > retention)) {
        return { holds: false, reason: `no log older than retention ${retention}d — nothing to prune` };
      }
      return { holds: true, reason: `oldest log ${oldest.toFixed(1)}d old vs retention ${retention}d` };
    },
  },
};
