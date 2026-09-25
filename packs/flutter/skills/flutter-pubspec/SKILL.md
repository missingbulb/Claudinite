---
name: flutter-pubspec
description: Telling a real Flutter dependency change from lockfile churn. Use when pubspec.lock shows up in a diff, or when editing pubspec.yaml or pubspec.lock.
metadata:
  body: guidelines
  usage:
    expect: triggered
  force-load-on-file-edits-paths:
    - "**/pubspec.yaml"
    - "**/pubspec.lock"
---

# pubspec and the lockfile

- **`pubspec.lock` moving without `pubspec.yaml` moving is version skew, not a dependency change.**
  An app commits its lockfile (only a *library* package gitignores it), so the file is tracked on
  purpose — the thing to keep out of the diff is the churn a local `flutter pub get` produces when
  the installed SDK resolves differently from CI's. Unless you deliberately ran an upgrade, revert
  it: `git checkout -- pubspec.lock`. (pubspec-lock-moving)
