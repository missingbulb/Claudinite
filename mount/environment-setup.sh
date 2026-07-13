#!/usr/bin/env bash
# GENERIC Claudinite cloud environment setup — identical across projects and
# owned by the corpus. It lives here (synced into every consumer's
# .claudinite/mount/), so a project commits NO copy of its own; it only wires the
# SessionStart check
# hook and pastes this body into its environment.
#
# HOW TO USE: copy this full body into the Claude Code Web environment's "Setup
# script" field (environment settings). It runs once when the environment is
# created; the filesystem is snapshotted and reused, so installs aren't repaid
# per session. Per-toolchain install logic lives in Claudinite packs
# (packs/env.mjs, driven by the repo's .claudinite-checks.json), NOT here — so
# this script never changes as requirements evolve.
set -euo pipefail

# The Setup script runs as root starting in the checkout's PARENT dir. cd into
# the checkout — the one dir under here that mounts Claudinite.
root="$(dirname "$(find "$PWD" -maxdepth 2 -name .claudinite-checks.json 2>/dev/null | head -n1)")"
cd "$root"

# 1. Prime the Claudinite corpus so the pack env declarations + env.mjs exist
#    before the first session (the SessionStart sync keeps it current after).
#    Current layout first; fall back through the legacy pre-relocation paths.
for h in .claudinite/mount/sync-claudinite.sh .claudinite/sync-claudinite.sh .claude/hooks/sync-claudinite.sh; do
  [ -f "$h" ] && { bash "$h" || true; break; }
done

# 2. Generated-file merge hygiene — universal, cheap, harmless where unused: the
#    `ours` driver .gitattributes maps GENERATED files to, plus conflict-replay.
git config merge.ours.driver true
git config rerere.enabled true

# 3. Install every active pack's declared environment requirement (Flutter SDK,
#    node deps, …). The SessionStart `env.mjs check` then probes each directly.
node .claudinite/packs/env.mjs install
