## 2026-09-05 · born · a path-forced skill carrying the two host-permission rules out of `RULES.md` (#1667)
- **Source:** the audit of every pack's `RULES.md` for rules that only matter while editing a nameable file class (#1662): these two matter when a manifest's permission arrays change, and every session in every declaring repo was paying for them.
- **Reason:** a rule leaves `RULES.md` for a skill only where a load trigger covers every moment it is needed; here the moment is an edit of the manifest, which a path can name.
- **Actor:** @missingbulb (owner).
- **Model:** Claude Fable 5.1, per the commit trailer.
- **Mechanism:** a skill with `force-load-on-file-edits-paths: **/manifest.json` - the PreToolUse guard holds an edit of any manifest until the skill is loaded, and the `skill-loaded-before-editing` check catches the edits the guard cannot see (a `sed`, a heredoc). The glob is `**/manifest.json` rather than a source glob because a manifest's name is fixed by Chrome while an extension's source layout is the project's own; a path that guesses a member's layout would miss the moment. The description names both moments for the model's own discretion - "when a content script must run on arbitrary sites, or when editing a manifest's permissions" - since the guard only fires on the edit, and the decision to request at runtime is taken before any file is opened. The mechanism itself is #1648's: path-scoped skills, an engine flow force-delivered to the fleet.
- **Rejected:** leaving the two rules in `RULES.md` (paid by every session while relevant only when the manifest's permissions move); a description-only skill (a description is matched by the model reading the skill listing, which is not a predictable load - the owner's call on #1662, recorded on claudinite-growth's `writing-pack-prose` element: "unless we have a force-load-on-file-edits-paths that covers all the relevant times those instructions are needed, let's move them back to RULES.md").
- **Retire when:** the harness offers a deterministic skill trigger finer than a file edit, and the corpus adopts it.
- **Landed:** #1667 (Refs #1662) · pack version 60903.6.

## 2026-09-25 · trigger-changed · description cut to the 30-word cap
- **Reason:** the description summarised the method the body already carries; every session paid for
  it.
- **Mechanism:** the description, as before.
- **Actor:** @missingbulb (owner).
