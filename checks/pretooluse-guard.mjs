#!/usr/bin/env node
// TRANSITIONAL SHIM — the engine moved to engine/ (engine-tree-restructure
// baseline migration). This keeps the legacy PreToolUse registration
// (`node …/checks/pretooluse-guard.mjs`) working until every consumer's
// settings are rewritten to engine/checks/pretooluse-guard.mjs; deleted when
// that migration retires. The real guard runs on import.
import '../engine/checks/pretooluse-guard.mjs';
