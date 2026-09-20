import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { removeTree } from '../../../engine/remove-tree.mjs';
import {
  parseEntries, elementStatus, entryFaults, renderEntry, appendedText, parseEntryText,
  ruleBlocks, normalizeRuleText, skillShape, packCarriers, provenanceFiles, packDirsIn, auditPack,
  proposeSlug, withBody, markPack, parseReferencesDoc, convertReferences, reduceText, reduceFile, checkoutIo,
  KINDS, MECHANISM_KINDS, FIELDS, PACK_ELEMENT, DECLINED_FILE, elementIdOf,
} from '../../../engine/checks/helpers/provenance.mjs';

const repo = (files) => {
  const root = mkdtempSync(join(tmpdir(), 'claudinite-provenance-'));
  for (const [p, c] of Object.entries(files)) {
    mkdirSync(dirname(join(root, p)), { recursive: true });
    writeFileSync(join(root, p), c);
  }
  return root;
};

const BORN = `## 2026-07-18 · born · promoted from a member's local pack (#319)
- **Source:** the member's own site rule matched a lookalike host.
- **Reason:** \`hostSuffix\` is a raw string suffix, so \`example.com\` also matches
  \`evilexample.com\`.
- **Actor:** the growth-promote run, merged by @missingbulb (owner).
- **Mechanism:** prose. The signature is not the violation.
- **Retire when:** Chrome documents \`hostSuffix\` as label-bounded.
- **Landed:** #319 · pack version 1.
`;
const REWORDED = `
## 2026-07-27 · reworded · the corpus-wide pass (#467)
- **Actor:** @missingbulb (owner).
- **Landed:** #467 · pack version 1.
`;

// --- the grammar ----------------------------------------------------------------

test('parseEntries reads entries, joins continuation lines, and keeps dates in order', () => {
  const { entries, errors } = parseEntries(BORN + REWORDED);
  assert.deepEqual(errors, []);
  assert.equal(entries.length, 2);
  assert.equal(entries[0].kind, 'born');
  assert.equal(entries[0].date, '2026-07-18');
  assert.match(entries[0].fields.Reason, /also matches `evilexample\.com`\.$/);
  assert.deepEqual(entries[0].order, ['Source', 'Reason', 'Actor', 'Mechanism', 'Retire when', 'Landed']);
  assert.equal(elementStatus(entries), 'live');
  assert.deepEqual(entryFaults(entries), []);
});

test('parseEntries reports every grammar fault at its line, and a retired last entry retires the element', () => {
  const text = `# header\n${BORN}\n## 2026-07-01 · sideways · earlier\n- **Vibe:** good\n- **Reason:**\nloose text\n## 2026-08-01 · retired · gone\n- **Actor:** @x (owner).\n`;
  const { entries, errors } = parseEntries(text);
  const whats = errors.map((e) => `${e.line}: ${e.what}`);
  assert.ok(whats.some((w) => w.startsWith('1: text outside an entry')), whats.join('\n'));
  assert.ok(whats.some((w) => /"sideways" is not in the vocabulary/.test(w)));
  assert.ok(whats.some((w) => /dated 2026-07-01 follows one dated 2026-07-18/.test(w)));
  assert.ok(whats.some((w) => /field "Vibe" is not in the vocabulary/.test(w)));
  assert.ok(whats.some((w) => /field "Reason" is empty/.test(w)));
  assert.ok(whats.some((w) => /neither a "- \*\*Field:\*\* …" bullet nor an indented continuation/.test(w)));
  assert.equal(elementStatus(entries), 'retired');
});

test('entryFaults: a file opens with born, and a mechanism-bearing kind carries Mechanism', () => {
  const { entries } = parseEntries(`## 2026-07-01 · moved · into a skill\n- **Actor:** @x (owner).\n`);
  const faults = entryFaults(entries).map((f) => f.what);
  assert.ok(faults.some((w) => /opens with born/.test(w)), faults.join('\n'));
  assert.ok(faults.some((w) => /moved entry carries no Mechanism/.test(w)));
  for (const k of MECHANISM_KINDS) assert.ok(KINDS.includes(k));
});

test('appendedText validates the entry against the vocabulary and the file, then appends after the last entry', () => {
  const ok = appendedText(BORN, { date: '2026-07-27', kind: 'reworded', title: 'the pass (#467)', fields: { Actor: '@missingbulb (owner)', Landed: '#467' } });
  assert.deepEqual(ok.problems, []);
  assert.ok(ok.text.startsWith(BORN));
  assert.match(ok.text, /\n\n## 2026-07-27 · reworded · the pass \(#467\)\n- \*\*Actor:\*\* @missingbulb \(owner\)\n- \*\*Landed:\*\* #467\n$/);
  const { entries, errors } = parseEntries(ok.text);
  assert.deepEqual(errors, []);
  assert.equal(entries.length, 2);

  const empty = appendedText('', { date: '2026-07-01', kind: 'born', title: 'x', fields: { Mechanism: 'prose' } });
  assert.deepEqual(empty.problems, []);
  assert.equal(empty.text, '## 2026-07-01 · born · x\n- **Mechanism:** prose\n');

  const bad = appendedText(BORN, { date: '2026-07-01', kind: 'converted', title: 'x', fields: { Vibe: 'ok' } });
  assert.ok(bad.problems.some((p) => /appended in date order/.test(p)), bad.problems.join('\n'));
  assert.ok(bad.problems.some((p) => /converted entry carries Mechanism/.test(p)));
  assert.ok(bad.problems.some((p) => /field "Vibe"/.test(p)));
  assert.ok(appendedText('', { date: '2026-07-01', kind: 'reworded', title: 'x', fields: {} }).problems.some((p) => /first entry of a file is born/.test(p)));
  assert.ok(appendedText(`${BORN}\n## 2026-08-01 · retired · gone\n- **Actor:** @x (owner).\n`, { date: '2026-09-01', kind: 'reworded', title: 'x', fields: {} }).problems.some((p) => /retired/.test(p)));
});

test('renderEntry omits empty fields and wraps a long field at the width with an indented continuation', () => {
  const text = renderEntry({ date: '2026-07-01', kind: 'born', title: 'x', fields: { Source: '', Mechanism: 'w '.repeat(70).trim(), Actor: null } });
  const lines = text.split('\n');
  assert.equal(lines[0], '## 2026-07-01 · born · x');
  assert.ok(!text.includes('Source') && !text.includes('Actor'));
  assert.ok(lines.slice(1).filter(Boolean).every((l) => Buffer.byteLength(l) <= 100));
  assert.ok(lines[2].startsWith('  w'));
  assert.deepEqual(parseEntries(text).errors, []);
});

test('parseEntryText reads one entry as the append command receives it, and refuses two or none', () => {
  const { entry, problems } = parseEntryText(BORN);
  assert.deepEqual(problems, []);
  assert.equal(entry.kind, 'born');
  assert.deepEqual(Object.keys(entry.fields), ['Source', 'Reason', 'Actor', 'Mechanism', 'Retire when', 'Landed']);
  assert.ok(parseEntryText(BORN + REWORDED).problems[0].includes('found 2'));
  assert.ok(parseEntryText('nothing').problems.length > 0);
  assert.equal(parseEntryText('## 2026-07-01 · declined · a candidate\n- **Reason:** no.\n').entry.kind, 'declined');
});

// --- carriers -------------------------------------------------------------------

const RULES = `# pack

- **Passing a path from a service worker** — resolve it against the worker's own URL,
  never a filesystem walk. (worker-absolute-paths)

- **Wanting import/export** — bundle it. (3)
  - a sub-bullet stays inside the block

- **Assembling a shared global** — do it once; the consequence clause says why.

## Second surface

- **Reading a worker value over CDP** — evaluate in the worker, never the page.
  (cdp-worker-value)
`;

test('ruleBlocks finds top-level bold bullets with their blocks, markers and retired numeric markers', () => {
  const blocks = ruleBlocks(RULES);
  assert.deepEqual(blocks.map((b) => b.trigger), ['Passing a path from a service worker', 'Wanting import/export', 'Assembling a shared global', 'Reading a worker value over CDP']);
  assert.deepEqual(blocks.map((b) => b.slug), ['worker-absolute-paths', null, null, 'cdp-worker-value']);
  assert.deepEqual(blocks.map((b) => b.numeric), [null, '3', null, null]);
  assert.equal(blocks[1].lastLine, 5, 'the marker sits at the end of the lead paragraph, before the nested list');
  assert.equal(ruleBlocks('- **Legacy** — marked after its list.\n  - item\n  - item (3)')[0].numeric, '3', 'a marker after the nested list is still read');
  assert.equal(ruleBlocks('- **Legacy** — marked after its list.\n  - item\n  - item (3)')[0].lastLine, 2);
  assert.equal(normalizeRuleText('- **A** — b   c. (x-y)'), '- **A** — b c.');
  assert.equal(normalizeRuleText('- **A** — b c.\n  (x-y)'), normalizeRuleText('- **A** — b   c. (3)'));
  assert.equal(blocks[1].text, '- **Wanting import/export** — bundle it. - a sub-bullet stays inside the block');
  assert.equal(ruleBlocks('- **Done** — it is (canon) and fine (see below).')[0].slug, null, 'an ordinary parenthetical is not a marker');
  assert.equal(ruleBlocks('- **Done** — cite (#1119).')[0].slug, null);
  const fenced = ruleBlocks('- **Appending** — write it so:\n\n```\n## 2026-01-01 · born · x\n- **Reason:** an example, not a rule\n```\n\n- **Next** — a real rule. (next-rule)\n');
  assert.deepEqual(fenced.map((b) => [b.trigger, b.slug]), [['Appending', null], ['Next', 'next-rule']], 'a bold bullet inside a fenced code block is an example, not a rule');
  assert.equal(ruleBlocks('- **Wanting a growth action** — declare a task here. (RULES-14)')[0].numeric, '14', 'the RULES-n spelling of a numeric marker');
  assert.equal(ruleBlocks('- **Suffixed** — cited so. (2a)')[0].numeric, '2a');
  const plain = ruleBlocks('- See a test fail before you trust it: write it red first. (1)\n- **Never test that a value is set.** A test that reads a value someone declared. (2)\n  - a sub-bullet\n- Before trusting a new transform, run it over the real corpus.\n', { plainBullets: true });
  assert.deepEqual(plain.map((b) => [b.trigger, b.numeric]), [
    ['See a test fail before you trust it', '1'],
    ['Never test that a value is set.', '2'],
    ['Before trusting a new transform, run it over', null],
  ], 'with plainBullets a top-level bullet without a bold lead-in is a rule, triggered by its opening words');
  assert.equal(ruleBlocks('- See a test fail before you trust it. (1)\n').length, 0, 'without plainBullets a plain bullet is not a rule');
});

test('skillShape reads the declared body and proposes one from the shape', () => {
  const guidelines = '---\nname: g\nmetadata:\n  body: guidelines\n---\n\n# g\n\n- **Doing X** — do it. (doing-x)\n- **Doing Y** — do it.\n';
  const g = skillShape(guidelines);
  assert.equal(g.body, 'guidelines');
  assert.equal(g.proposed, 'guidelines');
  assert.equal(g.bullets.length, 2);
  assert.equal(g.bodyOffset, 5);
  const workflow = '---\nname: w\n---\n\n1. First do this.\n2. Then that.\n\n- **A gotcha** — mind it.\n';
  const w = skillShape(workflow);
  assert.equal(w.body, null);
  assert.equal(w.proposed, 'workflow');
  assert.equal(skillShape('# no frontmatter\n\n- **Only bullets** — here.\n').proposed, 'guidelines');
  assert.equal(skillShape('# prose only\n\nJust text.\n').proposed, 'workflow');
});

const PACK = {
  'packs/alpha/pack.mjs': 'export default { version: 1 };\n',
  'packs/alpha/RULES.md': RULES,
  'packs/alpha/skills/g/SKILL.md': '---\nname: g\nmetadata:\n  body: guidelines\n---\n\n- **Doing X** — do it. (doing-x)\n- **Doing Y** — do it. (7)\n',
  'packs/alpha/skills/w/SKILL.md': '---\nname: w\nmetadata:\n  body: workflow\n---\n\n1. First.\n\n- **A gotcha** — mind it. (2)\n- **Another** — marked anyway. (stray-marker)\n',
  'packs/alpha/skills/nobody/SKILL.md': '---\nname: nobody\n---\n\n- **Unmarked guideline** — do it.\n',
  'packs/alpha/worldRules/coded.mjs': "const rule = { id: 'cer/coded-check', severity: 'blocking' };\nexport default rule;\n",
  'packs/alpha/worldRules/coded.test.mjs': "const rule = { id: 'not-a-rule' };\n",
  'packs/alpha/declared-checks.json': '[{ "id": "declared-check", "severity": "advisory" }]\n',
  'packs/alpha/tasks/store-release/task.json': '{}\n',
  'packs/alpha/provenance/worker-absolute-paths.md': BORN,
  'packs/alpha/provenance/cdp-worker-value.md': '',
  'packs/alpha/provenance/orphan.md': BORN,
  'packs/alpha/provenance/retired-one.md': `${BORN}\n## 2026-08-01 · retired · gone\n- **Actor:** @x (owner).\n`,
  'packs/alpha/provenance/_pack.md': '',
  'packs/alpha/provenance/_declined.md': '## 2026-08-01 · declined · a candidate\n- **Reason:** it restated a canon rule.\n- **Actor:** @x (owner).\n',
  'packs/alpha/references.md': '- **(RULES-3)** Bundle because the browser refuses bare imports. Retire if Chrome loads bare specifiers.\n',
};

test('packCarriers enumerates rules, guidelines, skills with bodies, checks by id, tasks and the manifest', () => {
  const root = repo(PACK);
  try {
    const c = packCarriers('packs/alpha', checkoutIo(root));
    assert.deepEqual(c.rules.map((r) => [r.line, r.lastLine, r.slug]), [[3, 4, 'worker-absolute-paths'], [6, 6, null], [9, 9, null], [13, 14, 'cdp-worker-value']]);
    assert.deepEqual(c.guidelines.map((g) => [g.skill, g.line, g.slug, g.numeric]), [['g', 7, 'doing-x', null], ['g', 8, null, '7']]);
    assert.deepEqual(c.skills.map((s) => [s.name, s.body, s.proposed]), [['g', 'guidelines', 'guidelines'], ['nobody', null, 'guidelines'], ['w', 'workflow', 'workflow']]);
    assert.deepEqual(c.checks.map((x) => x.id), ['cer/coded-check', 'declared-check'], 'a test module is not a rule module');
    assert.deepEqual(c.tasks.map((t) => t.id), ['store-release']);
    assert.equal(c.manifest, true);
    assert.equal(elementIdOf('cer/coded-check'), 'cer-coded-check');
    const files = provenanceFiles('packs/alpha', checkoutIo(root));
    assert.deepEqual([...files.keys()].sort(), ['_pack', 'cdp-worker-value', 'orphan', 'retired-one', 'worker-absolute-paths'], 'the declined log is not an element');
    assert.equal(files.get('retired-one').status, 'retired');
    assert.equal(files.get('cdp-worker-value').empty, true);
  } finally { removeTree(root); }
});

test('packDirsIn reads pack directories off a file list under both roots', () => {
  assert.deepEqual(packDirsIn(['packs/a/RULES.md', 'packs/a/skills/x/SKILL.md', '.claudinite/local/packs/b/pack.mjs', 'packs/README.md', 'src/x.js', 'packs/directory.GENERATED.md']),
    ['.claudinite/local/packs/b', 'packs/a']);
});

test('auditPack reports every fact the integrity check judges, and nothing a clean pack lacks', () => {
  const root = repo(PACK);
  try {
    const a = auditPack('packs/alpha', checkoutIo(root));
    assert.deepEqual(a.unmarked.map((u) => u.trigger), ['Wanting import/export', 'Assembling a shared global', 'Doing Y']);
    assert.deepEqual(a.dangling.map((d) => [d.carrier, d.id, d.retired]).sort(), [
      ['check cer/coded-check', 'cer-coded-check', false], ['check declared-check', 'declared-check', false],
      ['guideline "Doing X"', 'doing-x', false], ['skill g', 'g', false], ['skill nobody', 'nobody', false], ['skill w', 'w', false],
      ['task store-release', 'store-release', false],
    ].sort());
    assert.deepEqual(a.unnamed.map((u) => u.id), ['orphan'], 'a retired file no carrier names is not a fault');
    assert.deepEqual(a.noBody.map((n) => n.skill), ['nobody']);
    assert.deepEqual(a.markerInWorkflow.map((m) => m.slug), ['stray-marker']);
    assert.deepEqual(a.empty.map((e) => e.id).sort(), ['_pack', 'cdp-worker-value']);
    assert.deepEqual(a.parseErrors, []);
    assert.deepEqual(a.entryFaults, []);
    assert.equal(a.referencesDoc, 'packs/alpha/references.md');
  } finally { removeTree(root); }
});

// --- the codemods ---------------------------------------------------------------

test('proposeSlug makes two to four hyphenated words from a lead-in, unique within the pack', () => {
  assert.equal(proposeSlug('Passing a path from a service worker'), 'passing-path-service');
  assert.equal(proposeSlug('Wanting `import`/`export` in extension code'), 'wanting-import-export');
  assert.equal(proposeSlug('Storing a token'), 'storing-token');
  assert.equal(proposeSlug('Optimising'), 'optimising-rule');
  assert.equal(proposeSlug('Storing a token', new Set(['storing-token'])), 'storing-token-2');
  assert.match(proposeSlug('A 403 on the way in'), /^[a-z][a-z0-9]*(?:-[a-z0-9]+)+$/);
});

test('withBody puts the body under metadata, creating the block where the frontmatter has none', () => {
  assert.equal(withBody('---\nname: x\nmetadata:\n  force-load-on-file-edits-paths:\n    - "a/**"\n---\n# x\n', 'workflow'),
    '---\nname: x\nmetadata:\n  body: workflow\n  force-load-on-file-edits-paths:\n    - "a/**"\n---\n# x\n');
  assert.equal(withBody('---\nname: x\n---\n# x\n', 'guidelines'), '---\nname: x\nmetadata:\n  body: guidelines\n---\n# x\n');
  assert.equal(withBody('# x\n', 'workflow'), '---\nmetadata:\n  body: workflow\n---\n# x\n');
  assert.equal(skillShape(withBody('# x\n\n- **A** — b.\n', 'guidelines')).body, 'guidelines');
});

test('markPack marks every unmarked rule and guideline, declares every body, creates every missing file — and does nothing twice', () => {
  const root = repo(PACK);
  try {
    const io = checkoutIo(root);
    const report = markPack('packs/alpha', io);
    const rules = readFileSync(join(root, 'packs/alpha/RULES.md'), 'utf8');
    assert.match(rules, /bundle it\. \(wanting-import-export\)\n  - a sub-bullet/, 'the marker replaces the numeric one on the block\'s last line');
    assert.match(rules, /says why\.\n  \(assembling-shared-global\)\n/, 'a marker the line cannot hold within the width takes a continuation line');
    assert.match(rules, /\(worker-absolute-paths\)\n/, 'a marked rule is untouched');
    const g = readFileSync(join(root, 'packs/alpha/skills/g/SKILL.md'), 'utf8');
    assert.match(g, /Doing Y\*\* — do it\. \(doing-y\)\n/);
    const nobody = readFileSync(join(root, 'packs/alpha/skills/nobody/SKILL.md'), 'utf8');
    assert.match(nobody, /^---\nname: nobody\nmetadata:\n  body: guidelines\n---\n/);
    assert.match(nobody, /\(unmarked-guideline\)\n/, 'a skill whose body is proposed as guidelines has its bullets marked in the same pass');
    const w = readFileSync(join(root, 'packs/alpha/skills/w/SKILL.md'), 'utf8');
    assert.ok(!/\(a-gotcha\)/.test(w) && /\(2\)/.test(w), 'a workflow skill\'s bullets are not marked and its numeric marker is the conversion\'s to remove');
    for (const f of ['wanting-import-export', 'assembling-shared-global', 'doing-y', 'unmarked-guideline', 'g', 'w', 'nobody', 'cer-coded-check', 'declared-check', 'store-release']) {
      assert.ok(existsSync(join(root, `packs/alpha/provenance/${f}.md`)), `${f}.md created`);
      assert.equal(readFileSync(join(root, `packs/alpha/provenance/${f}.md`), 'utf8'), '', 'created empty — history is the backfill\'s');
    }
    assert.equal(readFileSync(join(root, 'packs/alpha/provenance/worker-absolute-paths.md'), 'utf8'), BORN, 'an existing file is untouched');
    assert.ok(report.some((l) => /"Wanting import\/export" marked \(wanting-import-export\) - numeric marker \(3\) replaced/.test(l)), report.join('\n'));
    assert.ok(report.some((l) => /nobody\/SKILL\.md: body: guidelines proposed/.test(l)));

    const after = auditPack('packs/alpha', io);
    assert.deepEqual(after.unmarked, []);
    assert.deepEqual(after.noBody, []);
    assert.deepEqual(after.dangling, []);
    assert.deepEqual(markPack('packs/alpha', io), [], 'idempotent');
    assert.equal(readFileSync(join(root, 'packs/alpha/RULES.md'), 'utf8'), rules);
  } finally { removeTree(root); }
});

test('markPack puts a marker that would pass the width on a continuation line of its own', () => {
  const long = `- **A long rule** — ${'word '.repeat(10)}ends here at the width.`;
  assert.ok(Buffer.byteLength(long) > 80 && Buffer.byteLength(long) < 100);
  const root = repo({ 'packs/p/pack.mjs': 'export default {};\n', 'packs/p/RULES.md': `${long}\n` });
  try {
    markPack('packs/p', checkoutIo(root));
    const rules = readFileSync(join(root, 'packs/p/RULES.md'), 'utf8').split('\n');
    assert.equal(rules[0], long);
    assert.equal(rules[1], '  (long-rule)');
    assert.equal(ruleBlocks(rules.join('\n'))[0].slug, 'long-rule');
    assert.ok(rules.every((l) => Buffer.byteLength(l) <= 100));
  } finally { removeTree(root); }
});

test('parseReferencesDoc reads RULES-n, <skill>-n, check: and task: keys with their continuation lines', () => {
  const refs = parseReferencesDoc('# refs\n\n- **(RULES-3)** First reason,\n  continued. Retire when X.\n- **(writing-tests-2)** A skill reason.\n- **(check:cer/coded-check)** Why the check.\n- **(weird)** Unknown.\n- **(task:nightly)** Why the task.\n- **(RULES-2a)** A suffixed key.\n');
  assert.deepEqual(refs.map((r) => [r.kind, r.kind === 'rule' ? r.n : r.target ?? null]), [['rule', '3'], ['skill', 'writing-tests'], ['check', 'cer/coded-check'], ['unknown', null], ['task', 'nightly'], ['rule', '2a']]);
  assert.equal(refs[0].text, 'First reason, continued. Retire when X.');
  assert.equal(refs[1].target, 'writing-tests');
  assert.equal(refs[1].n, '2');
});

test('convertReferences writes each entry onto the element its key names, rewrites the numeric markers, and deletes the doc', () => {
  const files = {
    ...PACK,
    'packs/alpha/references.md': [
      '- **(RULES-3)** Bundle because the browser refuses bare imports. Retire if Chrome loads bare specifiers.',
      '- **(g-7)** Y matters for the second reason.',
      '- **(w-2)** The gotcha bit twice (#12).',
      '- **(check:cer/coded-check)** The check exists because hand review missed it.',
      '- **(check:gone)** A check that is gone.',
      '- **(RULES-9)** Cited by nothing.',
    ].join('\n') + '\n',
  };
  const root = repo(files);
  try {
    const io = checkoutIo(root);
    const report = convertReferences('packs/alpha', io, { dateOf: (key) => (key === 'RULES-3' ? '2026-06-01' : null), today: '2026-09-21' });
    const rules = readFileSync(join(root, 'packs/alpha/RULES.md'), 'utf8');
    assert.match(rules, /bundle it\. \(wanting-import-export\)\n/, 'the numeric marker became the slug');
    const rule = readFileSync(join(root, 'packs/alpha/provenance/wanting-import-export.md'), 'utf8');
    assert.match(rule, /^## 2026-06-01 · born · converted from references\.md \(RULES-3\)\n/, 'dated by the adding commit where the caller knows it');
    assert.match(rule, /- \*\*Reason:\*\* Bundle because the browser refuses bare imports\.\n/);
    assert.match(rule, /- \*\*Mechanism:\*\* prose\n/);
    assert.match(rule, /- \*\*Retire when:\*\* Retire if Chrome loads bare specifiers\.\n/);
    const g = readFileSync(join(root, 'packs/alpha/skills/g/SKILL.md'), 'utf8');
    assert.match(g, /do it\. \(doing-y\)\n/);
    const guideline = readFileSync(join(root, 'packs/alpha/provenance/doing-y.md'), 'utf8');
    assert.match(guideline, /^## 2026-09-21 · born · converted from references\.md \(g-7\), dated by the conversion\n/, 'dated by the conversion where git is not there to read');
    assert.match(guideline, /Mechanism:\*\* prose, a guideline of the g skill/);
    const w = readFileSync(join(root, 'packs/alpha/skills/w/SKILL.md'), 'utf8');
    assert.match(w, /mind it\.\n/, 'a workflow step loses its numeric marker and gains no slug');
    const skill = readFileSync(join(root, 'packs/alpha/provenance/w.md'), 'utf8');
    assert.match(skill, /· born · converted from references\.md \(w-2\), dated by the conversion: "A gotcha"\n/);
    assert.match(skill, /Mechanism:\*\* a step of the w skill, a workflow/);
    const check = readFileSync(join(root, 'packs/alpha/provenance/cer-coded-check.md'), 'utf8');
    assert.match(check, /Mechanism:\*\* a check/);
    assert.ok(!existsSync(join(root, 'packs/alpha/references.md')), 'the doc is deleted');
    assert.ok(report.some((l) => /check:gone names no check the pack carries - dropped/.test(l)), report.join('\n'));
    assert.ok(report.some((l) => /RULES-9 cited by no rule - dropped/.test(l)));
    assert.deepEqual(convertReferences('packs/alpha', io), [], 'nothing to convert twice');
    for (const f of ['wanting-import-export', 'doing-y', 'w', 'cer-coded-check']) assert.deepEqual(parseEntries(readFileSync(join(root, `packs/alpha/provenance/${f}.md`), 'utf8')).errors, []);
  } finally { removeTree(root); }
});

test('convertReferences over an io that cannot delete leaves the doc and says so', () => {
  const root = repo(PACK);
  try {
    const { remove, ...io } = checkoutIo(root);
    const report = convertReferences('packs/alpha', io, { today: '2026-09-21' });
    assert.ok(existsSync(join(root, 'packs/alpha/references.md')));
    assert.ok(report.some((l) => /this io cannot delete a file/.test(l)));
  } finally { removeTree(root); }
});

test('a second entry on one element from a second key is strengthened, never a second born', () => {
  const root = repo({
    'packs/p/pack.mjs': 'export default {};\n',
    'packs/p/RULES.md': '- **Doing X** — twice cited. (3, 7)\n',
    'packs/p/references.md': '- **(RULES-3)** First.\n- **(RULES-7)** Second.\n',
  });
  try {
    convertReferences('packs/p', checkoutIo(root), { today: '2026-09-21' });
    const text = readFileSync(join(root, 'packs/p/provenance/doing-x.md'), 'utf8');
    const { entries, errors } = parseEntries(text);
    assert.deepEqual(errors, []);
    assert.deepEqual(entries.map((e) => e.kind), ['born', 'strengthened']);
    assert.match(readFileSync(join(root, 'packs/p/RULES.md'), 'utf8'), /twice cited\. \(doing-x\)\n$/);
  } finally { removeTree(root); }
});

test('the RULES-n marker spelling, a suffixed key, a task key and a guidelines skill\'s plain bullets all convert', () => {
  const root = repo({
    'packs/p/pack.mjs': 'export default {};\n',
    'packs/p/RULES.md': '- **Wanting a growth action** — declare it here. (RULES-14)\n\n- **Suffixed** — cited so. (2a)\n',
    'packs/p/tasks/nightly/task.json': '{}\n',
    'packs/p/skills/g/SKILL.md': '---\nname: g\nmetadata:\n  body: guidelines\n---\n\n- See a test fail before you trust it: red first. (1)\n',
    'packs/p/references.md': '- **(RULES-14)** Growth runs in every member.\n- **(RULES-2a)** The suffixed reason.\n- **(task:nightly)** Why the task runs nightly.\n- **(g-1)** A test that never failed proves nothing.\n',
  });
  try {
    const report = convertReferences('packs/p', checkoutIo(root), { today: '2026-09-21' });
    assert.ok(!report.some((l) => /dropped/.test(l)), report.join('\n'));
    const rules = readFileSync(join(root, 'packs/p/RULES.md'), 'utf8');
    assert.match(rules, /declare it here\. \(wanting-growth-action\)\n/);
    assert.match(rules, /cited so\. \(suffixed-rule\)\n/);
    assert.match(readFileSync(join(root, 'packs/p/provenance/nightly.md'), 'utf8'), /Mechanism:\*\* a task/);
    const g = readFileSync(join(root, 'packs/p/skills/g/SKILL.md'), 'utf8');
    assert.match(g, /red first\. \(see-test-fail\)\n/, 'a guidelines skill\'s plain bullet is marked like any rule');
    assert.match(readFileSync(join(root, 'packs/p/provenance/see-test-fail.md'), 'utf8'), /A test that never failed proves nothing/);
  } finally { removeTree(root); }
});

test('a converted entry\'s relative links gain the ../ that keeps them resolving from provenance/', () => {
  const root = repo({
    'packs/p/pack.mjs': 'export default {};\n',
    'packs/p/RULES.md': '- **Doing X** — see the doc. (3)\n',
    'packs/p/references.md': '- **(RULES-3)** The method is [extracting-lessons.md](extracting-lessons.md); the issue is [#12](https://example.com/12) and the anchor [here](#x).\n',
  });
  try {
    convertReferences('packs/p', checkoutIo(root), { today: '2026-09-21' });
    const text = readFileSync(join(root, 'packs/p/provenance/doing-x.md'), 'utf8');
    assert.match(text, /\[extracting-lessons\.md\]\(\.\.\/extracting-lessons\.md\)/);
    assert.match(text, /\[#12\]\(https:\/\/example\.com\/12\)/, 'an absolute URL is untouched');
    assert.match(text, /\[here\]\(#x\)/, 'an anchor is untouched');
  } finally { removeTree(root); }
});

// --- the reduction ----------------------------------------------------------------

test('reduceText drops session ids and quotes everywhere, and handles and member locators only for a public canon', () => {
  const line = '- **Source:** capture 2026-07-19T0940Z--pr-1583--session_015XqD4qgydLhYHbkay4axrW: the owner said "unless we have a trigger that covers it, move them back" on owner/repo#12; @missingbulb (owner) decided.';
  const priv = reduceText(line, { publicCanon: false });
  assert.ok(!priv.includes('session_015'), priv);
  assert.ok(priv.includes('a capture'));
  assert.ok(priv.includes('(quote dropped)') && !priv.includes('move them back'));
  assert.ok(priv.includes('owner/repo#12') && priv.includes('@missingbulb (owner)'), 'a private canon keeps handles and locators');
  const pub = reduceText(line, { publicCanon: true });
  assert.ok(pub.includes('the owner decided') && !pub.includes('@missingbulb'));
  assert.ok(pub.includes('a member repository') && !pub.includes('owner/repo#12'));
  assert.equal(reduceText('- **Model:** Claude Fable 5.1, per the trailer.', { publicCanon: true }), '- **Model:** Claude Fable 5.1, per the trailer.');
  assert.match(reduceFile(BORN, { publicCanon: true }), /^## 2026-07-18 · born · promoted from a member's local pack \(#319\)\n/);
});

test('the vocabulary is what the design states', () => {
  assert.deepEqual([...FIELDS], ['Source', 'Reason', 'Actor', 'Model', 'Mechanism', 'Rejected', 'Retire when', 'Landed']);
  assert.equal(PACK_ELEMENT, '_pack');
  assert.equal(DECLINED_FILE, '_declined.md');
});
