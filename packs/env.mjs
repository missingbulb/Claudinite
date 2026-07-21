// TRANSITION SHIM (#385 engine restructure): the env machinery now lives at
// engine/pack_loader/env.mjs. An older pasted cloud-environment Setup script
// still invokes this path, so forward until every environment is re-pasted
// (retired with the engine-restructure migration note, by hand).
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const real = fileURLToPath(new URL('../engine/pack_loader/env.mjs', import.meta.url));
const r = spawnSync(process.execPath, [real, ...process.argv.slice(2)], { stdio: 'inherit' });
process.exit(r.status ?? 1);
