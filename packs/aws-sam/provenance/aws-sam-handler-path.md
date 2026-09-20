## 2026-09-01 · born · converted from references.md (check:aws-sam/handler-path)
- **Reason:** Converted from the pack's prose in #136: esbuild's default `outbase` is the entry
  point's own directory (esbuild's documented behaviour, https://esbuild.github.io/api/#outbase), so
  SAM's esbuild builder strips a single entry's subdirectory from the artifact and a
  subdirectory-carrying Handler fails only at first invoke with `Runtime.ImportModuleError`.
- **Mechanism:** a check
- **Retire when:** Reaffirm against esbuild's outbase documentation and SAM's esbuild builder;
  retire only if either changes that default.
