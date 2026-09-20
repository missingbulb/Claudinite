import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ruleTester, makeRepo, cleanup } from '../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../engine/checks/helpers/repo-context.mjs';
import { runRule } from '../../../engine/checks/helpers/work.mjs';
import worldRule from '../worldRules/provenance-integrity.mjs';
import workRule from '../workRules/provenance-change-recorded.mjs';

// The two halves of the provenance convention, red-first: a violating tree finds and a
// clean one does not, under both roots.

const PACK = '.claudinite/local/packs/mypack/';
const BORN = '## 2026-07-18 · born · from an incident (#12)\n- **Reason:** it failed twice.\n- **Actor:** @x (owner).\n- **Mechanism:** prose.\n';
const REWORDED = '\n## 2026-08-01 · reworded · the pass (#40)\n- **Actor:** @x (owner).\n';

const clean = {
  [`${PACK}pack.mjs`]: 'export default {};\n',
  [`${PACK}RULES.md`]: '- **Doing a thing** — the settled way. (doing-thing)\n\n- **Doing another** — plainly.\n  (doing-another)\n',
  [`${PACK}skills/how/SKILL.md`]: '---\nname: how\nmetadata:\n  body: workflow\n---\n\n1. First. (3)\n',
  [`${PACK}skills/rules/SKILL.md`]: '---\nname: rules\nmetadata:\n  body: guidelines\n---\n\n- **Guideline one** — do it. (guideline-one)\n',
  [`${PACK}worldRules/my-rule.mjs`]: "const rule = { id: 'my/rule', severity: 'blocking' };\nexport default rule;\n",
  [`${PACK}declared-checks.json`]: '[{ "id": "declared-one", "severity": "advisory", "failureMessage": "m" }]\n',
  [`${PACK}tasks/nightly/task.json`]: '{}\n',
  [`${PACK}provenance/doing-thing.md`]: BORN,
  [`${PACK}provenance/doing-another.md`]: '',
  [`${PACK}provenance/how.md`]: '',
  [`${PACK}provenance/rules.md`]: '',
  [`${PACK}provenance/guideline-one.md`]: '',
  [`${PACK}provenance/my-rule.md`]: '',
  [`${PACK}provenance/declared-one.md`]: '',
  [`${PACK}provenance/nightly.md`]: '',
  [`${PACK}provenance/_pack.md`]: '',
  [`${PACK}provenance/_declined.md`]: '## 2026-08-01 · declined · a candidate\n- **Reason:** it restated the canon.\n- **Actor:** @x (owner).\n',
  'src/app.js': 'x\n',
};
// The same pack with every file filled, so a flagged case reads its one fault and no
// pending-history advisories beside it.
const filled = Object.fromEntries(Object.entries(clean).map(([k, v]) => [k, v === '' ? BORN : v]));
const notAdvisory = (findings) => findings.filter((f) => f.severity !== 'advisory');

test('provenance-integrity: a repo with no pack under either root is inert', () => {
  const root = makeRepo({ changed: { 'src/app.js': 'x\n', 'packs/README.md': 'not a pack\n' } });
  try { assert.deepEqual(runRule(worldRule, buildContext({ root, mode: 'all' })), []); } finally { cleanup(root); }
});

test('provenance-integrity: a marked pack is clean but for its empty files, which are advisory pending history', () => {
  const root = makeRepo({ changed: clean });
  try {
    const findings = runRule(worldRule, buildContext({ root, mode: 'all' }));
    assert.deepEqual(notAdvisory(findings), [], JSON.stringify(findings, null, 2));
    assert.equal(findings.length, 1, 'pending history is one advisory per pack, a count');
    assert.match(findings[0].what, /^8 provenance files are empty .*\(_pack\.md, declared-one\.md, doing-another\.md, …\)/);
    assert.equal(findings[0].file, `${PACK}provenance`);
  } finally { cleanup(root); }
});

ruleTester(worldRule, {
  flagged: {
    'unmarked rules are one finding per file, naming the count and the first': {
      files: { ...filled, [`${PACK}RULES.md`]: '- **Doing a thing** — no marker.\n\n- **Doing another** — none either.\n' },
      at: [
        { file: `${PACK}RULES.md`, line: 1, what: /2 rules end with no marker.*first: "Doing a thing"/, fix: /provenance\.mjs mark mypack/ },
        { file: `${PACK}provenance/doing-another.md`, what: /live, and no carrier of \.claudinite\/local\/packs\/mypack names doing-another\.md/ },
        { file: `${PACK}provenance/doing-thing.md`, what: /live, and no carrier of \.claudinite\/local\/packs\/mypack names doing-thing\.md/ },
      ],
    },
    'a marker naming no file, and one naming a retired file': {
      files: { ...filled, [`${PACK}RULES.md`]: '- **Doing a thing** — the settled way. (doing-thing-gone)\n\n- **Doing another** — plainly. (doing-another)\n', [`${PACK}provenance/doing-another.md`]: `${BORN}\n## 2026-09-01 · retired · superseded by the canon\n- **Actor:** @x (owner).\n` },
      at: [
        { file: `${PACK}RULES.md`, line: 1, what: /rule "Doing a thing" names .*doing-thing-gone\.md, which is not a file/, fix: /mark mypack/ },
        { file: `${PACK}RULES.md`, line: 3, what: /rule "Doing another" names .*doing-another\.md, which is retired/, fix: /retired element carries no live carrier/ },
        { file: `${PACK}provenance/doing-thing.md`, what: /named by no carrier|no carrier of/ },
      ],
    },
    'a skill with no body, and a marker inside a workflow': {
      files: { ...filled, [`${PACK}skills/how/SKILL.md`]: '---\nname: how\n---\n\n1. First.\n', [`${PACK}skills/rules/SKILL.md`]: '---\nname: rules\nmetadata:\n  body: workflow\n---\n\n- **Guideline one** — do it. (guideline-one)\n' },
      at: [
        { file: `${PACK}provenance/guideline-one.md`, what: /named by no carrier|no carrier of/ },
        { file: `${PACK}skills/how/SKILL.md`, what: /skill how declares no body/, fix: /body: workflow/ },
        { file: `${PACK}skills/rules/SKILL.md`, line: 7, what: /\(guideline-one\) inside a skill whose body is a workflow/ },
      ],
    },
    'a file that does not parse, one that opens with the wrong kind, and a born without Mechanism': {
      files: { ...filled, [`${PACK}provenance/doing-thing.md`]: '# header\n## 2026-07-18 · reworded · first\n- **Actor:** @x (owner).\n', [`${PACK}provenance/doing-another.md`]: '## 2026-07-18 · born · no mechanism\n- **Actor:** @x (owner).\n' },
      at: [
        { file: `${PACK}provenance/doing-thing.md`, line: 1, what: /text outside an entry/ },
        { file: `${PACK}provenance/doing-another.md`, line: 1, what: /born entry carries no Mechanism/ },
        { file: `${PACK}provenance/doing-thing.md`, line: 2, what: /opens with born/ },
      ],
    },
    'a pack-root references.md is the retired convention, tolerated at advisory with the conversion in the fix': {
      files: { ...filled, [`${PACK}references.md`]: '- **(RULES-3)** old\n' },
      at: [{ file: `${PACK}references.md`, severity: 'advisory', what: /retired rationale convention/, fix: /convert-references mypack/ }],
    },
    'the canon shelf is judged the same way': {
      files: { 'packs/somepack/pack.mjs': 'export default {};\n', 'packs/somepack/RULES.md': '- **Doing a thing** — no marker.\n', 'packs/somepack/provenance/_pack.md': BORN },
      at: [{ file: 'packs/somepack/RULES.md', line: 1, what: /1 rule ends with no marker/, fix: /packs\/claudinite-growth\/provenance\.mjs mark somepack|\.claudinite\/shared\/packs\/claudinite-growth\/provenance\.mjs mark somepack/ }],
    },
  },
});

// --- the work half -----------------------------------------------------------------

const runWork = (changed, base = filled) => {
  const root = makeRepo({ base, changed });
  try { return runRule(workRule, buildContext({ root })); } finally { cleanup(root); }
};

test('provenance-change-recorded: a reworded rule owes an entry, and the entry clears it', () => {
  const reworded = { [`${PACK}RULES.md`]: '- **Doing a thing** — the settled way, said better. (doing-thing)\n\n- **Doing another** — plainly.\n  (doing-another)\n' };
  const owed = runWork(reworded);
  assert.equal(owed.length, 1, JSON.stringify(owed, null, 2));
  assert.match(owed[0].what, /"Doing a thing" reads differently from the base, and .*doing-thing\.md gained no entry/);
  assert.match(owed[0].fix, /provenance\.mjs append mypack doing-thing/);
  assert.deepEqual(runWork({ ...reworded, [`${PACK}provenance/doing-thing.md`]: BORN + REWORDED }), []);
});

test('provenance-change-recorded: a re-wrap, a marker added or moved, and a body declared owe nothing', () => {
  assert.deepEqual(runWork({
    [`${PACK}RULES.md`]: '- **Doing a thing** — the settled\n  way. (doing-thing)\n\n- **Doing another** — plainly. (doing-another)\n',
    [`${PACK}skills/rules/SKILL.md`]: '---\nname: rules\nmetadata:\n  body: guidelines\n---\n\n- **Guideline one** — do it.\n  (guideline-one)\n',
  }), []);
  const unbodied = { ...filled, [`${PACK}skills/how/SKILL.md`]: '---\nname: how\n---\n\n1. First. (3)\n' };
  assert.deepEqual(runWork({ [`${PACK}skills/how/SKILL.md`]: clean[`${PACK}skills/how/SKILL.md`] }, unbodied), [], 'the marking pass declares a body and owes nothing');
});

test('provenance-change-recorded: a new rule, a changed skill body, a changed check, task and manifest each owe their entry; comment-only code does not', () => {
  const findings = runWork({
    [`${PACK}RULES.md`]: `${filled[`${PACK}RULES.md`]}\n- **Doing a third** — newly. (doing-third)\n`,
    [`${PACK}provenance/doing-third.md`]: '',
    [`${PACK}skills/how/SKILL.md`]: '---\nname: how\nmetadata:\n  body: workflow\n---\n\n1. First, differently. (3)\n',
    [`${PACK}worldRules/my-rule.mjs`]: "const rule = { id: 'my/rule', severity: 'advisory' };\nexport default rule;\n",
    [`${PACK}declared-checks.json`]: '[{ "id": "declared-one", "severity": "blocking", "failureMessage": "m" }]\n',
    [`${PACK}tasks/nightly/task.json`]: '{ "automerge": ["nothing"] }\n',
    [`${PACK}pack.mjs`]: 'export default { requires: ["basics"] };\n',
  });
  const whats = findings.map((f) => f.what);
  assert.equal(findings.length, 6, whats.join('\n'));
  assert.ok(whats.some((w) => /"Doing a third" is new/.test(w)));
  assert.ok(whats.some((w) => /skill how changed/.test(w)));
  assert.ok(whats.some((w) => /check my\/rule changed/.test(w)));
  assert.ok(whats.some((w) => /check declared-one changed/.test(w)));
  assert.ok(whats.some((w) => /task nightly changed/.test(w)));
  assert.ok(whats.some((w) => /the manifest changed/.test(w)));
  assert.deepEqual(runWork({
    [`${PACK}worldRules/my-rule.mjs`]: "// a comment\nconst rule = { id: 'my/rule', severity: 'blocking' };\nexport default rule;\n",
    [`${PACK}pack.mjs`]: '// why the pack exists\nexport default {};\n',
  }), [], 'a comment is not a decision');
});

test('provenance-change-recorded: a provenance file only grows', () => {
  const edited = runWork({ [`${PACK}provenance/doing-thing.md`]: BORN.replace('failed twice', 'failed thrice') });
  assert.equal(edited.length, 1);
  assert.match(edited[0].what, /lost or altered a line it had at the base/);
  assert.deepEqual(runWork({ [`${PACK}provenance/doing-thing.md`]: BORN + REWORDED }), []);
});

test('provenance-change-recorded: a deleted carrier\'s file ends with retired, or the change is refused', () => {
  const withoutRule = { [`${PACK}RULES.md`]: '- **Doing another** — plainly.\n  (doing-another)\n' };
  const refused = runWork(withoutRule);
  assert.equal(refused.length, 1, JSON.stringify(refused, null, 2));
  assert.match(refused[0].what, /rule "Doing a thing" is gone from .*mypack in this change, and its file's last entry is not retired/);
  assert.equal(refused[0].file, `${PACK}provenance/doing-thing.md`);
  assert.deepEqual(runWork({ ...withoutRule, [`${PACK}provenance/doing-thing.md`]: `${BORN}\n## 2026-09-01 · retired · superseded by the canon\n- **Actor:** @x (owner).\n` }), []);
});

test('provenance-change-recorded: a pack with no provenance folder at the base is the marking pass\'s, and owes nothing', () => {
  const unmarked = Object.fromEntries(Object.entries(filled).filter(([k]) => !k.includes('/provenance/')));
  const base = { ...unmarked, [`${PACK}RULES.md`]: '- **Doing a thing** — the settled way.\n\n- **Doing another** — plainly.\n' };
  assert.deepEqual(runWork(clean, base), [], 'markers, bodies and empty files arriving together owe no entry');
});

test('provenance-change-recorded: inert on the default branch and outside pack directories', () => {
  const root = makeRepo({ base: filled, changed: { 'src/app.js': 'y\n' } });
  try { assert.deepEqual(runRule(workRule, buildContext({ root })), []); } finally { cleanup(root); }
});
