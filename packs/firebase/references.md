# References — rationale behind this pack's rules and checks

Maintenance and review material for the `writing-pack-prose` references convention: each entry
carries the reason a rule or check exists, written so a periodic review can reaffirm — or
retire — it. Entry keys are file-scoped stable identifiers (gaps allowed, never renumbered): an
end-of-line `(n)` marker in `RULES.md` cites `RULES-n`, one in a skill cites
`<skill-name>-n`, and `check:` entries cover checks. No session loads this file for daily work.
- **(RULES-1)** The create/merge asymmetry was recorded as the single most common way a
  correct-looking ruleset rejects every legitimate client write — a frequency claim, which is
  what earns the rule its place over the many other ruleset mistakes available. Recovered from
  the rule's own pre-#467 text (cut by 2f3e4e9a as “consequence prose arguing for a rule rather
  than enabling it”, before this pack had a references.md to hold it). Reaffirm if merge-shaped
  writes are still the dominant client pattern; retire if the project's clients stop using
  `set(merge: true)`/`update`.
- **(RULES-2)** Anything the client sends about who they are is decoration: the body is
  attacker-controlled, so only the verified token carries identity. Recovered from the rule's
  own pre-#467 text (cut by 2f3e4e9a as “consequence prose arguing for a rule rather than
  enabling it”, before this pack had a references.md to hold it). Reaffirm as long as rules can
  read `request.auth`; retire only if identity stops being available there.
- **(RULES-3)** Reading rules and believing them is how the merge-semantics bugs of RULES-1
  ship — the empirical-testing rule exists because rule review by inspection is what failed.
  Recovered from the rule's own pre-#467 text (cut by 2f3e4e9a as “consequence prose arguing
  for a rule rather than enabling it”, before this pack had a references.md to hold it).
  Reaffirm while the emulator can execute rules; retire if it cannot.
- **(RULES-4)** The failure is social, not technical: an unqualified `firebase deploy` copied
  out of a README eventually ships someone's half-finished hosting directory to the wrong
  project. Recovered from the rule's own pre-#467 text (cut by 2f3e4e9a as “consequence prose
  arguing for a rule rather than enabling it”, before this pack had a references.md to hold
  it). Reaffirm while `.firebaserc` aliases are the mechanism; retire if the CLI stops
  defaulting to an ambient project.
- **(RULES-5)** The point of pinning to `request.time` is that a client must not be able to
  forge a heartbeat time — the value is a claim about the world, so the server must be the one
  to make it. Recovered from the rule's own pre-#467 text (cut by 2f3e4e9a as “consequence
  prose arguing for a rule rather than enabling it”, before this pack had a references.md to
  hold it). Reaffirm while clients can write the field; retire if the field moves server-side
  entirely.
- **(RULES-6)** A build that emits an entrypoint which throws on `require` is invisible until
  something invokes it, and the suite is the cheapest place to see it. Recovered from the
  rule's own pre-#467 text (cut by 2f3e4e9a as “consequence prose arguing for a rule rather
  than enabling it”, before this pack had a references.md to hold it). Reaffirm while functions
  are deployed from a built directory; retire if the deploy itself smoke-loads.
