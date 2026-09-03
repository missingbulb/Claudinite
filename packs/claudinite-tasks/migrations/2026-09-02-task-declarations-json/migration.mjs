// A member's own task declarations become data (#1633): every
// `.claudinite/local/packs/<pack>/tasks/<name>/task.mjs` is converted to a
// `task.json` pointing at the task schema, and the module is deleted.
//
// THE WRITE IS THE ENGINE'S. `taskDeclarationsToJson: true` names the registry's
// named codemod (engine/migrations/registry.mjs, `applyTaskDeclarationConversion`),
// which runs the same converter the CLI does. A record cannot carry it: the JSON is
// the module's evaluated export, which no textual rewrite produces.
//
// GATED ON THE MOUNT, BY CONTENT. Converting is only safe once the member's
// vendored `claudinite-tasks` reads `task.json` — this pack's discover goes
// through `task-declaration.mjs` from the version this record lands with, and an
// older mount would see a folder with no `task.mjs` and silently run nothing.
// The two lanes deliver on their own cadences, so `appliesTo` probes the mounted
// pack for that module rather than trusting the stamp; an unreadable mount reads
// as "not capable" and the record stays inert. The canon runs the same probe
// against its own tree (two-root form).
//
// IDEMPOTENT by construction: a folder with no `task.mjs` is nothing to convert.
const READER = 'packs/claudinite-tasks/task-declaration-text.mjs';
const mountReadsJson = async (read) => {
  const text = (await read(`.claudinite/shared/${READER}`)) ?? (await read(READER));
  return Boolean(text) && text.includes("'task.json'");
};

export default {
  id: 'task-declarations-json',
  landed: '2026-09-02',
  version: '60902.10',
  summary: 'a member\'s local-pack task.mjs declarations are converted to task.json, the data form the engine now reads (#1633)',

  appliesTo: mountReadsJson,
  taskDeclarationsToJson: true,

  // The telemetry hook cannot list directories, and the fact this record retires
  // — a `task.mjs` under the member's local packs — is only visible by listing.
  // The fleet-visible signal is the shape check's advisory on every remaining
  // module (task-declaration-shape); the cleanup that drops the module reader is
  // gated on that advisory firing nowhere (#1633).
  legacyPresent: async () => false,
};
