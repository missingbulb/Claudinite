# Adopting Claudinite

How a consuming repo bootstraps these shared guidelines.

## 1. Add the submodule

```sh
git submodule add https://github.com/missingbulb/Claudinite.git .claudinite
```

## 2. Import the corpus from `CLAUDE.md`

Add a single line to the consumer's `CLAUDE.md`:

```md
@.claudinite/README.md
```

## 3. Initialize the submodule in fresh clones and sessions

Submodules aren't pulled automatically. Run this in the consumer's SessionStart
hook so every clone and session has the corpus:

```sh
git submodule update --init --recursive
```
