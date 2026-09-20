## 2026-09-05 · declined · the five sign-in and token rules into an `extension-google-signin` skill (#1662)
- **Source:** the rules-to-skills audit proposed `paths: **/auth*.{js,ts}, **/identity*.{js,ts}, manifest.json`.
- **Reason:** a code-content rule can only be path-scoped where the project names its files predictably, and those globs are guesses at a member's layout; a description-triggered skill is model discretion, so the rules stay prose. Re-derivable if the harness gains a trigger on file content or a call.
- **Actor:** @missingbulb (owner), on #1667.

## 2026-09-05 · declined · the content-script module rules into a `content-script-modules` skill (#1662)
- **Source:** the audit proposed `paths: **/content*.{js,ts}, **/content_scripts/**, manifest.json`.
- **Reason:** the same guess at a member's layout; the classic-script half is already a check (`content-script-module-syntax`) and fires wherever the manifest points, which is the deterministic trigger the skill would have lacked.
- **Actor:** @missingbulb (owner), on #1667.

## 2026-09-05 · declined · the three CDP worker-probing rules into an activity-triggered skill (#1662)
- **Source:** the audit proposed an activity trigger, "introspecting a worker over CDP".
- **Reason:** no file edit predicts the activity, so the only trigger is the description, which the model may not read; the rules stay prose by the owner's call on #1662.
- **Actor:** @missingbulb (owner), on #1667.
