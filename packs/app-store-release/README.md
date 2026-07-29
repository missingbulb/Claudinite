# app-store-release pack

Opt-in release **stub** pack: releasing to the Apple App Store — App Store Connect, provisioning, App Attest, TestFlight, review guidelines, release cadence.

## No fingerprint, on purpose

`detect: null`. A project declares this pack when it first ships there; nothing in the tree announces the intent until an exercised release wires a workflow to fingerprint, so the declaration is authoritative and the fingerprint-drift check stays quiet in both directions.

## Stub, deliberately

No rules are captured yet — durable, project-agnostic practices go into `RULES.md` as they are *earned*. Expected first source: `missingbulb/ShoutsAndWhispers`.
