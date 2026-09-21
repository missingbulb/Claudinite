## 2026-08-31 · born · Coded production validations: URL probes judged as code-work (#1534)
- **Source:** #1184 and #1288, two verifications that parked because the queue's only runner was an
  agentic session.
- **Reason:** a verification whose artifact is a live URL could not run at all - an agent session
  has no egress. This worker runs Action-side, where egress exists, fetching the issue's declarative
  probes and judging them in code. Both probe classes are required: without the liveness gate, "not
  deployed yet" and "deployed and broken" are indistinguishable.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5, per the commit trailer.
- **Mechanism:** an agentless manual task a verification issue routes to by naming it, riding the
  requeue protocol the same change added - a worker printing a requeue line before a clean exit has
  the executor stamp the item's not-before and return it to blocked, the third answer an exit code
  could not give.
- **Landed:** #1534 (Closes #1530) · pack version 60831.9.

## 2026-09-21 · policy-changed · entry points set exitCode instead of exiting hard
- **Reason:** `process.exit(1)` in an entry point's catch discards whatever stdout has not drained;
  measured here, a run piped to a slow reader delivered 309 of 200,000 lines, while
  `process.exitCode = 1` delivered all of them. The exit status is unchanged; only the output
  survives.
- **Mechanism:** the guard already runs as the module's entry point, so letting the process end
  naturally is enough; nothing waits on the event loop after the catch.
- **Actor:** @missingbulb (owner), replacing #2082 whose diff predated the src/ layout move.
- **Model:** Opus 5
