# numpy-image-processing pack

Fingerprinted by `numpy` and `scipy` named together in a near-root Python dependency manifest
(`requirements*.txt` or `pyproject.toml`) — either alone is too common in Python code to suspect
this pack, but the pair is a reliable signal for array-level image analysis. All rules are prose:
every one is a numeric-code mechanic (an off-by-one in a coordinate convention, an operator that
silently selects nothing) with no repo-state shape a deterministic check could key on without
firing on ordinary array code.

## Rules (`RULES.md`)

| Rule | Severity | Reason | Enforcement |
|---|---|---|---|
| A global statistic over a padded array | high | correctness | prose: <200 words |
| Thresholding with a strict `>` at saturation | high | correctness | prose: <100 words |
| A symmetric window around a float center | high | correctness | prose: <100 words |
| `scipy.ndimage.affine_transform` pulls | high | correctness | prose: <100 words |
| Classifying skeleton pixels by neighbor count | medium | complexity | prose: <100 words |
| Filtering connected components by size | medium | performance | prose: <50 words |
| Loading a font with `PIL.ImageFont.truetype` | medium | correctness | prose: <50 words |
| Upscaling a labeled image for display | medium | correctness | prose: <100 words |
| Choosing an annotation color | medium | correctness | prose: <100 words |

Provenance: distilled from two fleet members that both derive a mask/skeleton from a microscopy
image array and score or annotate the result — the same stack, doing different science.

| Member | What it evidenced |
|---|---|
| `missingbulb/VascularColoring` | `analysis/measure_vessels.py`: connected-component filtering via `ndi.label`/`ndi.sum` fancy-indexing, neighbor-count skeleton classification via `ndi.convolve`, and `PIL.ImageFont.truetype` wrapped in `try`/`except OSError` with an `ImageFont.load_default()` fallback; `Image.fromarray(...).resize(..., Image.NEAREST)` for pixel-exact upscaled overlays |
| `missingbulb/NoRFinder` | `src/nor.py` + `src/harness.py` + `src/render.py`: the imaged-area-only quantile (`quantile_valid`, and `harness.py`'s `t.apply(np.ones_like(...), order=0) > 0.5` validity mask built by transforming an all-ones array), the `>=` vs `>` saturation guard in `components()`, `np.floor`/`np.ceil` instead of `int()` for a window built around a float center in `_local_axis`, the pull-based `scipy.ndimage.affine_transform` convention documented and implemented in `T.apply`/`make_T`, and `render.py`'s `pick_overlay` choosing an annotation hue by measured cosine-similarity margin against the image's own pixels |

Every rule above appears in at least one of the two members' real files, cited above; none is
speculative best-practice invented for the pack.
