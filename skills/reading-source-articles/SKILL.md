---
name: reading-source-articles
description: Method for reading/summarizing a source paper or reference method so it never has to be re-read, and for extracting figures/samples from documents. Use when a paper, tool, or reference method matters to the project, or when pulling images out of a PDF.
---

## Reading & summarizing source articles


When a paper, tool, or reference method matters to the project:

- **Write a self-contained notes file so the source never has to be re-read.**
  Capture everything algorithmically relevant: the exact method/pipeline and its
  parameters, the definitions and formulae, calibration details, and **sanity-check
  values** you can validate your own outputs against.
- **Explicitly record where your approach diverges from the reference and why.**
  The divergence is often the whole point of the project; make it legible.
- **State what you deliberately omitted** (material not relevant to the
  algorithm — e.g. procedural/experimental setup detail, incidental statistics,
  acknowledgements) and that you cross-checked against the full text — so a later
  reader trusts the summary is complete for its purpose.
- Note that upload paths for source PDFs are **session-specific and won't
  persist**; the notes file is the durable artifact, not the upload.

---

## Extracting images — samples vs illustrations


- **Samples** are inputs you will run the algorithm on; **illustrations** are
  figures that explain a method or a definition. Keep the two roles distinct and
  store extracted figures alongside the notes that reference them.
- **Render documents with a library, not an assumed system binary.** The
  environment often lacks common tools (e.g. a PDF rasterizer such as poppler /
  `pdftoppm`); use an in-process library instead. Locate embedded raster images
  and render just the region you need, at a zoom high enough to read fine
  annotation, with a little padding to catch ink drawn outside the frame.
- **Verify identity when an extracted image should match an existing input**
  (e.g. an annotated crop over an original) by an exact pixel diff — so you know
  an annotation set is a labelling of the *same* data, not a new input.

---
