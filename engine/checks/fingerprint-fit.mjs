// Which packs does this repo's shape suspect, that its declaration does not carry?
//
// A pack's `detect` fingerprint is consulted exactly once today — at bootstrap's
// `--init`, when the declaration is first written. Nothing re-asks afterwards, so a
// repo that grows into a pack months later (adds a package.json, a firebase.json, a
// JWT library) is never told the pack exists. This module is the re-ask, and it is
// deliberately the SELF-CONTAINED PER-REPO HALF: it answers the question for ONE
// context and knows nothing about any fleet, any owner, or any other repo.
//
// It is a SUSPICION, not a verdict. `pack-declaration` was deliberately retired as a
// conformance check (engine/checks/README.md) because whether to declare a pack is
// the project's call — a marker is a way to suspect a pack is wanted, never proof it
// must be. So nothing here returns a finding, blocks, or writes: it returns a list a
// caller may act on, and every caller so far turns it into something a human reviews.
//
// Pack-agnostic by construction (extending.md): it names no pack and reads no pack's
// internals beyond the manifest fields every pack has. `evaluate` is injected rather
// than calling `pack.detect(ctx)` here, because a caller that cannot serve file
// CONTENTS synchronously (a remote tree listing, say) must be able to answer "I could
// not decide this one" without that being mistaken for "no".

import { packEntryId } from '../pack_loader/pack-registry.mjs';

// The packs a fit sweep may consider at all: canon packs (a local pack is declared by
// hand, never fingerprinted — pack-registry) that carry a fingerprint and are not
// already declared. A pack with `detect: null` is declaration-authoritative in BOTH
// directions and is not a candidate — its absence from a declaration says nothing.
export function fitCandidates(packs, declaredEntries = []) {
  const declared = new Set((declaredEntries ?? []).map(packEntryId).filter((id) => id !== undefined));
  return packs.filter((p) => typeof p.detect === 'function' && !p.local && !declared.has(p.id));
}

// Run each candidate's fingerprint and split the answers three ways.
//
//   evaluate(pack) → true    the repo's shape matches — an undeclared FIT
//                  → false   it does not — silence, which is the common case
//                  → null    UNDECIDED: this caller could not serve what the
//                            fingerprint asked for (see the remote-context note in
//                            the sheepdog fit sweep). Reported, never dropped.
//
// It may return `{ verdict, why }` instead, to say WHY it could not decide, and it
// may be async — a caller reading another repo over the network is the reason this
// function is awaited at all.
//
// A fingerprint that THROWS is undecided too, with the error text as the reason — a
// broken predicate must not be able to make a fleet look clean.
//
// Returns { fits: [id], undecided: [{ id, why }] }, both sorted, so a caller can
// render a full roster: every candidate lands under exactly one of the three states
// (fit, undecided, or the quiet majority that simply did not match).
export async function undeclaredFits({ packs, declared = [], evaluate }) {
  const fits = [];
  const undecided = [];
  for (const pack of fitCandidates(packs, declared)) {
    let answer;
    try {
      answer = await evaluate(pack);
    } catch (e) {
      undecided.push({ id: pack.id, why: `fingerprint threw: ${e.message}` });
      continue;
    }
    const verdict = answer && typeof answer === 'object' ? answer.verdict : answer;
    if (verdict === true) fits.push(pack.id);
    else if (verdict !== false) {
      const why = (answer && typeof answer === 'object' && answer.why)
        || 'the fingerprint could not be evaluated here';
      undecided.push({ id: pack.id, why });
    }
  }
  return {
    fits: fits.sort(),
    undecided: undecided.sort((a, b) => a.id.localeCompare(b.id)),
  };
}

// The local answer: a real checkout, a real context, so every fingerprint is
// decidable and `undecided` comes back empty unless a predicate threw. This is what
// a session in the repo itself should use — it is the complete answer the remote,
// path-only view can only approximate.
export function localFits({ ctx, packs, declared = [] }) {
  return undeclaredFits({ packs, declared, evaluate: (pack) => pack.detect(ctx) === true });
}
