#!/bin/bash
# SessionStart hook: inject the current user's preferences file into the session
# context. Lives beside the preferences it reads, resolving <email>.md relative to
# itself so the one script works in Claudinite and when mounted at .claudinite/ in a
# consumer. Stdout from a SessionStart hook is added to context.
#
# On the happy path it prints the prefs file. When preferences can't be injected — no
# user email, or no matching <email>.md — it does NOT silently skip: a SessionStart
# hook can't block or prompt on its own, so it injects a directive telling the
# assistant to halt and confirm with the user (via AskUserQuestion) before doing any
# work, so nobody is unknowingly worked with under default behavior in place of their
# preferences.
set -euo pipefail

emit_halt() {
  # SessionStart stdout is added to the session context; the assistant acts on it.
  # Emit plain text (not a JSON additionalContext envelope) so this step's output
  # merges cleanly with the other steps' prose when the session-start orchestrator
  # forwards every step's stdout through one hook — a single hook's stdout must not
  # be a mix of JSON and prose, or none of it parses as structured output.
  printf '%s\n' "$1"
}
halt_directive="STOP: before running any other tool, answering, or starting the requested task, use the AskUserQuestion tool to ask the user whether to proceed without their preferences or pause and fix it first; do not proceed until they answer."

email="${CLAUDE_CODE_USER_EMAIL:-}"
if [ -z "$email" ]; then
  emit_halt "PREFERENCES NOT LOADED: CLAUDE_CODE_USER_EMAIL is not set, so no interaction preferences could be identified or injected this session. ${halt_directive}"
  exit 0
fi

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
prefs="$here/$email.md"
if [ ! -f "$prefs" ]; then
  # Strip any double quotes/backslashes from the email before embedding it in the
  # message, so an unusual address stays tidy in the injected text.
  safe_email="$(printf '%s' "$email" | tr -d '"\\')"
  emit_halt "PREFERENCES NOT LOADED: no preferences file for ${safe_email} was found beside this hook, so this user's interaction preferences were not injected this session. ${halt_directive}"
  exit 0
fi

cat "$prefs"
