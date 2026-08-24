# Moved

The update flows now live beside the pack that owns them, at
`packs/claudinite-lifecycle/updates/`.

The modules beside this file are one-line re-exports kept so a member's vendored update
worker — copied once, stale forever — still resolves the paths it names against a freshly
fetched canon tree. They are deleted once no fielded worker names one (#1317).
