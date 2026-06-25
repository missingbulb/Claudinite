# Text & file manipulation

Portable practices for searching, extracting, and rewriting text across a
repository's files — grep/sed sweeps, renames and relocations, and the silent
reference-breakage they leave behind. These are project-agnostic; they're the
mechanics half of editing a codebase as text. (General software-engineering
practices live in [engineeringPractices.md](engineeringPractices.md); the
merge-time relocation traps — git's rename detection, references that break
with no conflict across a merge — live in
[git-and-github.md](git-and-github.md), "Merging across a file relocation".)

- Deleting or renaming a file isn't done until you've grepped the repo for inbound references to it — a removed doc, module, or renamed path leaves dangling links, imports, or index entries behind that no test necessarily catches (e.g. a README docs-index link to a deleted file stays green). Grep the whole tree for the old path right after the removal and fix every hit in the same change.
- When renaming `foo/` → `bar/foo/`, a naive repo-wide string-replace of `foo/` → `bar/foo/` causes two silent corruptions: files already under the target namespace double-prefix (`bar/foo/file` → `bar/bar/foo/file`), and external URLs containing the string `foo/` get rewritten. Scope the replace to only internal path strings that need it, or do the replace then make a targeted post-pass reverting matches inside URLs and already-correct paths.
- A grep/sed rename pass over a path (`foo/bar/baz.js`) won't match it when built from `path.join` segments (`path.join(__dirname, "foo", "bar", "baz.js")`) or wrapped across a line in a comment — those references survive the rewrite and break only at run time. After a mechanical path-rename pass, also search for the path's individual segment tokens and run the test suite; the test suite, not the grep, surfaces a missed reference.
- When writing file content captured from a script or command output, use the `Write` tool directly — never `cp` from an internal Claude Code path (`/root/.claude/projects/...`). The tool-results paths are harness-internal and inaccessible to shell commands; referencing them via Bash triggers a permission prompt. Capture the output in context and pass it to `Write`.
