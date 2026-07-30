# android pack

Technology **stub** pack: Android app development — Gradle/AGP builds, `AndroidManifest.xml`, permissions, signing configs, product flavors, emulator workflows.

## Stub, deliberately

No rules are captured yet. Durable, project-agnostic practices go into `RULES.md` as they are *earned* — a pack that ships guesses about a technology nobody has shipped on teaches the wrong things confidently. The expected first source is `missingbulb/ShoutsAndWhispers`.

The fingerprint is the app module's manifest at any depth (`android/app/src/main/AndroidManifest.xml`), which is where a Flutter or plain-Gradle project alike puts it — so the pack is suspected wherever a real Android module lives, not only at a repo root.
