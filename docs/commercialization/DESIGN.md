# Claudinite as a licensed, installed product — end state

Claudinite is adopted by a **repository**. The repository declares its packs, runs its own scheduled
tasks in its own Actions, validates its own state through its own checks, and carries its own local
packs. Everyone and everything working on that repository gets the same corpus because the
repository has it.

Delivery follows from that: **Claudinite installs into the repository's working tree.** A manifest
and a lockfile are committed; the corpus is fetched and never committed.

```
Committed                                     Materialised by install, gitignored
├── .claudinite-settings.json  the manifest    .claudinite/shared/    engine + entitled packs
├── claudinite-lock.json       the lockfile    .claudinite/claudinite-rules.GENERATED.md
├── .claudinite/licence.jwt    the entitlement .claude/skills/        mounted skills
├── .claudinite/local/packs/   the repo's own  .claudinite/cache/     verified artifacts
├── .claude/settings.json      hook wiring
├── CLAUDE.md                  the @-import
└── .github/workflows/*.yml    two thin stubs
```

The mount path, the rules index, the skills mount and the hook entry points are where they are;
what changes is who writes them.

---

## 1. Artifacts and the two planes

A **pack version** and an **engine version** are each one immutable, content-addressed, signed
artifact. Versions are never re-published; a fix is a new version.

- **Data plane** — a CDN serving artifact bytes by digest. Immutable, cacheable, and the only thing
  an install downloads at volume.
- **Control plane** — a small service that answers *what may this repository have*, and mints
  credentials. It serves metadata and entitlement, never bytes.

Splitting them is what makes install behave like any other pinned build-time dependency: a
lockfiled digest fetched from a cache-friendly URL. The engine ships as a compiled binary; a pack
ships as a signed archive whose contents the install materialises.

**Rules and skills are readable once materialised.** The harness reads them as Markdown from disk,
so the artifact is opaque in transit and at rest and the materialised subset is not. The licence,
not the format, is what makes copying a breach.

---

## 2. Identity and licensing

A **licence** is issued to an *account* — a GitHub organisation or user — and carries entitlements:
which packs, which channels, and the policy in §6. Repositories inherit their account's licence;
there is no per-repository purchase and no per-developer credential.

**In GitHub Actions, the repository proves itself.** The workflow requests an OIDC token; the
control plane verifies it against GitHub's issuer and reads `repository`, `repository_id`,
`repository_owner` and `repository_owner_id`. The `_id` claims are immutable, so a rename does not
break a licence and no repository can present as another. **No secret is stored in the customer's
repository.** The only wiring is `permissions: id-token: write` on the two stubs.

**Everywhere else, the repository carries a licence file.** `.claudinite/licence.jwt` is a signed,
short-lived token naming the repository id and its entitlements, verified offline against a public
key compiled into the engine. **The repository's own scheduled task mints it**, using the OIDC
identity it already has, and commits it well inside its validity window. So a developer clones and
installs with no login, no token and no account, and a web session finds the licence already in the
checkout. Revocation is refusing to re-mint: the file expires on its own.

A repository with no licence file and no OIDC installs the free set. Same command, same paths, same
behaviour — the free tier is an entitlement, not a different product.

**Alternatives and their drawbacks.** A per-repository secret is a credential to create and rotate
in every repository, which is per-repository toil forever. A per-developer token makes every new
hire a setup task and every departure a revocation. A licence checked online at every install makes
the control plane an availability dependency of every developer's session; an offline-verifiable
signature with periodic refresh does not.

---

## 3. Install

`claudinite install` is idempotent and is the only way the mount is written.

1. Read the manifest and the lockfile.
2. Establish entitlement: OIDC when running in Actions, otherwise the licence file, otherwise free.
3. Resolve the declared packs against the entitlement. **A declared pack the licence does not cover
   is a named, fatal error** — never a silent omission, because a silently reduced corpus is
   indistinguishable from a corpus with nothing to say.
4. Fetch what the cache lacks; verify digest and signature before anything is written.
5. Materialise the mount, generate the rules index, mount the skills, converge the hook wiring.
6. Self-test, and stamp the lockfile digest so a matching tree is a no-op.

**The entry point is a small public package**, whose only job is to establish entitlement and fetch
the engine. Keeping it public and free is what makes adoption a single command with nothing to
configure first; everything it downloads is licensed.

**Install runs before the session, never inside it.** In Actions it is a step in the stub; in a web
environment it is the Setup script; on a developer's machine it is the command run after clone, the
way a build's dependencies are. The `SessionStart` hook **verifies** — mount present, lockfile
matched — and halts loudly with the command when it is not.

**Alternative and its drawback.** A hook that installs on demand cannot repair the session it runs
in: instructions are read as context is assembled, so that session runs with no rules while looking
entirely healthy. Silent absence is the one failure this design refuses.

---

## 4. Updates

The engine and every pack are lockfile entries, so an update is a lockfile change.

The repository's `update` task resolves the newest versions its policy permits, writes the lockfile,
and opens the maintenance pull request. **The review surface is the lockfile diff plus the release
notes for each moved version** — a few lines, the same shape as a dependency bump — rather than a
rewrite of the corpus. A pin in the manifest holds a version; the resolver honours it, and rollback
is moving the pin.

Because the mount is regenerated rather than migrated, a canon rename needs no relocation record.
Only files the repository owns — its manifest, its stubs, its local packs — are ever migrated.

---

## 5. Adopting and updating packs

Adopting a pack is a manifest edit plus an install; the pack's adoption interview runs against the
newly available pack and records its answers on the manifest entry, as now.

Update authorization is per pack, and it is **GitHub's authorization, not a second one**:

- Each moved pack labels the maintenance pull request.
- A required status check evaluates the policy for every moved pack and passes only when that pack's
  rule is satisfied — automatic, or an approving review from a named GitHub team.
- GitHub's branch protection is what enforces it.

**Alternative and its drawback.** Our own roles and approvals would duplicate an identity system the
customer already administers, and would be a second place for a leaver to remain an approver.

---

## 6. Org policy

Policy is issued **with the account's entitlement** and cached at install, so it exists in exactly
one place and no repository holds a copy to drift.

It states: which packs may be declared at all; per pack, the permitted version range or channel and
whether updates are automatic, review-gated, security-only or frozen; whether a repository may adopt
a new permitted pack freely or must file a request an approver resolves; the approving teams; and a
canary set.

**Staged rollout reads state rather than scheduling it.** A canary repository takes a new version
immediately; the rest take it once the canary has held it with its checks green. The canary's own
repository is the signal, so there is no central rollout coordinator to run or to fail.

**Guardrail overrides carry a reason and an expiry.** A check may be lowered or disabled by
declaration — never by editing a pack — with a stated reason, and an expired override fails the run
rather than lapsing quietly. That is what keeps a waiver list from becoming permanent.

---

## 7. Security review of closed packs

An entitled account can materialise the readable source of any version it is entitled to, and the
diff between two versions, under the same licence: reading is licensed, publishing is not. Each
version carries its signature, its build provenance and an SBOM.

This makes the natural review the right one — a security team reviews the diff between the version
they approved and the version being proposed, which is exactly what the update pull request
proposes. A product an enterprise cannot audit is a product an enterprise does not adopt, so
auditability is a property of the design rather than a concession.

---

## 8. Fleet management

The **GitHub App installation is the fleet.** The repositories the App is installed on are the
roster; adding a repository is installing, removing one is uninstalling, both in GitHub's own
interface. There is no roster file, no owner setting and no exclude list.

Work stays where it belongs: **each repository runs its own tasks against its own state.** The fleet
layer does only what one repository cannot — aggregate (who is on which version, who is failing, who
is outside policy) and fan out (adopt a pack across repositories, force an update). It runs in a
repository of the organisation's choosing, authenticated as the App.

The optional hosted surface is **read-only**: an aggregate view the organisation signs into with
GitHub. Execution stays on the customer's runners and inference on their own account, so the product
adds no inference cost and no repository depends on us to run.

**Alternatives and their drawbacks.** A central planner needs a maintained repository list and
becomes a single point of failure for every member. Hosted execution acquires inference cost, ends
the offline session, and makes an outage of ours an outage of their CI.

---

## 9. Layers: canon, org, repository

Three layers resolve in one fixed order — **repository local, then organisation, then canon** — and
the order is not configurable, because a configurable precedence makes "why did this rule apply?"
unanswerable.

- **Canon packs** are ours, from the registry.
- **Organisation packs** live in the account's own registry namespace, authored in a repository of
  the organisation and published by that repository's release task. They are versioned, lockfiled
  and installed by the same path as canon packs, so an organisation's growth lifecycle is the same
  mechanism as ours rather than a parallel one.
- **Repository local packs** stay committed, unversioned and immediate — the fastest loop, and the
  place a lesson lands before anyone decides it is portable.

**Overriding canon is a declaration, never an edit.** A lower layer supersedes a canon rule by
naming its id; the rules index then carries the replacement and omits the original, so exactly one
statement of the rule reaches a session. A skill of the same name resolves by layer. A check's
severity is adjusted by the override in §6.

This requires **canon rules to carry stable ids**. That is the one obligation this design places on
the corpus itself, and it is what makes an override survive a rewording of the rule it overrides.

**Alternative and its drawback.** Overriding by editing a vendored file forks the pack: the edit is
invisible to the canon, silently reverted by the next update, and its intent is unrecorded.

---

## 10. What a customer must do

- **Free, one repository:** run one command. It writes the manifest, the lockfile, the two stubs,
  the hook wiring and the `.gitignore` line. No account, no login, no secret.
- **Paid:** install the GitHub App on the organisation. OIDC does the rest; the first scheduled run
  mints the licence file.
- **Organisation policy:** one document, issued with the entitlement.
- **Ongoing:** nothing to rotate. No pull request to write by hand. Updates arrive as a lockfile
  diff, gated by the policy the organisation already stated.
