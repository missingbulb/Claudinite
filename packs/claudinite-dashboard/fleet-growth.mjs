// What the corpus is doing ACROSS the fleet, from the members' own usage files. Pure:
// no clock of its own beyond the one it is handed, no I/O, no DOM.
//
// This is the panel the fleet page could not have before. Every other figure it shows
// comes from a live read — issues, runs, a head commit — and none of those can answer
// the two questions a corpus is actually judged on: how much of it each session is
// paying for, and how often its checks caught something. Both live in each member's
// `usage.GENERATED.json`, which the page now reads anyway, so the panel costs nothing
// beyond what the sweep already spent.
//
// THE RULES THE FLEET PAGE'S OWN NUMBERS FOLLOW APPLY HERE TOO:
//
//   NO VANITY TOTAL. Every figure is a window against the window before it. A count
//   that only ever grows says nothing about this week.
//
//   NOTHING INVENTED. No estimate of hours saved, no score. Each figure is a sum of
//   things that individually happened and are individually checkable in a member's own
//   file.
//
//   AN UNREAD MEMBER IS NOT A ZERO. A member with no usage file is counted as NOT
//   FOLDING and named, never averaged in as a repo where nothing happens. That census
//   is the same fact the retired fleet aggregate carried as `coverage.absent`, derived
//   live instead of stored.

import { growthSeries } from './usage.mjs';

const DAY_MS = 86400e3;

// One fleet-wide day series, plus the census of who could answer for it.
//
// `reads` is the fleet loader's raw per-member reads; each carries `usage`, which is
// null for a member that does not fold, could not be read, or predates the file.
export function fleetGrowth(reads, { now, days = 30, windowDays = 7 } = {}) {
  const readable = (reads ?? []).filter((r) => r && !r.error && r.declaration);
  const folding = readable.filter((r) => r.usage);
  const absent = readable.filter((r) => !r.usage).map((r) => r.repo).sort();

  const series = folding.map((r) => ({ repo: r.repo, growth: growthSeries(r.usage, { now, days }) }));
  const ladder = series[0]?.growth.days.map((d) => d.day)
    ?? Array.from({ length: days }, (_, i) => new Date(Math.floor(now / DAY_MS) * DAY_MS - (days - 1 - i) * DAY_MS).toISOString().slice(0, 10));

  // Summed across members, per day. A day no member had an opinion on stays null —
  // the fleet did not have a quiet Tuesday, nobody folded one.
  const rows = ladder.map((day, i) => {
    const cells = series.map((s) => s.growth.days[i]).filter(Boolean);
    const sum = (field) => {
      const known = cells.map((c) => c[field]).filter((n) => n !== null && n !== undefined);
      return known.length ? known.reduce((a, b) => a + b, 0) : null;
    };
    return {
      day,
      ruleTokens: sum('ruleTokens'),
      sessions: sum('sessions'),
      checkRuns: sum('checkRuns'),
      checkFailures: sum('checkFailures'),
      findings: sum('findings'),
      // A day is `source: 'none'` for the chart when nothing answered for it, which is
      // what leaves the column blank rather than drawing it at the floor.
      source: cells.some((c) => !c.missing) ? 'folded' : 'none',
    };
  });

  const windowOf = (from, to) => {
    const slice = rows.filter((r) => r.day >= from && r.day < to);
    const sum = (field) => {
      const known = slice.map((r) => r[field]).filter((n) => n !== null);
      return known.length ? known.reduce((a, b) => a + b, 0) : null;
    };
    return { checkRuns: sum('checkRuns'), checkFailures: sum('checkFailures'), ruleTokens: sum('ruleTokens'), sessions: sum('sessions') };
  };

  const dayKey = (t) => new Date(t).toISOString().slice(0, 10);
  const current = windowOf(dayKey(now - (windowDays - 1) * DAY_MS), dayKey(now + DAY_MS));
  const previous = windowOf(dayKey(now - (2 * windowDays - 1) * DAY_MS), dayKey(now - (windowDays - 1) * DAY_MS));

  return {
    days: rows,
    from: ladder[0],
    to: ladder[ladder.length - 1],
    windowDays,
    current,
    previous,
    // The coverage census, derived rather than stored: a member the page could read but
    // that carries no usage file IS the absent row, and naming them is what keeps every
    // rate above honest about its own denominator.
    folding: folding.length,
    members: readable.length,
    absent,
    // The mean corpus a session in this fleet carries, which is the figure that says
    // what the rules COST — null rather than 0 when no session in the window attested
    // one, because "nobody printed the line" is not "the corpus is empty".
    tokensPerSession: current.sessions ? Math.round((current.ruleTokens ?? 0) / current.sessions) : null,
  };
}
