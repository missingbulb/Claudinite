// Technology pack: building on Firebase (Auth, Firestore, Cloud Functions,
// FCM) — schema/rules discipline, function patterns, testing without live
// infrastructure, and deploy layout. Fingerprint: firebase.json — the config
// every Firebase repo carries — at the repo root OR one directory down (a
// monorepo's firebase/ project root), but never deeper, so a firebase.json in
// a nested fixture/example tree can't trip detection. A Firebase project root
// is the directory that holds firebase.json, not necessarily the repo root.
import functionsPredeployBuild from './functions-predeploy-build.mjs';

const hasMarkerNearRoot = (ctx, marker) =>
  ctx.tracked.some((f) => {
    const parts = f.split('/');
    return parts[parts.length - 1] === marker && parts.length <= 2;
  });

export default {
  id: 'firebase',
  // 4: the firebase-release pack is absorbed here — its release standard is now the
  // create-release-plan skill, loaded when a project plans a release rather than
  // declared by a repo that has decided it is ready to ship.
  version: 4,
  minEngineVersion: 1,
  ruleRoutingGuidance: {
    belongs: 'building on Firebase: Firestore rules, callable Cloud Function patterns, FCM, emulator testing, deploy layout, dev/prod release split',
    excludes: 'app store submission and its store-side registration — play-store-release, app-store-release',
  },
  badge: 'badge.svg',
  marker: 'firebase.json (at the repo root or one directory down)',
  detect: (ctx) => hasMarkerNearRoot(ctx, 'firebase.json'),
  prose: 'RULES.md',
  // The deploy-layout guards (RULES.md §4). Both are relevance-first: inert
  // until the repo carries a firebase.json declaring a functions codebase whose
  // package.json is in this checkout — so a rules-only or hosting-only Firebase
  // repo never hears from them.
  // firebase/functions-node-pin is a declared check, discovered structurally
  // beside this manifest.
  worldRules: [functionsPredeployBuild],
  // The release standard (skills/create-release-plan) — the dev/prod project split,
  // pipeline-injected prod config and App Check gating. A skill rather than prose
  // because it is read when a project plans its release, not on every session.
  skills: ['create-release-plan'],
};
