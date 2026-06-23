# Adopting Claudinite

How a consuming repo bootstraps these shared guidelines.

Bootstrapping is **idempotent and accumulative**: run it on a fresh repo to
adopt Claudinite, or re-run it on a repo that already adopted Claudinite to
true up any requirements added since. Every step below first **checks** whether
the requirement is already satisfied and only acts on what's missing, so
re-running never duplicates work or clobbers existing setup. When new
requirements are added to this list later, re-running bootstrap is how a
consumer picks them up.

## 1. Add the submodule

Check first — skip if `.claudinite/` is already a registered submodule:

```sh
if ! git config --file .gitmodules --get-regexp '^submodule\..*\.path$' \
     | grep -q ' \.claudinite$'; then
  git submodule add https://github.com/missingbulb/Claudinite.git .claudinite
fi
```

If the submodule is registered but its working tree is empty (a fresh clone),
initialize it instead:

```sh
git submodule update --init --recursive .claudinite
```

## 2. Import the corpus from `CLAUDE.md`

The consumer's `CLAUDE.md` must `@import` the corpus. Add the line only if it
isn't already present:

```sh
grep -qxF '@.claudinite/README.md' CLAUDE.md 2>/dev/null \
  || printf '\n@.claudinite/README.md\n' >> CLAUDE.md
```

## 3. Initialize the submodule in fresh clones and sessions

Submodules aren't pulled automatically. The consumer's SessionStart hook must
run the init so every clone and session has the corpus. Confirm this command is
present in the hook and add it if missing:

```sh
git submodule update --init --recursive
```

If the consumer has no SessionStart hook yet, create one containing this
command. If a hook exists but doesn't run it, append the command.

## 4. Note it in the consumer's README

The consumer's README should mention the submodule so contributors know what it
is. Add this only if no Claudinite mention already exists:

```md
Shared Claude guidelines are mounted at `.claudinite/` via
[Claudinite](https://github.com/missingbulb/Claudinite).
```

## Re-running

Re-run these steps any time — for example after this list grows. Each step is a
no-op when its requirement is already met, so a fully-bootstrapped repo passes
through cleanly while a partially-bootstrapped one gets only the missing pieces
filled in.
