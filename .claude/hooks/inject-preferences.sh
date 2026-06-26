#!/bin/bash
# SessionStart hook: inject the current user's Claudinite preferences into context.
#
# Resolves preferences/$CLAUDE_CODE_USER_EMAIL.md *relative to this script*, so the
# one physical file works both in Claudinite itself (script at .claude/hooks/, prefs
# at preferences/) and when mounted in a consumer at .claudinite/.claude/hooks/ (prefs
# at .claudinite/preferences/). Stdout from a SessionStart hook is added to the session
# context, which replaces the old soft "read this file" instruction in CLAUDE.md.
#
# Fails soft: no email, or no matching file, means nothing is injected and the session
# proceeds normally.
set -euo pipefail

email="${CLAUDE_CODE_USER_EMAIL:-}"
[ -n "$email" ] || exit 0

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
prefs="$here/../../preferences/$email.md"
[ -f "$prefs" ] || exit 0

cat <<EOF
The following is the current user's personal Claudinite preferences file
(preferences/$email.md), loaded automatically at session start. These are the
owner's interaction preferences — tone, summary style, end-of-turn conventions,
and the trigger phrases that map to defined commands. Honor them this session.

EOF
cat "$prefs"
