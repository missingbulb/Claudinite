import barrier from './check.mjs';

// The barriers pack — enforce a directed folder-access graph. A declared pack
// (no fingerprint: wanting structural segregation is a project's own call, and
// another pack can pull it in via `requires`), it ships one config-driven check
// reading the repo's graph from .claudinite-checks.json `packConfig.barriers`.
// Its detection engine (engine.js) is exported so other packs can compose a
// fixed barrier of their own — the mechanism this pack exists to provide. No
// prose: the finding is the instruction, and the full guide is the README.
export default {
  id: 'barriers',
  detect: null,
  marker: null,
  prose: null,
  rules: [barrier],
};
