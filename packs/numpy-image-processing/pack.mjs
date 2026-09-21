// numpy-image-processing pack: numeric image analysis in Python on the
// NumPy + SciPy (`ndimage`) + scikit-image + Pillow stack - deriving a mask,
// skeleton or threshold from an image array, and rendering the result.
//
// Fingerprint: `numpy` and `scipy` named together in a near-root Python
// dependency manifest (`requirements*.txt` or `pyproject.toml`).
const MANIFEST = /(^|\/)(requirements[^/]*\.txt|pyproject\.toml)$/;
const NUMPY = /\bnumpy\b/i;
const SCIPY = /\bscipy\b/i;

export default {
  version: '60921.1',
  minEngineVersion: '60822.1',
  ruleRoutingGuidance: {
    belongs:
      'numeric image analysis in Python — deriving a mask/skeleton/threshold from a NumPy image array with SciPy ndimage and scikit-image',
    excludes:
      'Python packaging conventions — that is python; iterate-on-an-algorithm methodology — that is research-project; browser canvas — that is html',
  },
  marker: 'numpy and scipy named together in a near-root Python dependency manifest (requirements*.txt or pyproject.toml)',
  detect: (ctx) =>
    ctx.tracked.some((f) => {
      const parts = f.split('/');
      if (parts.length > 2 || !MANIFEST.test(f)) return false;
      const text = ctx.read(f);
      return text !== null && NUMPY.test(text) && SCIPY.test(text);
    }),
};
