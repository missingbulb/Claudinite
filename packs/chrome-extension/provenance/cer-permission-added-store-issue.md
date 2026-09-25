## 2026-07-07 · born · a permission added to the manifest prompts the manual store step (#155)
- **Source:** the release standard's permission-change procedure: the Chrome Web Store dashboard needs a written justification per permission before the next publish, and the submission-kit file that used to hold those justifications was a drift-prone copy of dashboard state.
- **Reason:** the dashboard step is manual and gates the next publish, so a proactive issue beats the reactive publish failure.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Opus 4.8, per the commit trailer.
- **Mechanism:** a work-scope check (it compares the manifest's permission arrays against the base), **advisory** because the fix lives entirely off-repo - there is no in-repo artifact to block a fix against - so blocking would hold every change hostage to a dashboard nobody in the session can reach. Replaced `cer/permission-justifications`, which had judged the submission kit.
- **Rejected:** a blocking check on the submission-kit file (it duplicated dashboard state and drifted).
- **Retire when:** the store's justification step gains an API the pipeline can drive.
- **Landed:** #155 (Refs #153) · pack version 1.

## 2026-08-19 · reworded · gated on shipping like every `cer/` check (#1060)
- **Mechanism:** the declaration's `relevantWhen` carries the same shipping test as the coded rule, so a repo that only codes an extension is never asked about store justifications.
- **Actor:** @missingbulb (owner).
- **Landed:** #1060 (Refs #1057) · pack version 3.

## 2026-09-25 · reworded · `severity: blocking|advisory` is spelled `on_fail: block|advise`
- **Reason:** owner decision, 2026-09-25: the field names what happens when the check fails, and
  *severity* keeps its impact sense; what this element enforces is unchanged.
- **Actor:** @missingbulb (owner).
