import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../../../engine-tests/helpers.mjs';
import { buildContext } from '../../../../engine/checks/helpers/repo-context.mjs';
import topLevel from './optional-import-lazy.mjs';

// Co-located with the check it exercises (skills own their check-the-work rules).
const run = (root) => topLevel.run(buildContext({ root, mode: 'all' }));

// A pyproject.toml declaring numpy/tensorflow/tensorflow-hub optional — the gate
// that makes a top-level import of one of these a false-positive-free signal.
const PYPROJECT =
  '[project]\nname = "pkg"\ndependencies = []\n\n' +
  '[project.optional-dependencies]\nyamnet = [\n  "numpy>=1.21",\n  "tensorflow>=2.11",\n  "tensorflow-hub>=0.13",\n]\n';

test('python-optional-import-top-level: flags a bare top-level `import tensorflow`', () => {
  const root = makeRepo({ changed: {
    'pyproject.toml': PYPROJECT,
    'pkg/backend.py': 'import tensorflow as tf\n\n\ndef score():\n    return tf\n',
  } });
  try {
    const f = run(root);
    assert.equal(f.length, 1);
    assert.equal(f[0].severity, 'blocking');
    assert.equal(f[0].line, 1);
    assert.match(f[0].what, /tensorflow.*module top level/);
  } finally { cleanup(root); }
});

test('python-optional-import-top-level: flags a top-level `from … import` and dash→underscore names', () => {
  const root = makeRepo({ changed: {
    'pyproject.toml': PYPROJECT,
    'pkg/a.py': 'import os\nfrom tensorflow_hub import load\n',
  } });
  try {
    const f = run(root);
    assert.equal(f.length, 1);
    assert.equal(f[0].line, 2);
  } finally { cleanup(root); }
});

test('python-optional-import-top-level: an import inside a function is lazy → clean', () => {
  const root = makeRepo({ changed: {
    'pyproject.toml': PYPROJECT,
    'pkg/backend.py': 'def load():\n    import tensorflow as tf\n    return tf\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('python-optional-import-top-level: a try/except-guarded top-level import (indented) is out of scope → clean', () => {
  const root = makeRepo({ changed: {
    'pyproject.toml': PYPROJECT,
    'pkg/backend.py': 'try:\n    import tensorflow as tf\nexcept ImportError:\n    tf = None\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('python-optional-import-top-level: stdlib imports are never optional → clean', () => {
  const root = makeRepo({ changed: {
    'pyproject.toml': PYPROJECT,
    'pkg/a.py': 'import os\nimport csv\nfrom __future__ import annotations\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('python-optional-import-top-level: a dist whose import name is unrelated is not mapped → clean', () => {
  const root = makeRepo({ changed: {
    'pyproject.toml': '[project.optional-dependencies]\nimg = ["Pillow>=10"]\n',
    'pkg/a.py': 'import PIL\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('python-optional-import-top-level: no pyproject → inert', () => {
  const root = makeRepo({ changed: { 'pkg/a.py': 'import tensorflow\n' } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('python-optional-import-top-level: a pyproject with no optional-dependencies → inert', () => {
  const root = makeRepo({ changed: {
    'pyproject.toml': '[project]\nname = "pkg"\ndependencies = ["tensorflow>=2"]\n',
    'pkg/a.py': 'import tensorflow\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('python-optional-import-top-level: test files are excluded', () => {
  const root = makeRepo({ changed: {
    'pyproject.toml': PYPROJECT,
    'tests/test_backend.py': 'import tensorflow\n',
    'pkg/test_helpers.py': 'import numpy\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('python-optional-import-top-level: the skill\'s own directory never self-flags', () => {
  const root = makeRepo({ changed: {
    'pyproject.toml': PYPROJECT,
    'skills/python-optional-deps/fixture.py': 'import tensorflow\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});
