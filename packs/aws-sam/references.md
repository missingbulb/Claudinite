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
- **(sam-build-and-deps-1)** Declaring esbuild in `dependencies` does not bloat the deployed artifact: it is
  not bundled unless the handler imports it, so the usual objection to the remedy — shipping a
  build tool to production — does not apply. Recovered from the rule's own pre-#467 text (cut
  by 2f3e4e9a as “consequence prose arguing for a rule rather than enabling it”, before this
  pack had a references.md to hold it). Reaffirm against SAM's esbuild builder; retire if it
  stops running a production-only install.
- **(sam-template-2)** Cache key and origin forwarding are independent controls — a `CachePolicy`
  defines the cache key, an `OriginRequestPolicy` defines what reaches the origin — which is
  why the two are set separately to cache public GETs on one entry while still delivering
  `Authorization` for authenticated writes. Recovered from the rule's own pre-#467 text (cut by
  2f3e4e9a as “consequence prose arguing for a rule rather than enabling it”, before this pack
  had a references.md to hold it). Reaffirm against CloudFront's managed-policy list; retire if
  a custom policy is ever allowed to name `Authorization`.
