// THE AGENTIC FIELDS ARE OPTIONAL, and this is where their absence becomes a
// value, so nothing downstream ever reads an undefined one. A declaration says
// what is particular to its task; what is the same for nearly every task is
// the door's to fill in:
//   - `agent_model`: `none` for a task that declares `code_work` and nothing
//     agentic beside it (its whole job is the subprocess), else the default
//     family — a task wanting the expensive one says so.
//   - `agent_instructions`: the worker spec beside the declaration, `task.md`.
//   - `agent_execution_timeout`: the default bound on an agentic run.
// A task that declares one keeps it; only an absent field is filled.
export const DEFAULT_AGENT_MODEL = 'sonnet';
export const DEFAULT_AGENT_INSTRUCTIONS = 'task.md';
export const DEFAULT_AGENT_EXECUTION_TIMEOUT = 1800;

// The model an incomplete declaration runs at. Pure over the fields it is given,
// so the author-time checks, which read a file as text, derive the same answer
// as the loader.
export function defaultAgentModel(decl) {
  const agentless = decl.code_work !== undefined
    && decl.agent_instructions === undefined && decl.agent_execution_timeout === undefined;
  return agentless ? 'none' : DEFAULT_AGENT_MODEL;
}

// Fill the absent agentic fields in place and return the declaration.
export function applyAgentDefaults(out) {
  if (out.agent_model === undefined) out.agent_model = defaultAgentModel(out);
  if (out.agent_model !== 'none') {
    if (out.agent_instructions === undefined) out.agent_instructions = DEFAULT_AGENT_INSTRUCTIONS;
    if (out.agent_execution_timeout === undefined) out.agent_execution_timeout = DEFAULT_AGENT_EXECUTION_TIMEOUT;
  }
  return out;
}
