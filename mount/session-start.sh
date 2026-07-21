#!/bin/bash
# TRANSITIONAL SHIM — the mount machinery moved to engine/mount/
# (engine-tree-restructure baseline migration). This keeps the legacy
# SessionStart registration (`bash …/mount/session-start.sh`) and the legacy
# sync hook's fan-out working until every consumer's settings are rewritten to
# engine/mount/session-start.sh; deleted when that migration retires.
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/../engine/mount/session-start.sh" "$@"
