// The member's FLAT declarations: every declared pack's task.json and dashboard.json,
// written into one file each by the member's converge. One read at a sha replaces a
// read per task and a read per contributing pack, and like every content read it is
// cached under the sha, so a warm load spends nothing on it.
//
// A member whose converge predates the flat directory has neither file; each reader
// here answers null for it and the caller falls back to reading the sources one by
// one. Whether the file is there comes from the tree listing the caller already holds,
// so that answer costs no request.
//
// Spelled here, not imported: the page renders other repos in the viewer's browser and
// imports nothing from the engine. `flat-paths-drift.test.mjs` holds the copies to it.
export const FLAT_TASKS_PATH = '.claudinite/flat/tasks.GENERATED.json';
export const FLAT_DASHBOARD_PATH = '.claudinite/flat/dashboard.GENERATED.json';

// One flat file's entry map — `{ '<pack>/<task>': { path, declaration | text } }` for
// the tasks, `{ '<pack>': … }` for the descriptors — or null where this member carries
// no such file, or it could not be read or parsed. A read the budget declined throws,
// as every content read here does, and the caller decides what that means.
export async function readFlat({ repo, sha, token, paths, gh }, path, key) {
  if (!(paths ?? []).includes(path)) return null;
  const text = await gh.getTextAtSha(repo, sha, path, token);
  if (!text) return null;
  try {
    const entries = JSON.parse(text)?.[key];
    return entries && typeof entries === 'object' && !Array.isArray(entries) ? entries : null;
  } catch { return null; }
}

// An entry's source as TEXT, which is what every parser on this page takes: the flat
// file keeps the parsed JSON where the source parsed and the raw text where it did not,
// so an unreadable declaration still reads as unreadable.
export const entryText = (entry) => (entry?.declaration !== undefined ? JSON.stringify(entry.declaration) : entry?.text ?? null);

// The flat task entries as the roster's `{ pack, task, path, text }`, kept to the packs
// the declaration names — the same filter the tree walk applies. A local pack's key
// is `local/<name>/<task>`, so the task is what follows the LAST slash.
export function flatTaskRows(entries, declaredPacks) {
  return Object.entries(entries ?? {})
    .map(([key, entry]) => {
      const cut = key.lastIndexOf('/');
      return { pack: key.slice(0, cut), task: key.slice(cut + 1), path: entry?.path ?? null, text: entryText(entry) };
    })
    .filter((row) => declaredPacks.has(row.pack))
    .sort((a, b) => `${a.pack}/${a.task}`.localeCompare(`${b.pack}/${b.task}`));
}
