#!/bin/bash
# SessionStart hook: inject the current user's preferences file into the session
# context. Lives beside the preferences it reads, resolving <email>.md relative to
# itself so the one script works in Claudinite and when mounted at .claudinite/ in a
# consumer. Stdout from a SessionStart hook is added to context. Fails soft: no email,
# or no matching file, injects nothing.
set -euo pipefail

email="${CLAUDE_CODE_USER_EMAIL:-}"
[ -n "$email" ] || exit 0

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
prefs="$here/$email.md"
[ -f "$prefs" ] || exit 0

cat "$prefs"
