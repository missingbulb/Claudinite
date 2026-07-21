#!/usr/bin/env node
// TRANSITIONAL SHIM — the engine moved to engine/ (engine-tree-restructure
// baseline migration). This keeps the legacy Stop-hook registration
// (`node …/checks/stop-hook.mjs`) working until every consumer's settings are
// rewritten to engine/checks/stop-hook.mjs; deleted when that migration
// retires. The real hook runs on import.
import '../engine/checks/stop-hook.mjs';
