// TRANSITION SHIM (#385 engine restructure): the PreToolUse guard now lives at
// engine/hooks/pretooluse-command.mjs. A pre-flip member's frozen wiring still invokes
// this path in the freshly fetched tree, so forward until the fleet converges
// (retired with the engine-restructure migration note, by hand).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const real = fileURLToPath(new URL('../engine/hooks/pretooluse-command.mjs', import.meta.url));
const r = spawnSync(process.execPath, [real, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
