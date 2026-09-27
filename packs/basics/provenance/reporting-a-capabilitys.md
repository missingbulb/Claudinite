## 2026-09-04 · born · date an egress observation instead of asserting closure
- **Reason:** a repo's pack asserted a capability "still closed" from a stale observation; a
  later session read that as current state and answered a question from model knowledge alone
  rather than re-probing, while the capability had in fact opened back up.
- **Actor:** the owner.
- **Mechanism:** a RULES.md rule keyed on the act, under a section that dates every observation
  rather than asserting a standing verdict.
- **Retire when:** an environment reports its own capability state to the session directly, so
  nothing has to be re-probed by hand.

## 2026-09-13 · reaffirmed · the policy swung back the other way
- **Reason:** a re-probe found hosts open nine days earlier now denied, which is the case the rule
  argues for — a capability's state is not a fact that settles once.
- **Actor:** the owner.

## 2026-09-27 · promoted · from a member's local pack (https://github.com/missingbulb/Claudinite/pull/2283)
