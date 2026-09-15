// THE PARITY GUARD between the fake world and the real ports.
//
// The hazard it exists for: someone adds an operation to `src/world/github.mjs`,
// a stage starts calling it, and the fake — which never heard of it — silently
// answers 404 or, worse, the real operation reaches the live API from inside a
// test. Either way the scenario suite goes on passing while the thing it claims
// to drive has grown a surface nobody simulates. The guard turns that into a
// failure HERE, in the one file whose whole job is to notice.
//
// It is a two-artifact claim (the fake's port and the real module can drift
// independently), which is what makes it a test rather than a convention. The
// pairs are DERIVED from the two directories, so a fake added for a port that
// has none yet enrols itself; nothing here lists them by hand.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));

const modulesIn = (dir) => readdirSync(here(dir))
  .filter((f) => f.endsWith('.mjs') && !f.endsWith('.test.mjs'))
  .map((f) => f.replace(/\.mjs$/, ''))
  .sort();

const REAL = modulesIn('../../../src/world');
const FAKE = modulesIn('.');
// A fake stands in for a real port when it shares its name; `agents` and
// `humans` share none, because neither is an edge the engine calls.
const PAIRED = FAKE.filter((name) => REAL.includes(name));

// `clock` -> `makeClock`. A fake whose factory is named anything else fails
// here rather than in whichever scenario first reaches for it.
const factoryName = (name) => `make${name[0].toUpperCase()}${name.slice(1)}`;

test('the fake world stands in for real ports, and the pairing is not empty', () => {
  assert.ok(PAIRED.length >= 4, `paired ${PAIRED.length} fakes with real ports: ${PAIRED.join(', ')}`);
});

for (const name of PAIRED) {
  test(`the fake ${name} port exposes exactly the names src/world/${name}.mjs exports`, async () => {
    const real = await import(`../../../src/world/${name}.mjs`);
    const fake = await import(`./${name}.mjs`);
    const factory = fake[factoryName(name)];
    assert.equal(typeof factory, 'function', `${name}.mjs must export ${factoryName(name)}`);

    // Every fake takes the same two collaborators it could need; passing both to
    // all of them keeps this loop from having to know which.
    const { makeClock } = await import('./clock.mjs');
    const { makeGithub } = await import('./github.mjs');
    const clock = makeClock();
    const github = makeGithub({ clock });
    const built = factory({ clock, github });

    assert.ok(built.port, `${factoryName(name)}() must return a harness carrying a \`port\``);
    assert.deepEqual(
      Object.keys(built.port).sort(),
      Object.keys(real).sort(),
      `the fake ${name} port and src/world/${name}.mjs have drifted`,
    );
  });
}
