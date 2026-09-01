# References — rationale behind this pack's rules and checks

Maintenance and review material for the `writing-pack-prose` references convention: each entry
carries the reason a rule or check exists, written so a periodic review can reaffirm — or
retire — it. Entry keys are file-scoped stable identifiers (gaps allowed, never renumbered): an
end-of-line `(n)` marker in `RULES.md` cites `RULES-n`, one in a skill cites
`<skill-name>-n`, and `check:` entries cover checks. No session loads this file for daily work.

- **(check:aws-sam/handler-path)** Converted from the pack's prose in #136: esbuild's default
  `outbase` is the entry point's own directory (esbuild's documented behaviour,
  https://esbuild.github.io/api/#outbase), so SAM's esbuild builder strips a single entry's
  subdirectory from the artifact and a subdirectory-carrying Handler fails only at first invoke
  with `Runtime.ImportModuleError`. Reaffirm against esbuild's outbase documentation and SAM's
  esbuild builder; retire only if either changes that default.
