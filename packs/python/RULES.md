# Python

Portable, project-agnostic practices for a Python package built around an optional
heavy/native dependency (an ML model, a native audio/GPU library, a cloud SDK) that
most of the codebase — and the whole test suite — must run without. The discipline is
one theme: **keep the importable core dependency-free, and gate every heavy thing
behind an optional extra that is imported lazily.** True for any such package read cold.

## Keep the importable core dependency-free; heavy/native deps go in optional extras, not base `dependencies`

The core of a package (its logic, storage, CLI, any web/dashboard layer) should import
and run — and be **fully testable** — with only the Python standard library. Declare
`dependencies = []` (or the genuinely-always-needed minimum) in `[project]`, and put every
heavy, native, or ML dependency under a **named `[project.optional-dependencies]` extra**
(`pkg[yamnet]`, `pkg[speaker]`, `pkg[dev]`), so installing the package is cheap and the
heavy stack is pulled only when a user opts into the feature that needs it.

The payoff is a test suite that runs anywhere with no ML/native toolchain: the offline
and mock paths exercise the whole pipeline, and CI never has to install TensorFlow or
Torch to be green. If a `pip install <pkg>` with no extra can't import the core, a heavy
dependency has leaked into the base set — move it to an extra.

## Import a heavy/optional dependency lazily — inside the function or constructor that needs it, never at module top level

A top-level `import tensorflow` (or `torch`, or a native-extension binding) runs the
moment anything imports the module, dragging the whole heavy stack into `import <pkg>` and
breaking every core path for anyone who didn't install the extra. Put the heavy import
**inside** the function, method, or `__init__` that actually uses it, so importing the
package stays cheap and only the code path that needs the dependency pays for it.

The clean shape is a tiny backend interface plus a `load_default()`/registry that
lazy-imports the *selected* backend by name — so the module that wires backends together
never imports any of them at load time, and adding a heavy backend never taxes the core.

## Guard the optional import with `try/except ImportError` and re-raise a message naming the exact extra to install

When the lazy import can fail because the extra isn't installed, wrap it in
`try: import … except ImportError as exc:` and re-raise with an actionable message that
names the precise install command — `raise ImportError('… needs the optional deps. '
'Install them with:  pip install "pkg[extra]"') from exc`. The failure a user hits then
tells them exactly how to fix it, instead of a bare `ModuleNotFoundError` from deep inside
a backend.

An import kept **only** to probe whether an optional stack is present (its name is never
used directly) is a real linter false-positive for unused-import (`F401`) — mark that line
`# noqa: F401` and record the deliberate suppression, rather than deleting the probe or
letting the warning ride.

## Provide a stdlib-only implementation behind the same interface so tests and offline modes need no extra

Give the swappable interface a **dependency-free** implementation — a scripted/mock
backend built on the standard library alone — alongside the heavy real one. That
stdlib backend is what the test suite and any offline/`simulate` mode run on, so the
full pipeline is exercised end-to-end without the ML or native stack ever being
installed. The heavy backend is then just one more implementation of the interface,
selected at runtime, never a hard import the core or the tests depend on.
