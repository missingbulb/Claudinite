import { finding } from '../../../../checks/lib/findings.mjs';

// The Web Speech recognition API and speechSynthesis are Window-scoped: they
// live on `window`/a document, which an MV3 background service worker does not
// have. Referencing them in the worker throws (recognition) or leaves the global
// undefined (synthesis) at runtime — a listen or speak that silently never
// happens. chrome.tts is the extension-only TTS engine that DOES run in the
// worker, so synthesis has a real worker path; recognition has none and must
// move to a document context. Repo-state on purpose: a worker that references
// one of these is a live break however long ago it merged.
//
// RELEVANCE FIRST (see checks/README.md "Adding a rule"): a skill check runs on
// EVERY repo, so the gate is narrow — only the file an MV3 manifest.json names
// as `background.service_worker`, resolved relative to the manifest, and only
// when that file is the project's OWN authored source (ctx.files, so a built /
// bundled worker artifact that merely concatenates document-context source is
// out of scope — the same signature-less residue google-id-token-validation
// documents for code-form verifiers). No MV3 manifest, or a manifest that
// bundles its worker, means the check stays silent. The skill's own directory is
// excluded so its fixtures never self-flag on the corpus repo.
const SELF = 'skills/web-speech-io/';
const RECOGNITION = /\b(webkitSpeechRecognition|SpeechRecognitionPhrase|SpeechRecognition)\b/;
const SYNTHESIS = /\b(speechSynthesis|SpeechSynthesisUtterance)\b/;

// Resolve a manifest-relative path ("background.js", "src/sw.js") against the
// manifest's directory, normalized to the '/'-separated form ctx.files uses.
function resolveFrom(manifestPath, rel) {
  const dir = manifestPath.includes('/') ? manifestPath.slice(0, manifestPath.lastIndexOf('/')) : '';
  const parts = [];
  for (const seg of `${dir}/${rel}`.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/');
}

// The file an MV3 manifest names as its background service worker, when that
// file is the project's own authored source. [] otherwise.
function serviceWorkers(ctx) {
  const out = [];
  for (const f of ctx.files) {
    if (f.startsWith(SELF) || !/(^|\/)manifest\.json$/.test(f)) continue;
    let manifest;
    try { manifest = JSON.parse(ctx.read(f) ?? ''); } catch { continue; }
    if (!manifest || manifest.manifest_version !== 3) continue;
    const sw = manifest.background?.service_worker;
    if (typeof sw !== 'string' || !sw) continue;
    const resolved = resolveFrom(f, sw);
    if (ctx.files.includes(resolved)) out.push(resolved);
  }
  return out;
}

const rule = {
  id: 'web-speech-no-window-api-in-service-worker',
  severity: 'blocking',
  description: 'An MV3 background service worker does not reference a Window-scoped Web Speech API (recognition or speechSynthesis)',
  doc: 'skills/web-speech-io/SKILL.md',
  why: 'the recognition API and speechSynthesis live on window/a document, which a service worker has no access to — referencing them there throws or leaves the global undefined at runtime, so the listen or speak silently never happens',

  run(ctx) {
    const out = [];
    for (const sw of serviceWorkers(ctx)) {
      const text = ctx.read(sw);
      if (text === null) continue;
      text.split('\n').forEach((ln, i) => {
        if (RECOGNITION.test(ln)) {
          out.push(finding(rule, {
            file: sw, line: i + 1,
            what: 'constructs or references the Web Speech recognition API in the MV3 service worker',
            fix: 'recognition needs a document — move the listening half to a content script, side panel, popup, or offscreen document, and keep the worker for document-free work',
          }));
        } else if (SYNTHESIS.test(ln)) {
          out.push(finding(rule, {
            file: sw, line: i + 1,
            what: 'references speechSynthesis in the MV3 service worker, where it is undefined',
            fix: 'speak from the worker with chrome.tts (extension-only, needs the "tts" permission, immune to page autoplay gating); reserve speechSynthesis for a document context',
          }));
        }
      });
    }
    return out;
  },
};

export default rule;
