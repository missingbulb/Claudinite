import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeRepo, cleanup } from '../../checks/test/helpers.mjs';
import { buildContext } from '../../checks/lib/context.mjs';
import installHint from './optional-import-install-hint.mjs';

// Co-located with the check it exercises (skills own their check-the-work rules).
const run = (root) => installHint.run(buildContext({ root, mode: 'all' }));

const PYPROJECT =
  '[project]\nname = "pkg"\ndependencies = []\n\n' +
  '[project.optional-dependencies]\nyamnet = ["numpy>=1.21", "tensorflow>=2.11"]\n';

// The grounded LaughCounter shape: guard re-raises ImportError naming the extra.
const GOOD_GUARD =
  'def load():\n' +
  '    try:\n' +
  '        import tensorflow as tf\n' +
  '    except ImportError as exc:\n' +
  '        raise ImportError(\n' +
  '            "needs the ML deps. Install with:  pip install \\"pkg[yamnet]\\""\n' +
  '        ) from exc\n' +
  '    return tf\n';

test('python-optional-import-install-hint: flags a guard that re-raises with no pip-install hint', () => {
  const root = makeRepo({ changed: {
    'pyproject.toml': PYPROJECT,
    'pkg/backend.py':
      'def load():\n' +
      '    try:\n' +
      '        import tensorflow as tf\n' +
      '    except ImportError as exc:\n' +
      '        raise ImportError("TensorFlow is required") from exc\n' +
      '    return tf\n',
  } });
  try {
    const f = run(root);
    assert.equal(f.length, 1);
    assert.equal(f[0].severity, 'advisory');
    assert.equal(f[0].line, 5);
    assert.match(f[0].what, /without a `pip install` hint/);
  } finally { cleanup(root); }
});

test('python-optional-import-install-hint: flags a bare `except ImportError: raise`', () => {
  const root = makeRepo({ changed: {
    'pyproject.toml': PYPROJECT,
    'pkg/backend.py':
      'def load():\n' +
      '    try:\n' +
      '        import numpy\n' +
      '    except ImportError:\n' +
      '        raise\n' +
      '    return numpy\n',
  } });
  try {
    const f = run(root);
    assert.equal(f.length, 1);
    assert.equal(f[0].line, 5);
  } finally { cleanup(root); }
});

test('python-optional-import-install-hint: a guard re-raising with the pip-install hint is clean', () => {
  const root = makeRepo({ changed: { 'pyproject.toml': PYPROJECT, 'pkg/backend.py': GOOD_GUARD } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('python-optional-import-install-hint: an availability-probe guard (sets a flag, no raise) is out of scope → clean', () => {
  const root = makeRepo({ changed: {
    'pyproject.toml': PYPROJECT,
    'pkg/backend.py':
      'try:\n' +
      '    import tensorflow  # noqa: F401\n' +
      '    HAVE_TF = True\n' +
      'except ImportError:\n' +
      '    HAVE_TF = False\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('python-optional-import-install-hint: a guard whose try-body imports no optional dep is not touched', () => {
  const root = makeRepo({ changed: {
    'pyproject.toml': PYPROJECT,
    'pkg/compat.py':
      'try:\n' +
      '    import ujson as json\n' +
      'except ImportError:\n' +
      '    raise ImportError("no json")\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('python-optional-import-install-hint: no pyproject → inert', () => {
  const root = makeRepo({ changed: {
    'pkg/backend.py':
      'try:\n    import tensorflow\nexcept ImportError:\n    raise\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});

test('python-optional-import-install-hint: test files are excluded', () => {
  const root = makeRepo({ changed: {
    'pyproject.toml': PYPROJECT,
    'tests/test_backend.py':
      'try:\n    import tensorflow\nexcept ImportError:\n    raise\n',
  } });
  try {
    assert.equal(run(root).length, 0);
  } finally { cleanup(root); }
});
