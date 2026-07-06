// Shared engine helper: the first tracked Chrome-extension manifest
// (a manifest.json declaring manifest_version). Used by the chrome-extension
// pack's checks and by its fingerprint.
export function findExtensionManifest(ctx) {
  return ctx.tracked.find((f) => {
    if (!f.endsWith('manifest.json')) return false;
    const text = ctx.read(f);
    return text !== null && /"manifest_version"/.test(text);
  }) ?? null;
}
