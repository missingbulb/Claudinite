## 2026-09-10 · born · converted from references.md (check:technology-skill-code-imports-inside-its-folder)
- **Reason:** The same lifting failure for code: an outward import resolves in the pack it was
  written in and throws `ERR_MODULE_NOT_FOUND` wherever the folder lands, and the session writing
  this skill hit exactly that on its own fixture's first run. Test files are exempt because a
  fixture must reach the engine's declaration loader, and that one line is the known cost of a
  promotion.
- **Mechanism:** a check
- **Retire when:** Retire only if skill code is bundled at promotion time.
