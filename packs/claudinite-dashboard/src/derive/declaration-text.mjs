// A `task.json`'s text as the declaration the page renders, with the defaults the
// queue's loader fills. THE DASHBOARD'S OWN COPY of the queue's reader
// (`packs/claudinite-tasks/src/contract/task-declaration-text.mjs` and
// `task-defaults.mjs`): packs share no code, so the page carries the two steps it needs
// and reads the default values themselves from the queue's vocabulary.
// `test/declaration-text-drift.test.mjs` runs both sides over the same texts.
import { DEFAULT_AUTOMERGE, DEFAULT_AGENT_MODEL } from '../../../claudinite-tasks/public/task-constants.mjs';

// `$schema` is the editor's pointer, not a field of the contract, and leaves here.
export function parseTaskDeclaration(text) {
  const decl = JSON.parse(text);
  if (decl !== null && typeof decl === 'object' && !Array.isArray(decl)) delete decl.$schema;
  return decl;
}

// Fill the absent fields in place and return the declaration: no agent, and land
// nothing unreviewed for a task that may open a pull request.
export function applyTaskDefaults(out) {
  if (out.agent_model === undefined) out.agent_model = DEFAULT_AGENT_MODEL;
  if (out.expected_outcome !== undefined && out.expected_outcome !== 'no_code_changes' && out.automerge === undefined) out.automerge = DEFAULT_AUTOMERGE;
  return out;
}
