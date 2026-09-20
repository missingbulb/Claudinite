# flutter — why its rules and checks are what they are

Maintenance and review only: the `rule-revalidation` pass reads these to reaffirm or retire what
the pack asks. Never vendored, never loaded by a session.

- **(check:flutter/network-fetch-in-widget-tree)** The widget-test binding blocks real HTTP with a
  400-returning stub client, so a tree that constructs its own `NetworkImage` / `CachedNetworkImage`
  / `NetworkTileProvider` renders error boxes and every golden over it is a picture of a failure.
  Scoped to `lib/ui|screens|widgets` because that is the tree the pack's architecture keeps free of
  platform concerns; `main.dart` and the adapters beside it are where the real provider is
  legitimately constructed. Retire it if the binding ever serves real requests, or if Flutter grows
  a first-class test-time image substitute that makes the constructor safe in the tree.
- **(check:flutter/device-clock-not-injected)** A `DateTime.now()` in shipped Dart is a read no test
  can pin: a relative-time widget cannot be asserted and its golden changes with the wall clock. It
  replaced the "Inject the clock" prose rule outright — the surviving architecture rule already
  names the clock as one of the concerns that enters the UI as a port, so the check plus its fix
  line carries everything the deleted bullet said. The class that implements the port is exempt (it
  is the one place the read belongs), as is `lib/testing/`, which pins its own clock for the fakes.
  Retire it if Dart's own test binding gains a way to pin the process clock.
