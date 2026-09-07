import { finding } from '../../../../../engine/checks/helpers/findings.mjs';
import { stripComments } from '../../../../../engine/checks/helpers/code-scanning.mjs';

// A migration record's codemod rewrites files the MEMBER owns. The member's own
// code reads those files — and its own tests assert on them, in a repo the canon
// has never seen. So a rewrite that changes a declaration's SHAPE lands a member
// whose declarations are current and whose tests pin the generation before.
//
// This has now happened twice, both times as a green canon merge:
//
//   #768 Phase 1  `normalizeLocalDeclarations` converted task.mjs to task.json and
//                 deleted the module; missingbulb/Shepherd#460 was worker.mjs and
//                 task.test.js still importing it.
//   #1725         `updateTaskSchedulingFields` folded `frequency` into a `due:`
//                 term; missingbulb/GoogleCalendarEventCreator#1186 was five tests
//                 pinning the field and the old precondition list.
//
// The second record said so outright — "No apply stage: the rewrite is text, and a
// session has nothing to add." The text was the easy half. What a session adds is
// the half no codemod can reach: run the member's suite and repair what pinned the
// shape that just changed.
//
// WHY A RECORD AND NOT THE REHEARSAL. Neither consumer gate can see this. The
// canary's local pack imports nothing out of the mount as a stated design property,
// and no rehearsal fixture carries a task test — so both converge green against a
// declaration nothing in them asserts on. The apply stage is not a nicer way to
// catch it; it is the only lane that runs where the member's tests live.
//
// DELIBERATELY NARROW, the same bargain `consumer-safe-change` strikes. It watches
// the two codemods that rewrite `.claudinite/local/packs/*/tasks/*/task.json` and
// nothing else — 2 of the corpus's 27 records — because those are the member files
// the fleet has actually shown it writes tests against. `rewrite` is deliberately
// out: it is most records' workhorse, and firing on it would make every migration a
// migration question, which is how a check earns being turned off.
export const MEMBER_DECLARATION_CODEMODS = new Set(['updateTaskSchedulingFields', 'normalizeLocalDeclarations']);

// A dated record folder under either flow — the same shape `consumer-safe-change`
// uses to recognise one, and what separates a record from the registry beside it.
const RECORD = /^(engine|packs\/[^/]+)\/migrations\/\d{4}-\d{2}-\d{2}-[^/]+\/migration\.mjs$/;

// The flow a record belongs to is read off where it LIVES, exactly as the registry's
// own `assertApplyStageDeclaration` reads it. That function THROWS on an engine
// record declaring `applyStage` ("the engine update flow has no agentic lane"), so
// an engine record cannot take the remedy a pack record takes, and a finding that
// told it to would send the author at a wall the engine itself rejects.
const isEngineRecord = (file) => file.startsWith('engine/');

const declares = (text, key) => new RegExp(`(^|[{,;\\s])${key}\\s*:`).test(text);

// Which codemods a record declares, comments stripped so a commented-out line is not
// a declaration and a paragraph explaining the field is not one either.
export function declaredCodemods(text) {
  if (typeof text !== 'string') return [];
  const src = stripComments(text);
  return [...MEMBER_DECLARATION_CODEMODS].filter((key) => declares(src, key));
}

// The records in this change that rewrite a member's declarations with no session
// behind them. Pure over the changed-file list plus a head and a base reader, so the
// whole decision is testable with no git.
export function recordsMissingApplyStage(changed, read, readBase = () => null) {
  const out = [];
  for (const file of changed ?? []) {
    if (!RECORD.test(file)) continue;
    const head = read(file);
    const codemods = declaredCodemods(head);
    if (!codemods.length) continue;
    // Already fielded at the base is out of scope: every member past this record's
    // version floor has applied it, so a stage added now runs for nobody. Only a
    // codemod arriving in THIS change can still be carried across.
    const already = declaredCodemods(readBase(file));
    const arriving = codemods.filter((key) => !already.includes(key));
    if (!arriving.length) continue;
    if (declares(stripComments(head), 'applyStage')) continue;
    const [key] = arriving;
    out.push({
      file,
      key,
      what: `\`${key}\` rewrites the member's own task declarations, and this record carries no apply stage`,
      fix: isEngineRecord(file)
        // The registry's own error text for this case, because it is the only remedy
        // that exists here: the engine flow has no agentic lane at all.
        ? `an engine record cannot declare an apply stage — the engine update flow has no agentic lane. Move this `
          + `record to the pack whose file schema it changes (claudinite-tasks owns task.json), which can declare one.`
        : `add \`applyStage: { why, instructions }\` telling the session to run the member's own suite and repair `
          + `whatever pins the shape this rewrite just changed — the codemod writes the declaration, and only a `
          + `session can see the member's tests that assert on it.`,
    });
  }
  return out;
}

const rule = {
  id: 'migration-apply-stage',
  severity: 'blocking',
  scope: 'work',
  description: 'A migration record that rewrites a member\'s task declarations carries an apply stage',
  doc: 'consumer-safe-changes.md',
  why: 'the codemod rewrites the declaration but not the member\'s own tests that pin it, and neither the canary nor a rehearsal fixture carries one — so the record lands green here and red on the member',

  run(work) {
    const changed = work.changedFiles ?? [];
    if (!changed.length) return [];
    const missing = recordsMissingApplyStage(changed, (f) => work.read(f), (f) => work.readBase(f));
    if (!missing.length) return [];
    const first = missing[0];
    return [finding(rule, { file: first.file, line: null, what: first.what, fix: first.fix })];
  },
};

export default rule;
