import { readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

// Renders packs/locators.GENERATED.mjs: every offered pack's pitch and activation, and
// the fingerprint (`detect`) of each pack that has one, runnable anywhere an ES module
// runs. A member mounts only its declared packs, so this one file is how a member, or a
// dashboard reading a member, can ask which of the OTHER packs would fit a repo.
//
// A `detect` is a closure over its pack.mjs and whatever that imports, so the file
// carries each module's source text and links them when loaded: each relative import is
// rewritten to a placeholder naming the module it resolves to, and `loadLocators`
// imports the modules dependencies-first, replacing each placeholder with the URL the
// dependency was imported from. A locator's import graph must therefore be relative and
// runtime-neutral (no `node:` or bare specifiers, no `import.meta`, no dynamic import):
// the render refuses one that is not rather than ship a file that fails in a browser.

const PLACEHOLDER = 'claudinite-locator:';
const STATIC_IMPORT = /((?:import|export)\s[^'"]*?\sfrom\s*|import\s*)(['"])([^'"]+)\2/g;

function collectModules(entry, root, modules) {
  const key = relative(root, entry).split('\\').join('/');
  if (modules.has(key)) return key;
  modules.set(key, null);
  const text = readFileSync(entry, 'utf8');
  if (/\bimport\.meta\b|\bimport\s*\(/.test(text)) throw new Error(`${key} uses import.meta or a dynamic import, which a linked locator cannot carry`);
  const deps = [];
  const source = text.replace(STATIC_IMPORT, (whole, lead, quote, spec) => {
    if (!spec.startsWith('.')) throw new Error(`${key} imports "${spec}", which is not a relative module a locator can carry`);
    const dep = collectModules(resolve(dirname(entry), spec), root, modules);
    deps.push(dep);
    return `${lead}${quote}${PLACEHOLDER}${dep}${quote}`;
  });
  modules.set(key, { source, deps });
  return key;
}

// Dependencies before dependents, so each module's imports are already linked.
function linkOrder(modules) {
  const order = [];
  const seen = new Set();
  const visit = (key, path = []) => {
    if (seen.has(key)) return;
    if (path.includes(key)) throw new Error(`import cycle through ${[...path, key].join(' -> ')}`);
    for (const dep of modules.get(key).deps) visit(dep, [...path, key]);
    seen.add(key);
    order.push(key);
  };
  for (const key of [...modules.keys()].sort()) visit(key);
  return order;
}

export function renderPackLocators(packs, root) {
  const offered = [...packs].filter((p) => !p.hidden).sort((a, b) => a.id.localeCompare(b.id));
  const modules = new Map();
  const entries = offered.map((p) => ({
    id: p.id,
    pitch: p.pitch ?? null,
    belongs: p.ruleRoutingGuidance?.belongs ?? null,
    seededByDefault: Boolean(p.seededByDefault),
    marker: p.marker ?? null,
    requires: p.requires ?? [],
    locator: typeof p.detect === 'function' ? collectModules(join(p.dir, 'pack.mjs'), root, modules) : null,
  }));
  const sources = Object.fromEntries(linkOrder(modules).map((k) => [k, modules.get(k).source]));
  return `// GENERATED - do not hand-edit. Rendered from the pack manifests by the canon's
// engine-tests/pack-locators.test.mjs; regenerate by running that test in a canon checkout.
//
// Every pack a repo can adopt from Claudinite, with its pitch, and a way to run each
// pack's fingerprint against a repo: \`await loadLocators()\` answers a Map from pack id
// to \`detect({ tracked, read })\`, where \`tracked\` lists the repo's paths and \`read\`
// answers a path's text (or null) synchronously. A fingerprint only suspects a pack is
// wanted; declaring it is the project's call.

export const PACKS = ${JSON.stringify(entries, null, 2)};

// Each module's source, dependencies first, relative imports rewritten to
// '${PLACEHOLDER}<module>' until loadLocators links them.
const SOURCES = ${JSON.stringify(sources, null, 2)};

const asDataUrl = (source) => \`data:text/javascript;charset=utf-8,\${encodeURIComponent(source)}\`;

// \`toUrl\` turns a linked module's source into an importable URL; a data: URL works in
// Node and in a browser without a content-security policy forbidding it.
export async function loadLocators({ toUrl = asDataUrl } = {}) {
  const urls = {};
  const loaded = {};
  for (const [key, source] of Object.entries(SOURCES)) {
    const linked = source.replace(/(['"])${PLACEHOLDER}([^'"]+)\\1/g, (whole, quote, dep) => JSON.stringify(urls[dep]));
    urls[key] = toUrl(linked);
    loaded[key] = await import(urls[key]);
  }
  return new Map(PACKS.filter((p) => p.locator).map((p) => [p.id, loaded[p.locator].default.detect]));
}
`;
}
