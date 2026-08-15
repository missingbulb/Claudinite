// The fixture helper's isolation from the HOST's git configuration.
//
// A scratch repo in a tmpdir exists for the length of one test, so a signature on
// its commits buys nothing — and inheriting the ambient `commit.gpgsign` costs
// twice. It is slow: every fixture commit becomes a round trip to a signing
// service, measured at 202ms per makeRepo against 38ms without. And it is
// fragile in the way that matters most: when the service degrades, each commit
// blocks on it and the descriptors pile up behind it until git fails
// process-wide, taking the suite with it for a reason that has nothing to do
// with the code under test.
//
// This test pins the isolation rather than the speed, so it means the same thing
// on a runner with no signing configured at all: it forces a hostile ambient
// config — signing on, pointed at a program that always fails — and requires the
// fixture to be built anyway. Without the helper's own override, git refuses the
// commit and makeRepo throws.
//
// GIT_CONFIG_GLOBAL is set BEFORE the dynamic import because the helper snapshots
// process.env into its GIT_ENV at module load; a static import at the top of this
// file would read the real environment and prove nothing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('makeRepo builds its fixture even where the host insists on signing every commit', async () => {
  const home = mkdtempSync(join(tmpdir(), 'claudinite-hostile-gitconfig-'));
  const config = join(home, 'gitconfig');
  writeFileSync(config, '[commit]\n\tgpgsign = true\n[gpg]\n\tformat = openpgp\n\tprogram = /bin/false\n');
  const restore = process.env.GIT_CONFIG_GLOBAL;
  process.env.GIT_CONFIG_GLOBAL = config;
  try {
    const { makeRepo, cleanup, git } = await import('./helpers.mjs');
    const root = makeRepo({ base: { 'a.md': 'x\n' }, changed: { 'b.md': 'y\n' } });
    try {
      // %G? is git's own verdict per commit: N for unsigned. Both commits, so the
      // seed on main is covered as well as the one on the feature branch.
      const verdicts = git(root, 'log', '--all', '--format=%G?').trim().split('\n');
      assert.deepEqual(verdicts, ['N', 'N'], 'a fixture commit must never carry a signature');
    } finally { cleanup(root); }
  } finally {
    if (restore === undefined) delete process.env.GIT_CONFIG_GLOBAL;
    else process.env.GIT_CONFIG_GLOBAL = restore;
    rmSync(home, { recursive: true, force: true });
  }
});
