// Shared reading of a repo's Firebase project roots and their functions
// codebases — the structure both deploy-layout checks reason about.
//
// A Firebase project root is the directory holding firebase.json (the repo root
// or one directory down, matching this pack's own marker scope so a firebase.json
// in a nested fixture/example tree can't drag checks in). The CLI resolves every
// path inside firebase.json *relative to that file*, so a codebase's `source` is
// joined onto the config's own directory, never the repo root.

const isProjectConfig = (f) => {
  const parts = f.split('/');
  return parts[parts.length - 1] === 'firebase.json' && parts.length <= 2;
};

// Every tracked firebase.json at the pack's marker depth, parsed. An unparsable
// config yields nothing: a syntax error is the CLI's complaint to make, not ours.
export function projectConfigs(ctx) {
  const out = [];
  for (const file of ctx.tracked.filter(isProjectConfig)) {
    const text = ctx.read(file);
    if (text === null) continue;
    let config;
    try { config = JSON.parse(text); } catch { continue; }
    if (config === null || typeof config !== 'object' || Array.isArray(config)) continue;
    const slash = file.lastIndexOf('/');
    out.push({ file, dir: slash === -1 ? '' : file.slice(0, slash), config });
  }
  return out;
}

// The functions codebases a project declares, each resolved to the deployed
// package's own directory. `functions` may be one object or an array of
// codebases; `source` defaults to "functions" (the CLI's own default).
// Codebases whose package.json isn't in the repo are dropped — the relevance
// gate: nothing to say about a codebase this checkout doesn't carry.
export function functionsCodebases(ctx) {
  const out = [];
  for (const { file, dir, config } of projectConfigs(ctx)) {
    if (config.functions === undefined || config.functions === null) continue;
    const declared = Array.isArray(config.functions) ? config.functions : [config.functions];
    for (const entry of declared) {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue;
      const source = typeof entry.source === 'string' && entry.source ? entry.source : 'functions';
      const sourceDir = [dir, source].filter(Boolean).join('/');
      const manifestPath = `${sourceDir}/package.json`;
      const text = ctx.read(manifestPath);
      if (text === null) continue;
      let manifest;
      try { manifest = JSON.parse(text); } catch { continue; }
      if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) continue;
      out.push({ configFile: file, entry, source, sourceDir, manifestPath, manifest });
    }
  }
  return out;
}
