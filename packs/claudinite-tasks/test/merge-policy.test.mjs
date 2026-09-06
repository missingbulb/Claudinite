import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { removeTree } from '../../../engine/remove-tree.mjs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  normalizePolicy, policyExpression, policyVerdict, removalsOnly, trimsOnly, changeKindOf,
  compileDeclaredRule, declaredMergeRules, AUTOMERGE_TRAILER_RE,
} from '../merge-policy.mjs';

// --- entry builders -----------------------------------------------------------

const added = (file, after = 'x\n') => ({ file, before: null, after });
const deleted = (file, before = 'x\n') => ({ file, before, after: null });
const edited = (file, before, after) => ({ file, before, after });

// --- normalizePolicy ----------------------------------------------------------

test('normalizePolicy: the two whole-policy words, and absence as nothing', () => {
  assert.equal(normalizePolicy('nothing').kind, 'nothing');
  assert.equal(normalizePolicy(null).kind, 'nothing');
  assert.equal(normalizePolicy('anything').kind, 'anything');
});

test('normalizePolicy: the queue\'s legacy spellings resolve to the narrow-diff composite', () => {
  for (const legacy of ['if-narrow', 'yes', 'true']) {
    const norm = normalizePolicy(legacy);
    assert.equal(norm.kind, 'rules');
    assert.ok(norm.allow.includes('comment-only-changes'), `${legacy} expands the composite`);
    assert.ok(norm.allow.includes('single-folder-code-changes'));
  }
});

test('normalizePolicy: semicolon strings and arrays parse alike, rejects split out', () => {
  const fromString = normalizePolicy('doc-changes;reject:js-code-changes');
  const fromArray = normalizePolicy(['doc-changes', 'reject:js-code-changes']);
  assert.deepEqual(fromString, fromArray);
  assert.deepEqual(fromString.allow, ['doc-changes']);
  assert.deepEqual(fromString.reject, ['js-code-changes']);
});

test('normalizePolicy: a list with no allow term is invalid, not "anything except"', () => {
  assert.equal(normalizePolicy(['reject:js-code-changes']).kind, 'invalid');
  // The intended spelling works.
  const norm = normalizePolicy(['anything', 'reject:js-code-changes']);
  assert.equal(norm.kind, 'rules');
  assert.deepEqual(norm.allow, ['anything']);
});

test('normalizePolicy: malformed terms, nothing-in-a-list, and reject-of-a-composite are invalid', () => {
  assert.equal(normalizePolicy('Doc_Changes').kind, 'invalid');
  assert.equal(normalizePolicy(['doc-changes', 'nothing']).kind, 'invalid');
  assert.equal(normalizePolicy(['anything', 'reject:narrow-diff']).kind, 'invalid');
});

test('policyExpression round-trips the array form into the trailer/CLI string', () => {
  assert.equal(policyExpression(['a-b', 'reject:c-d']), 'a-b;reject:c-d');
  assert.equal(policyExpression('anything'), 'anything');
  assert.deepEqual(normalizePolicy(policyExpression(['doc-changes'])), normalizePolicy(['doc-changes']));
});

// --- removalsOnly -------------------------------------------------------------

test('removalsOnly: removals pass, additions and reorders do not, deletion is all-removals', () => {
  assert.equal(removalsOnly('a\nb\nc\n', 'a\nc\n'), true);
  assert.equal(removalsOnly('a\nb\n', 'a\nb\nc\n'), false);
  assert.equal(removalsOnly('a\nb\n', 'b\na\n'), false, 'a reorder is an edit, not a removal');
  assert.equal(removalsOnly('a\n', null), true);
  assert.equal(removalsOnly(null, 'a\n'), false);
});

test('changeKindOf reads the null side', () => {
  assert.equal(changeKindOf(added('f')), 'added');
  assert.equal(changeKindOf(deleted('f')), 'deleted');
  assert.equal(changeKindOf(edited('f', 'a', 'b')), 'modified');
});

// --- policyVerdict: whole policies -------------------------------------------

test('policyVerdict: nothing never merges, anything always does', () => {
  const entries = [added('src/a.mjs')];
  assert.equal(policyVerdict({ policy: 'nothing', entries }).mergeable, false);
  assert.equal(policyVerdict({ policy: 'anything', entries }).mergeable, true);
});

test('policyVerdict: an empty diff is not mergeable under a rule list', () => {
  const v = policyVerdict({ policy: ['doc-changes'], entries: [] });
  assert.equal(v.mergeable, false);
  assert.match(v.why, /changes nothing/);
});

test('policyVerdict: an unknown rule name fails closed and is named', () => {
  const v = policyVerdict({ policy: ['no-such-rule'], entries: [added('docs/a.md')] });
  assert.equal(v.mergeable, false);
  assert.match(v.why, /no-such-rule/);
});

test('policyVerdict: an invalid policy expression fails closed', () => {
  const v = policyVerdict({ policy: 'Doc Changes!!', entries: [added('docs/a.md')] });
  assert.equal(v.mergeable, false);
  assert.match(v.why, /invalid policy/);
});

// --- policyVerdict: built-in coverage -----------------------------------------

test('comment-only plus readme covers the improve-comments shape and nothing more', () => {
  const policy = ['comment-only-changes', 'readme-changes'];
  const ok = policyVerdict({
    policy,
    entries: [
      edited('src/a.mjs', 'let x = 1; // old\n', 'let x = 1; // better\n'),
      edited('packs/p/README.md', 'a\n', 'b\n'),
      added('README.md'),
    ],
  });
  assert.equal(ok.mergeable, true, ok.why);

  const codeSlipped = policyVerdict({
    policy,
    entries: [edited('src/a.mjs', 'let x = 1;\n', 'let x = 2;\n')],
  });
  assert.equal(codeSlipped.mergeable, false);
  assert.match(codeSlipped.why, /covered by no allow term/);

  const readmeDeleted = policyVerdict({ policy, entries: [deleted('README.md')] });
  assert.equal(readmeDeleted.mergeable, false, 'a README may be improved, never removed');
});

test('markdown-line-removals: pure removals and whole-file removals pass, growth fails', () => {
  const policy = ['markdown-line-removals'];
  assert.equal(policyVerdict({
    policy, entries: [edited('local/RULES.md', '- a\n- b\n- c\n', '- a\n- c\n')],
  }).mergeable, true);
  assert.equal(policyVerdict({ policy, entries: [deleted('local/RULES.md')] }).mergeable, true);
  assert.equal(policyVerdict({
    policy, entries: [edited('local/RULES.md', '- a\n', '- a\n- b\n')],
  }).mergeable, false);
  assert.equal(policyVerdict({
    policy, entries: [edited('src/a.mjs', 'a\nb\n', 'a\n')],
  }).mergeable, false, 'the rule is about markdown, not code');
});

test('generated-file-changes covers regenerated artifacts only', () => {
  const policy = ['generated-file-changes'];
  assert.equal(policyVerdict({
    policy, entries: [edited('x/usage.GENERATED.json', '{}', '{"a":1}')],
  }).mergeable, true);
  assert.equal(policyVerdict({
    policy, entries: [edited('x/usage.json', '{}', '{"a":1}')],
  }).mergeable, false);
});

test('file-additions covers new files and nothing else', () => {
  const policy = ['file-additions'];
  assert.equal(policyVerdict({ policy, entries: [added('src/new.mjs')] }).mergeable, true);
  assert.equal(policyVerdict({ policy, entries: [edited('src/old.mjs', 'a', 'b')] }).mergeable, false);
});

test('the single-folder constraint counts only the code files its own term covered', () => {
  const policy = ['doc-changes', 'comment-only-changes', 'single-folder-code-changes'];
  const oneDir = policyVerdict({
    policy,
    entries: [
      edited('src/a.mjs', 'x', 'y'),
      edited('src/b.mjs', 'x', 'y'),
      edited('docs/a.md', 'x', 'y'),
      edited('other/c.mjs', 'let x = 1; // a\n', 'let x = 1; // b\n'),
    ],
  });
  assert.equal(oneDir.mergeable, true, oneDir.why);

  const twoDirs = policyVerdict({
    policy,
    entries: [edited('src/a.mjs', 'x', 'y'), edited('other/b.mjs', 'x', 'y')],
  });
  assert.equal(twoDirs.mergeable, false);
  assert.match(twoDirs.why, /2 directories/);
});

test('single-file-code-changes bounds the diff to one real code file', () => {
  const policy = ['single-file-code-changes'];
  assert.equal(policyVerdict({ policy, entries: [edited('src/a.mjs', 'x', 'y')] }).mergeable, true);
  assert.equal(policyVerdict({
    policy, entries: [edited('src/a.mjs', 'x', 'y'), edited('src/b.mjs', 'x', 'y')],
  }).mergeable, false);
});

test('narrow-diff composes the historical narrow shape', () => {
  const v = policyVerdict({
    policy: 'narrow-diff',
    entries: [
      edited('docs/DESIGN.md', 'a', 'b'),
      added('packs/p/test/x.test.mjs'),
      edited('src/a.mjs', 'x', 'y'),
    ],
  });
  assert.equal(v.mergeable, true, v.why);
});

// --- policyVerdict: rejects and the self-widening guard -----------------------

test('a reject term vetoes a file every allow term covers — reject-any-JS works out of the box', () => {
  const v = policyVerdict({
    policy: ['anything', 'reject:javascript-changes'],
    entries: [edited('src/a.mjs', 'x', 'y')],
  });
  assert.equal(v.mergeable, false);
  assert.match(v.why, /reject:javascript-changes/);

  const docsOnly = policyVerdict({
    policy: ['anything', 'reject:javascript-changes'],
    entries: [edited('docs/a.md', 'x', 'y')],
  });
  assert.equal(docsOnly.mergeable, true, docsOnly.why);

  // The same veto works with a DECLARED rule — the extension mechanism.
  const cssRule = compileDeclaredRule({
    name: 'stylesheet-changes', pathMatching: '/\\.s?css$/',
    changeKinds: ['added', 'modified', 'deleted'], editShape: 'any',
  }, 'test');
  assert.equal(policyVerdict({
    policy: ['anything', 'reject:stylesheet-changes'],
    entries: [edited('app/site.css', 'x', 'y')],
    declaredRules: new Map([[cssRule.name, cssRule]]),
  }).mergeable, false);
});

test('a one-term allow-all list collapses to the whole anything policy', () => {
  assert.equal(normalizePolicy(['anything']).kind, 'anything');
});

test('no granular policy covers a change to the policy sources, comment-only excepted', () => {
  // 'anything' as an allow term beside a granular term keeps the policy granular,
  // so this is the widest coverage the guard must still beat.
  const widest = ['anything', 'reject:doc-changes'];
  for (const file of ['packs/p/merge-rules.json', 'packs/p/tasks/t/task.json',
    'packs/claudinite-tasks/merge-policy.mjs', 'packs/claudinite-tasks/workRules/automerge-policy-scope.mjs']) {
    const v = policyVerdict({ policy: widest, entries: [edited(file, 'a', 'b')] });
    assert.equal(v.mergeable, false, `${file} must not be coverable`);
    assert.match(v.why, /defines auto-merge policy/);
  }
  // Adding a NEW merge-rules.json is the same widening.
  assert.equal(policyVerdict({
    policy: ['file-additions'], entries: [added('local/packs/x/merge-rules.json')],
  }).mergeable, false);
  // A comment-only edit to a policy source cannot change what it declares.
  assert.equal(policyVerdict({
    policy: ['comment-only-changes'],
    entries: [edited('packs/claudinite-tasks/merge-policy.mjs', 'x(); // a\n', 'x(); // b\n')],
  }).mergeable, true);
  // The plain 'anything' policy — the trusted converge lane — is exempt.
  assert.equal(policyVerdict({
    policy: 'anything', entries: [edited('packs/p/tasks/t/task.json', 'a', 'b')],
  }).mergeable, true);
});

// --- declared rules -----------------------------------------------------------

test('compileDeclaredRule rejects unknown keys, missing editShape, and bad names', () => {
  assert.throws(() => compileDeclaredRule({
    name: 'x', pathMatching: '/a/', changeKinds: ['added'], editShape: 'any', typo: true,
  }, 't'), /not a merge-rule key/);
  assert.throws(() => compileDeclaredRule({
    name: 'x', pathMatching: '/a/', changeKinds: ['added'],
  }, 't'), /editShape/);
  assert.throws(() => compileDeclaredRule({
    name: 'Bad_Name', pathMatching: '/a/', changeKinds: ['added'], editShape: 'any',
  }, 't'), /kebab-case/);
  assert.throws(() => compileDeclaredRule({
    name: 'x', pathMatching: 'a', changeKinds: ['added'], editShape: 'any',
  }, 't'), /regex string/);
});

test('a declared removals-only rule composes path scope with edit shape', () => {
  const rule = compileDeclaredRule({
    name: 'local-pack-doc-removals',
    pathMatching: '/^\\.claudinite\\/local\\/packs\\/.*\\.md$/',
    changeKinds: ['modified', 'deleted'],
    editShape: 'removals-only',
  }, 't');
  assert.equal(rule.appliesTo(edited('.claudinite/local/packs/p/RULES.md', 'a\nb\n', 'a\n')), true);
  assert.equal(rule.appliesTo(edited('.claudinite/local/packs/p/RULES.md', 'a\n', 'a\nb\n')), false);
  assert.equal(rule.appliesTo(edited('docs/RULES.md', 'a\nb\n', 'a\n')), false);
  assert.equal(rule.appliesTo(added('.claudinite/local/packs/p/RULES.md')), false);
});

test('declaredMergeRules reads only active packs and reports collisions loudly', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'merge-rules-'));
  try {
    const mkPack = (id, specs) => {
      const dir = path.join(root, id);
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, 'merge-rules.json'), JSON.stringify(specs));
      return { id, dir };
    };
    const active = mkPack('alpha', [
      { name: 'alpha-docs', pathMatching: '/\\.md$/', changeKinds: ['modified'], editShape: 'any' },
      { name: 'doc-changes', pathMatching: '/x/', changeKinds: ['modified'], editShape: 'any' },
    ]);
    const inactive = mkPack('beta', [
      { name: 'beta-docs', pathMatching: '/\\.md$/', changeKinds: ['modified'], editShape: 'any' },
    ]);
    const { rules, errors } = declaredMergeRules([active, inactive], { packs: ['alpha'] });
    assert.ok(rules.has('alpha-docs'));
    assert.ok(!rules.has('beta-docs'), 'an undeclared pack contributes no merge rules');
    assert.ok(errors.some((e) => /doc-changes.*already taken/.test(e)), 'shadowing a built-in is an error');
  } finally {
    removeTree(root);
  }
});

test('usage-fold\'s delivery shape — the regenerated aggregate and nothing else — resolves on built-ins', async () => {
  const { default: usageFold } = await import('../tasks/usage-fold/task.json', { with: { type: 'json' } });
  const v = policyVerdict({
    policy: usageFold.automerge,
    entries: [edited('.claudinite/local/usage.GENERATED.json', '{}', '{"a":1}')],
  });
  assert.equal(v.mergeable, true, v.why);
  // Any second file — the .gitattributes line is adoption's now — parks the run.
  assert.equal(policyVerdict({
    policy: usageFold.automerge,
    entries: [
      edited('.claudinite/local/usage.GENERATED.json', '{}', '{"a":1}'),
      added('.gitattributes', 'x\n'),
    ],
  }).mergeable, false);
  // A regenerated file elsewhere in the repo is some other task's delivery.
  for (const file of ['packs/directory.GENERATED.md', '.claudinite/claudinite-rules.GENERATED.md']) {
    assert.equal(policyVerdict({
      policy: usageFold.automerge,
      entries: [edited(file, 'a\n', 'b\n')],
    }).mergeable, false, file);
  }
});

// --- the trims class and the mount exemption ----------------------------------

test('trimsOnly: line removals, in-line cuts, and a truncation reusing its period pass; growth and substitutions do not', () => {
  assert.equal(trimsOnly('- a long rule about x\n- b\n', '- a long rule\n- b\n'), true, 'a line cut short');
  assert.equal(trimsOnly('- aaa, bbb.\n', '- aaa.\n'), true, 'truncated, closed with the period the line already held');
  assert.equal(trimsOnly('- a\n- b\n- c\n', '- a\n- c\n'), true, 'whole-line removal');
  assert.equal(trimsOnly('- aaa, bbb\n', '- aaa.\n'), false, 'a period the line never held is an edit, not a trim');
  assert.equal(trimsOnly('- a\n', '- a (but wider)\n'), false, 'growth is never a trim');
  assert.equal(trimsOnly('- ab\n', '- ba\n'), false, 'a reorder of characters is an edit');
});

test('markdown-trims covers a prune that cuts a line down, where markdown-line-removals parks it', () => {
  const entries = [edited('x/RULES.md', '- keep\n- a rule, stated too widely.\n', '- keep\n- a rule.\n')];
  assert.equal(policyVerdict({ policy: ['markdown-trims'], entries }).mergeable, true);
  assert.equal(policyVerdict({ policy: ['markdown-line-removals'], entries }).mergeable, false);
});

test('coversMountPolicySources exempts vendored policy files only, and only for the flagged rule', () => {
  const mountRule = compileDeclaredRule({
    name: 'mount-refresh', pathMatching: '/^\\.claudinite\\/shared\\//',
    changeKinds: ['added', 'modified', 'deleted'], editShape: 'any',
    coversMountPolicySources: true,
  }, 't');
  const declaredRules = new Map([[mountRule.name, mountRule]]);
  const mountTask = edited('.claudinite/shared/packs/p/merge-policy.mjs', 'a\n', 'b\n');

  assert.equal(policyVerdict({ policy: ['mount-refresh'], entries: [mountTask], declaredRules }).mergeable, true);
  // Without the flag the same coverage is refused…
  const plainRule = compileDeclaredRule({
    name: 'mount-plain', pathMatching: '/^\\.claudinite\\/shared\\//',
    changeKinds: ['added', 'modified', 'deleted'], editShape: 'any',
  }, 't');
  assert.equal(policyVerdict({
    policy: ['mount-plain'], entries: [mountTask], declaredRules: new Map([[plainRule.name, plainRule]]),
  }).mergeable, false);
  // …a generic built-in never gets it…
  assert.equal(policyVerdict({
    policy: ['file-additions'], entries: [added('.claudinite/shared/packs/p/tasks/t/task.json')],
  }).mergeable, false);
  // …and a REPO-OWNED policy source stays absolute even for the flagged rule.
  const rootRule = compileDeclaredRule({
    name: 'everything', pathMatching: '/./',
    changeKinds: ['added', 'modified', 'deleted'], editShape: 'any',
    coversMountPolicySources: true,
  }, 't');
  assert.equal(policyVerdict({
    policy: ['everything'], entries: [edited('packs/p/tasks/t/task.json', 'a\n', 'b\n')],
    declaredRules: new Map([[rootRule.name, rootRule]]),
  }).mergeable, false);
  // A reject term still vetoes an exempted file — the exemption is coverage, not immunity.
  assert.equal(policyVerdict({
    policy: ['mount-refresh', 'reject:javascript-changes'], entries: [mountTask], declaredRules,
  }).mergeable, false);
});

// --- the trailer --------------------------------------------------------------

test('the arming trailer parses out of a commit message, last line form', () => {
  const msg = 'Claudinite tidy: improve comments\n\nRefs #1.\n\nClaudinite-Automerge-Policy: comment-only-changes;readme-changes\n';
  const m = AUTOMERGE_TRAILER_RE.exec(msg);
  assert.ok(m);
  assert.equal(normalizePolicy(m[1]).kind, 'rules');
  assert.equal(AUTOMERGE_TRAILER_RE.exec('no trailer here'), null);
});

// --- the inline `under:<dir>` scope -------------------------------------------

test('under:<dir> covers every change kind inside the directory, and nothing outside it', () => {
  const policy = ['under:packs/claudinite-tasks'];
  const inside = policyVerdict({
    policy,
    entries: [
      edited('packs/claudinite-tasks/land-pr.mjs', 'a\n', 'b\n'),
      added('packs/claudinite-tasks/queue/new-thing.mjs'),
      deleted('packs/claudinite-tasks/queue/old-thing.mjs'),
    ],
  });
  assert.equal(inside.mergeable, true, inside.why);

  const strays = policyVerdict({
    policy,
    entries: [edited('packs/claudinite-tasks/land-pr.mjs', 'a\n', 'b\n'), edited('engine/remove-tree.mjs', 'a\n', 'b\n')],
  });
  assert.equal(strays.mergeable, false);
  assert.match(strays.why, /engine\/remove-tree\.mjs/);
});

test('under:<dir> matches on whole path segments, never on a name prefix', () => {
  const at = (file) => policyVerdict({ policy: ['under:packs/product-wiki'], entries: [edited(file, 'a\n', 'b\n')] });
  assert.equal(at('packs/product-wiki/lib.mjs').mergeable, true);
  assert.equal(at('packs/product-wiki-extras/lib.mjs').mergeable, false, 'a sibling sharing the name prefix is outside the scope');
});

test('under:<dir> works as a reject term over an otherwise-allowed diff', () => {
  const at = (file) => policyVerdict({
    policy: ['doc-changes', 'reject:under:docs/private'],
    entries: [edited(file, 'a\n', 'b\n')],
  });
  assert.equal(at('docs/public/notes.md').mergeable, true, 'the allow term still covers the rest of the tree');
  const vetoed = at('docs/private/notes.md');
  assert.equal(vetoed.mergeable, false);
  assert.deepEqual(vetoed.files, [{ file: 'docs/private/notes.md', verdict: 'rejected:under:docs/private' }]);
});

test('under:<dir> cannot reach the files that define policies, even inside its own scope', () => {
  const verdict = policyVerdict({
    policy: ['under:packs/claudinite-tasks'],
    entries: [edited('packs/claudinite-tasks/merge-policy.mjs', 'a\n', 'b\n')],
  });
  assert.equal(verdict.mergeable, false);
  assert.match(verdict.why, /defines auto-merge policy itself/);
});

test('an unusable under: path makes the whole policy invalid, authorizing nothing', () => {
  for (const bad of ['under:', 'under:/etc', 'under:../elsewhere', 'under:packs/../engine']) {
    const norm = normalizePolicy([bad]);
    assert.equal(norm.kind, 'invalid', `${bad} is not a usable scope`);
    const verdict = policyVerdict({ policy: [bad], entries: [added('packs/x/a.md')] });
    assert.equal(verdict.mergeable, false);
  }
});

test('an under: term survives the round trip through a policy expression', () => {
  const expression = policyExpression(['under:product-wiki', 'reject:under:product-wiki/drafts']);
  assert.equal(expression, 'under:product-wiki;reject:under:product-wiki/drafts');
  const norm = normalizePolicy(expression);
  assert.equal(norm.kind, 'rules');
  assert.deepEqual(norm, normalizePolicy(['under:product-wiki', 'reject:under:product-wiki/drafts']));
  assert.match(`${AUTOMERGE_TRAILER_RE.source}`, /\\S/, 'the trailer carries a whitespace-free expression');
  assert.equal(AUTOMERGE_TRAILER_RE.exec(`Claudinite-Automerge-Policy: ${expression}\n`)?.[1], expression);
});

// --- the `&&` intersection ----------------------------------------------------

test('&& intersects: a list widens, one && term narrows', () => {
  const entries = [edited('product-wiki/page.md', 'a\n', 'b\n'), edited('README.md', 'a\n', 'b\n')];
  const union = policyVerdict({ policy: ['under:product-wiki', 'doc-changes'], entries });
  assert.equal(union.mergeable, true, 'listing both terms covers the root README too');

  const intersection = policyVerdict({ policy: ['under:product-wiki && doc-changes'], entries });
  assert.equal(intersection.mergeable, false);
  assert.match(intersection.why, /README\.md/);
});

test('&& requires every part: a non-doc inside the folder, and a doc outside it, both fail', () => {
  const at = (file) => policyVerdict({
    policy: ['under:product-wiki && doc-changes'],
    entries: [edited(file, 'a\n', 'b\n')],
  }).mergeable;
  assert.equal(at('product-wiki/page.md'), true);
  assert.equal(at('product-wiki/tool.mjs'), false, 'inside the folder but not a doc');
  assert.equal(at('docs/page.md'), false, 'a doc, but outside the folder');
});

test('&& carries every part\'s whole-diff constraint', () => {
  const at = (files) => policyVerdict({
    policy: ['under:packs && single-folder-code-changes'],
    entries: files.map((f) => edited(f, 'a\n', 'b\n')),
  });
  assert.equal(at(['packs/one/a.mjs', 'packs/one/b.mjs']).mergeable, true);
  const spread = at(['packs/one/a.mjs', 'packs/two/b.mjs']);
  assert.equal(spread.mergeable, false);
  assert.match(spread.why, /code changed in 2 directories/);
});

test('&& works under a reject term, and an unresolvable part poisons the whole term', () => {
  const rejected = policyVerdict({
    policy: ['doc-changes', 'reject:under:docs/private && markdown-trims'],
    entries: [edited('docs/private/notes.md', 'a\nb\n', 'a\n')],
  });
  assert.equal(rejected.mergeable, false);

  const unresolvable = policyVerdict({
    policy: ['under:product-wiki && no-such-rule'],
    entries: [edited('product-wiki/page.md', 'a\n', 'b\n')],
  });
  assert.equal(unresolvable.mergeable, false);
  assert.match(unresolvable.why, /unresolved rule name/);
});

test('a composite or a whole-policy word inside an && term is an authoring error', () => {
  for (const bad of ['narrow-diff && doc-changes', 'anything && doc-changes', 'doc-changes && nothing', 'doc-changes &&']) {
    assert.equal(normalizePolicy([bad]).kind, 'invalid', bad);
  }
});

test('whitespace around && is canonicalized away, so the trailer stays one token', () => {
  const expression = policyExpression(['under:product-wiki && doc-changes', 'reject:javascript-changes']);
  assert.equal(expression, 'under:product-wiki&&doc-changes;reject:javascript-changes');
  assert.equal(AUTOMERGE_TRAILER_RE.exec(`Claudinite-Automerge-Policy: ${expression}\n`)?.[1], expression);
  assert.deepEqual(normalizePolicy('under:product-wiki  &&  doc-changes'), normalizePolicy(['under:product-wiki&&doc-changes']));
});
