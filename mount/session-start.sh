#!/bin/bash
# TRANSITION SHIM (#385 engine restructure): the SessionStart orchestrator now
# lives at engine/hooks/session-start-command.sh. A pre-flip member's tracked sync hook
# still calls this path in the freshly fetched tree, so forward until the fleet
# converges (retired with the engine-restructure migration note, by hand).
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/engine/hooks/session-start-command.sh" "$@"
