# play-store-release pack

Opt-in release **stub** pack: releasing to the Google Play Store — Play Console, signing, integrity, staged rollout.

## No fingerprint, on purpose

`detect: null`. A project declares this pack when it first ships to Play; nothing in the tree announces that intent until an exercised release wires a workflow to fingerprint. Until then the declaration is authoritative, which also means the fingerprint-drift check stays quiet in both directions.

## Stub, deliberately

No rules are captured yet — durable, project-agnostic practices go into `RULES.md` as they are *earned*. Expected first source: `missingbulb/ShoutsAndWhispers`.
