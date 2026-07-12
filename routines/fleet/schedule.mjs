// The weekly full-sweep stagger. Each member repo does one guaranteed full
// re-examination per week, spread across the 7 weekdays by a stable hash of its
// full name, so ~1/7 of the fleet full-sweeps on any given (UTC) night. This is the
// self-healing net that lets the daily loop stay stateless (see routines/fleet/DESIGN.md).

// FNV-1a over the lowercased full name → a bucket in [0, 6]. Deterministic and
// well-spread; Math.imul keeps the multiply in 32-bit range.
export function fullSweepBucket(fullName) {
  let h = 0x811c9dc5;
  const s = String(fullName).toLowerCase();
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 7;
}

// Is tonight this repo's weekly full-sweep night? weekdayUtc is 0..6 (UTC).
export const isFullSweepDay = (fullName, weekdayUtc) => fullSweepBucket(fullName) === weekdayUtc;
