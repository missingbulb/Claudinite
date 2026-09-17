# Enforcing a public API surface on a vendored module

Research notes. Every mechanism below was read from its primary source (linked per
section) rather than from memory. The question this answers: what can hold a
public/private boundary for a module that is *copied* into consumer repos rather than
installed by a package manager.

## The load-bearing distinction

Mechanisms split into three kinds by *who* runs the enforcement:

| kind | enforcer | survives vendoring? |
| --- | --- | --- |
| **path-prefix rule in the toolchain** | compiler / build tool, applied to any tree by its shape | **yes** — the rule is about the path, not about where the code came from |
| **specifier-resolution rule** | module loader, applied when resolving a package *name* | **no** — vendored code is reached by relative path, which bypasses resolution entirely |
| **graph rule in the consumer's own linter** | the consumer's linter / build, over the consumer's tree | **yes, but only if the consumer runs it** |
| **review artifact** | a checked-in surface file + code review | at the **producer** only; enforces nothing downstream |

Node's docs state the second row outright: `"exports"` encapsulation
"is not a strong encapsulation since a direct require of any absolute subpath of the
package such as `require('/path/to/node_modules/pkg/subpath.js')` will still load
subpath.js". A vendored copy is *all* absolute-subpath access. The same holds for JPMS
(put the jar on the class path instead of the module path and `module-info` is ignored)
and for OSGi (outside a framework, a bundle jar is just a jar).

Go is the one ecosystem that got this right by construction, and it did so *because of
vendoring* — see below.

## Go `internal/`

[`cmd/go` helpdoc](https://github.com/golang/go/blob/master/src/cmd/go/internal/help/helpdoc.go)

- **Enforced by**: the compiler driver, at build time. Not a linter, not review.
- **Surface is**: a *directory*, by negation — everything is public except what sits
  under a directory named `internal`. There is no manifest and nothing generated.
- **Rule**: "Code in or below a directory named `internal` is importable only by code
  that shares the same import path above the internal directory." So
  `example.com/m/foo/internal/baz` is importable from `example.com/m/foo`,
  `…/foo/bar` and `…/foo/quux`, but not from `example.com/m/crash/bang`.
- **Reaching past it**: the build fails. `use of internal package … not allowed`.
- **Direction**: public code imports *into* `internal/`. The surface does not own the code.

The vendoring-relevant part: GOPATH-mode `vendor/` is *the same rule with the directory
renamed*. The helpdoc says so — "The same visibility rules apply as for internal, but the
code in z.go is imported as `baz`, not as `foo/vendor/baz`." Go deliberately expressed
"this tree is private to the subtree above it" as one path-shape rule, then reused it for
copied-in code. That is the single most transferable result in this document: a
prefix rule keyed on *path shape* is the only encapsulation that a copy cannot launder.

## Node.js `"exports"` / `"imports"`, and publint

[packages.md](https://nodejs.org/api/packages.html) · [publint rules](https://publint.dev/rules)

- **Enforced by**: the ESM/CJS resolver in the loader, plus every bundler that
  reimplements it. Runtime, not compile time.
- **Surface is**: a **manifest** — the `"exports"` object in `package.json`, optionally
  with subpath patterns (`"./feature/*": "./src/feature/*.js"`) and conditions.
- **Reaching past it**: `ERR_PACKAGE_PATH_NOT_EXPORTED`. Note the docs' own warning that
  adding `"exports"` to an existing package "will prevent consumers of the package from
  using any entry points that are not defined, including the package.json (e.g.
  `require('your-package/package.json')`). This will likely be a breaking change."
- **`"#"` imports**: the private half. Entries must start with `#`, are resolvable
  *only from inside the package*, and unlike `"exports"` may map to external packages.
  This is the closest thing in Node to "private code addresses its dependencies through
  a declared vocabulary" — it gives internal code a stable alias without exposing it.
- **publint** validates the *manifest*, not consumers: `EXPORTS_GLOB_NO_MATCHED_FILES`,
  `FILE_NOT_PUBLISHED`, `EXPORTS_MISSING_ROOT_ENTRYPOINT`, `EXPORTS_TYPES_SHOULD_BE_FIRST`,
  `EXPORTS_DEFAULT_SHOULD_BE_LAST`, `TYPES_NOT_EXPORTED`. It catches a surface that
  claims files it doesn't ship, and condition-order bugs. It cannot see a consumer
  reaching past the surface.

Verdict for a vendored tree: worthless as enforcement, useful as documentation — the
`"exports"` object is a machine-readable statement of intent even where nothing reads it.

## Java: JPMS and OSGi

[Jigsaw: State of the Module System](https://openjdk.org/projects/jigsaw/spec/sotms/) ·
[OSGi core §3](https://docs.osgi.org/specification/osgi.core/8.0.0/framework.module.html)

**JPMS** — `module-info.java`:

- **Enforced by**: `javac` *and* the JVM. Two-sided: `requires` (what I may read) and
  `exports` (what others may see). Accessibility needs both — "S's module reads T's
  module, **and** T's module exports T's package".
- **Surface is**: a **manifest** compiled into a descriptor (`module-info.class`),
  listing *packages*, not types. Package granularity is the whole design: a package is
  either exported or invisible.
- **Qualified exports** (`exports sun.reflect to java.corba, java.logging;`) give a
  named-allowlist surface. The spec flags the hazard itself: "An adversary could, e.g.,
  name a module `java.corba` in order to access types in the `sun.reflect` package",
  answered by recording content hashes of the intended peers in the descriptor.
- `opens` is the reflection escape valve, split out precisely because deep reflection
  and compile-time access are different grants.
- **Reaching past it**: compile error, or `IllegalAccessError` at runtime.
- **The vendoring hole**: the unnamed module / class-path bridge. Code on the class path
  reads everything and `module-info` is inert. A vendored source tree has no descriptor
  at all.

**OSGi** — `Export-Package`:

- **Enforced by**: the framework's **classloader graph**. Each bundle gets its own
  loader wired only to what resolution allowed.
- **Surface is**: a **manifest** header in `META-INF/MANIFEST.MF`, and in practice a
  *generated* one — bnd computes `Export-Package` from `-exportcontents` / a
  `Private-Package` instruction, so the author declares intent and the tool writes the
  header.
- Non-exported packages are "private packages": present on the bundle's own class path,
  absent from every other bundle's class space.
- **Reaching past it**: resolution failure at install, or
  `ClassNotFoundException`/`NoClassDefFoundError` at runtime.
- `uses:=` constraints propagate type consistency across exports; the spec's own
  split-package discussion documents the cost ("Confusing — It is easy to find a setup
  where there is lots of potential for confusion").

OSGi is the strongest *runtime* isolation in this survey and the least applicable to a
vendored tree, because the enforcement is entirely in the container.

## Rust: `pub(crate)` and the facade crate

[Visibility and privacy](https://doc.rust-lang.org/reference/visibility-and-privacy.html) ·
[`std/src/lib.rs`](https://github.com/rust-lang/rust/blob/master/library/std/src/lib.rs)

- **Enforced by**: the compiler, per item, with a graded vocabulary — `pub`,
  `pub(crate)`, `pub(super)`, `pub(in path)`, private-by-default.
- **Surface is**: neither a directory nor a manifest — it is the set of `pub` paths
  *reachable* from the crate root. A `pub` item in a private module is unreachable, which
  `rustc` warns about (`private_interfaces`, and historically `private_in_public`).
- **Reaching past it**: compile error, `E0603 private module`.

The facade pattern, read off `std`'s own `lib.rs`, is the most directly relevant finding
in this document. `std` declares `extern crate alloc as alloc_crate;` and then its public
surface is a wall of re-export lines:

```rust
#[stable(feature = "rust1", since = "1.0.0")]  pub use core::cell;
#[stable(feature = "rust1", since = "1.0.0")]  pub use core::mem;
#[stable(feature = "rust1", since = "1.0.0")]  pub use alloc_crate::boxed;
#[stable(feature = "rust1", since = "1.0.0")]  pub use alloc_crate::vec;
```

while the implementation is `mod sys;` — private, no `pub`. Three properties worth
stealing:

1. **The re-export carries the stability annotation.** `#[stable]` / `#[unstable(feature
   = …, issue = …)]` sits on the *surface* line, not on the definition. The same item can
   be permanently stable in `core` and gated in `std`, or vice versa. The surface is
   where the promise is recorded.
2. **Re-export, not redefinition.** `std::vec` *is* `alloc::vec`; there is no wrapper,
   no shim, no drift, and no second place to change.
3. **The layering is the purity split** — see the last section.

## Build-graph enforcement: Bazel, Nx, dependency-cruiser

**Bazel visibility** ([docs](https://bazel.build/concepts/visibility))

- **Enforced by**: the build tool, at the **analysis phase** — "A target will fail to
  build during the analysis phase if it violates the visibility of one of its
  dependencies."
- **Surface is**: a per-target attribute, `visibility = ["//friend:__pkg__"]`, with
  `__pkg__` (that package only) vs `__subpackages__` (and below), plus `package_group`
  for named reusable allowlists and `default_visibility` per package.
- Separately, **load visibility** guards `.bzl` files (`visibility("private")`), and
  underscore-prefixed Starlark symbols cannot be loaded cross-file at all. The docs
  recommend combining the two for fine grain, and factoring shared allowlists into an
  `internal_defs.bzl` to "prevent accidental skew".
- **Reaching past it**: build failure. Escape hatch `--check_visibility=false`, which the
  docs say "shouldn't be done for production usage in submitted code".
- Stated best practice: "Avoid setting `default_visibility` to public… It's better to be
  explicit about which targets are part of a package's public interface."

**Nx `@nx/enforce-module-boundaries`**
([docs](https://nx.dev/features/enforce-module-boundaries))

- **Enforced by**: ESLint (also an oxlint plugin, also `nx conformance:check` in CI for
  non-JS projects).
- **Surface is**: a **directory-plus-barrel** — each project declares its public API in
  `index.ts`, reached through a tsconfig path alias. The rule bans deep imports into
  another project and bans reaching a project by relative or absolute path.
- **Plus a tag lattice**: projects carry `tags`, and `depConstraints` says
  `sourceTag: "scope:client"` → `onlyDependOnLibsWithTags: ["scope:client", "scope:shared"]`,
  with exact/regex/glob/`*` tag forms. Untagged projects may depend on nothing.
- **Reaching past it**: a lint error at the importing site.

**dependency-cruiser**
([rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md))

- **Enforced by**: a standalone CLI over the resolved dependency graph, run in CI.
- **Surface is**: pure **rule configuration** — nothing about the tree declares itself.
- The relevant primitive is **group matching**: capture a segment in `from.path` and
  back-reference it in `to.pathNot`. The docs' own example forbids cross-talk between
  peer folders without enumerating them:

  ```json
  { "from": { "path": "^src/business-components/([^/]+)/.+" },
    "to":   { "path": "^src/business-components/([^/]+)/.+",
              "pathNot": "^src/business-components/$1/.+" } }
  ```

  The same shape expresses "outsiders may only reach a folder's `index.ts`" by putting
  the surface file in `to.pathNot`.
- Also carries `scope: "folder"` (rules over folders rather than modules), `reachable`
  (dead code and forbidden transitive paths), `ancestor`, and `moreUnstable`.
- **Reaching past it**: a CI failure with a named rule.

Of the three, dependency-cruiser is the one that transfers unchanged to a vendored tree:
it needs no cooperation from the vendored module's own metadata, only a regex over paths.

## Surface-diff review artifacts

**Microsoft API Extractor** ([API report](https://api-extractor.com/pages/overview/demo_api_report/))

- **Enforced by**: a build step plus **code review**. It emits
  `etc/<name>.api.md` — a Markdown file of pseudocode signatures, headed
  "Do not edit this file. It is a report generated by API Extractor." The file is
  tracked by git, so an API change shows up as a diff in the PR.
- **Surface is**: **generated** from the entry-point `.d.ts`, with per-item release tags
  (`@public`, `@beta`, `@alpha`, `@internal`) in doc comments driving what lands in
  which report.
- **Reaching past it** (leaking a private type through a public signature) is caught by
  `ae-forgotten-export`: *"The symbol "IWidget" needs to be exported by the entry point
  index.d.ts"*, a warning that fails the build via nonzero exit — and which can instead be
  *redirected into the report file*, turning a build break into a reviewable diff.
- The review teeth are a separate mechanism: rushstack uses `.github/CODEOWNERS` to
  require named approvers when a report file changes.

The same pattern, independently reinvented, in five other ecosystems:

| ecosystem | artifact | enforcer |
| --- | --- | --- |
| **Go stdlib** | `api/go1*.txt` (frozen, per release) + `api/next/*.txt` (pending) + `api/except.txt` (sanctioned removals) | `go test cmd/api` — a **test**. Any new exported symbol absent from `api/next/` prints `+Symbol` and fails; any removal absent from `except.txt` prints `-Symbol` and fails |
| **.NET** | `PublicAPI.Shipped.txt` + `PublicAPI.Unshipped.txt` per project | the **compiler**, via `Microsoft.CodeAnalysis.PublicApiAnalyzers`. `RS0016` on any public symbol not in the files, with a code fix that adds it. Closest thing to compiler-enforced manifest in this survey |
| **.NET, second layer** | `src/<Library>/ref/*.cs` — "a surface-area-only assembly that represents the public API", generated by GenAPI, checked in | the compiler again; other libraries build against the *ref*, and `APICompat` package validation compares shipped assemblies for breaks |
| **Kotlin** | `<module>.api` dumps, `apiDump`/`apiCheck` Gradle tasks | Gradle task in CI (Kotlin's `binary-compatibility-validator`; now in maintenance mode, superseded by validation built into the Kotlin Gradle plugin) |
| **Android / AndroidX** | `api/current.txt` and per-version txt files | `metalava` in the platform build; mismatch fails the build |
| **Rust** | no checked-in file; `cargo-public-api` diffs, `cargo-semver-checks` classifies the break | CI |

The recurring shape: **a generated, checked-in, human-readable flattening of the surface,
whose diff is the review unit.** It enforces nothing at the consumer. What it buys is that
widening the surface becomes a visible, attributable, approvable event instead of a side
effect of an unrelated commit.

## Does the public surface folder ever OWN the code?

Yes. It is a real and named pattern, it is a minority, and it is chosen for one specific
reason: when the surface must be *consumed by parties who cannot see the private tree at
all*, which is exactly the vendored/copied case.

### Linux `include/uapi/` — the clearest case

The 2012 UAPI split moved every user-visible kernel definition out of `include/linux/`
into `include/uapi/linux/`. The public directory owns the definitions, and in-kernel
private headers include *from* it. `include/linux/stat.h`:

```c
#include <asm/stat.h>
#include <uapi/linux/stat.h>

#define S_IRWXUGO	(S_IRWXU|S_IRWXG|S_IRWXO)
```

Same in `include/linux/fs.h` (`#include <uapi/linux/fs.h>`). The dependency arrow points
from private to public, and kernel-only additions layer on top.

- **Gained**: `make headers_install` became a *copy* of a directory rather than a
  scrubbing pass (it previously had to strip `__KERNEL__`-guarded regions out of mixed
  headers). The exported set became inspectable — you can see the ABI by listing a
  directory. And the boundary became reviewable: a patch touching `include/uapi/` is
  visibly an ABI change.
- **Regretted / cost**: a very large mechanical churn across the whole tree, and the
  boundary still needs judgment — a definition placed in `uapi/` is an ABI promise
  forever, so the split moved the hard decision to "which directory" rather than
  removing it. `#ifdef __KERNEL__` did not vanish entirely.

### Kubernetes `staging/` — the vendored-distribution case

[staging/README.md](https://github.com/kubernetes/kubernetes/blob/master/staging/README.md)

"The code in the `staging/` directory is **authoritative, i.e. the only copy of the
code**." `k8s.io/api`, `k8s.io/apimachinery`, `k8s.io/client-go` etc. live under
`staging/src/`, and `kubernetes/kubernetes`'s own private code imports them by their
public path — resolved back to `staging/` through Go workspace `replace` directives. A
publishing-bot then *copies* each staged directory out to its own `k8s.io/*` repo.

This is precisely "the public surface folder owns the code, private code imports from it",
in a project whose distribution model is copy-publication.

Enforcement is a **manifest**, `staging/publishing/import-restrictions.yaml`, checked in
CI: per `baseImportPath`, an explicit `allowedImports` list plus `ignoredSubTrees`.
The vocabulary layer is kept near-dependency-free by that manifest:

```yaml
- baseImportPath: "./staging/src/k8s.io/api"
  allowedImports:
  - k8s.io/api
  - k8s.io/apimachinery
  - k8s.io/klog
```

- **Gained**: consumers get a small, independently versioned, genuinely importable
  library without vendoring the monorepo. The surface is a directory you can point a tool
  at. Adding a new staged repo is a documented, SIG-approved process — the boundary has a
  governance gate, not just a convention.
- **Regretted**, and recorded in the manifest itself, next to `./pkg/apis/core`:

  > `# the following are temporary and should go away. Think twice (or more) before
  > adding anything here. Main goal: pkg/apis should be as self-contained as possible.`
  > — followed by entries for `k8s.io/kubernetes/pkg/apis/apps`,
  > `k8s.io/kubernetes/pkg/api/legacyscheme`, `k8s.io/api/apps/v1`

  That is the characteristic failure mode: the surface folder, because it owns real code,
  accretes dependencies back into the private tree, and the allowlist becomes the place
  those leaks are parked rather than fixed. The other recorded costs are the machinery —
  `./hack/update-vendor.sh`, "Do not edit go.mod or go.sum … manually", published repos
  needing `PULL_REQUEST_TEMPLATE.md` text saying PRs are not accepted there — i.e. a
  copy-published surface needs a whole apparatus to keep the copy from being edited.

### Others in the same family

- **C/C++ `include/` vs `src/`** — the oldest version. The installed surface is a
  directory of headers that own the declarations; `src/` includes them. Enforced by
  nothing but the install rule; reaching past it is impossible only because the private
  headers aren't shipped. Header-only and single-header vendored libraries collapse the
  distinction entirely.
- **IDL/proto `api/` trees** — `envoyproxy/data-plane-api`, `googleapis`. The `.proto`
  files own the contract; both server and client generate from them. The surface folder
  owns the code in the strongest possible sense: it is the *only* hand-written form, and
  both sides are derived.
- **.NET `ref/`** — a surface-area-only compiled assembly, checked in as generated C#.
  Impl projects compile *against the ref*, so the private tree literally depends on the
  surface. This is the pattern with compiler teeth.

### Honest assessment

The re-export facade (Rust `std`, an Nx `index.ts`, a barrel) is the mainstream default,
and it wins when producer and consumer share one build. The surface-owns-the-code
inversion earns its cost in exactly three conditions, all of which hold for a vendored
module:

1. The consumer cannot see, and must not depend on, the private tree.
2. The surface is distributed by copying, so it must be a self-contained directory.
3. You want the surface's dependency footprint to be checkable — which you can only do if
   the surface *has* its own dependencies to check, i.e. if it owns code.

The price, on the evidence of `import-restrictions.yaml`, is that you must enforce the
surface's own dependency ceiling from day one. A surface folder that owns code and has no
dependency ceiling degrades into a second implementation tree with a nicer name.

## Splitting pure vocabulary from impure runtime services

Yes, this is established, and the canonical example is the one already cited.

**Rust `core` / `alloc` / `std`** is exactly this split, structured as three crates:

- **`core`** — pure, portable vocabulary. Types and traits with no runtime requirement at
  all: `Option`, `Result`, `Ordering`, the operator traits, `mem`, `ptr`, `iter`,
  `marker`. No allocator, no OS, no I/O. Compiles on bare metal.
- **`alloc`** — needs *one* runtime capability, a global allocator: `Box`, `Vec`,
  `String`, `Rc`, `format!`.
- **`std`** — needs an operating system: `fs`, `net`, `process`, `thread`, `io`, `env`,
  `time`.

Three things make it work, all visible in `std/src/lib.rs`:

1. **The purity level is the crate boundary**, so it is enforced by the compiler rather
   than by convention. `no_std` code depends on `core` and *cannot* reach `std`.
2. **The impure layers depend on the pure one, never the reverse.** `alloc` uses `core`;
   `std`'s private `mod sys` uses `core`. This is the surface-owns-the-code inversion
   applied to purity: the pure vocabulary crate owns its types, and the impure layers
   import from it.
3. **The facade hides the split from ordinary users.** `std` re-exports the whole of
   `core` and `alloc` under its own paths (`pub use core::mem;`,
   `pub use alloc_crate::vec;`), so `std::vec::Vec` and `alloc::vec::Vec` are the same
   type. Nobody pays for the layering unless they need it.

The same shape recurs:

- **Haskell** — `base` vs `IO`; purity is in the *type*, and the effectful surface is
  named by `IO a`. The strongest version of the idea and the least portable to a language
  without an effect type.
- **JPMS `java.base`** vs `java.sql` / `java.net.http` / `java.desktop` — the platform
  was modularized along roughly this axis, and `java.base` is what every module reads
  implicitly.
- **Kubernetes** `k8s.io/api` (types only — its allowlist permits only `apimachinery` and
  `klog`) vs `k8s.io/client-go` (talks to a server). The manifest *is* the purity
  enforcement.
- **Effect-system / ports-and-adapters designs generally** — a `domain`/`core` module with
  no I/O dependencies, an `adapters` module that has them, and a dependency rule (usually
  a dependency-cruiser or ArchUnit rule) forbidding `core → adapters`.

The portable recipe, independent of language:

1. Give the pure vocabulary its own directory or module, and let it **own** its types.
2. Give it a **dependency ceiling** expressed as a checked allowlist — this is the part
   people skip, and it is the only part that keeps the layer pure.
3. Have the impure layer depend on the pure one, enforced by a graph rule.
4. Optionally re-export both through one facade so ordinary consumers see a single
   surface, keeping the split available to the consumers who need it.

## Sources

- Go: [`cmd/go` helpdoc](https://github.com/golang/go/blob/master/src/cmd/go/internal/help/helpdoc.go),
  [`cmd/api` main_test.go](https://github.com/golang/go/blob/master/src/cmd/api/main_test.go)
- Node.js: [Modules: Packages](https://nodejs.org/api/packages.html), [publint rules](https://publint.dev/rules)
- Java: [Jigsaw: State of the Module System](https://openjdk.org/projects/jigsaw/spec/sotms/),
  [OSGi Core 8.0 §3 Module Layer](https://docs.osgi.org/specification/osgi.core/8.0.0/framework.module.html)
- Rust: [Visibility and privacy](https://doc.rust-lang.org/reference/visibility-and-privacy.html),
  [`library/std/src/lib.rs`](https://github.com/rust-lang/rust/blob/master/library/std/src/lib.rs)
- Bazel: [Visibility](https://bazel.build/concepts/visibility)
- Nx: [Enforce module boundaries](https://nx.dev/features/enforce-module-boundaries)
- dependency-cruiser: [rules reference](https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md)
- API Extractor: [The API report](https://api-extractor.com/pages/overview/demo_api_report/),
  [Configuring an API report](https://api-extractor.com/pages/setup/configure_api_report/)
- .NET: [PublicApiAnalyzers help](https://github.com/dotnet/roslyn-analyzers/blob/main/src/PublicApiAnalyzers/PublicApiAnalyzers.Help.md),
  [project-guidelines.md](https://github.com/dotnet/runtime/blob/main/docs/coding-guidelines/project-guidelines.md)
- Kotlin: [binary-compatibility-validator](https://github.com/Kotlin/binary-compatibility-validator)
- Linux: [headers_install.rst](https://github.com/torvalds/linux/blob/master/Documentation/kbuild/headers_install.rst),
  [`include/linux/stat.h`](https://github.com/torvalds/linux/blob/master/include/linux/stat.h)
- Kubernetes: [staging/README.md](https://github.com/kubernetes/kubernetes/blob/master/staging/README.md),
  [import-restrictions.yaml](https://github.com/kubernetes/kubernetes/blob/master/staging/publishing/import-restrictions.yaml)
