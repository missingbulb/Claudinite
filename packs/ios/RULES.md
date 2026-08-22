# iOS

- **The agent's own sandbox has no macOS and no Swift toolchain — every Swift/iOS change is
  verified by CI alone.** The toolchain isn't merely absent from the image; the download is
  typically blocked by the sandbox's own network policy, not just missing. Nothing Swift-side
  compiles or runs locally in an agent session, so budget confidence accordingly: a Swift/iOS
  change is "verified" only once the macOS CI runner reports on it, never before.

- **An Apple Developer Documentation page is JS-rendered — a plain fetch returns only the page
  title.** Fetch the JSON mirror instead: `developer.apple.com/tutorials/data/documentation/…`
  (same path as the HTML page, under `tutorials/data/`) carries the actual content.
