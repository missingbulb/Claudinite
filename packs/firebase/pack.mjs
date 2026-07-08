// Technology pack: building on Firebase (Auth, Firestore, Cloud Functions,
// FCM) — schema/rules discipline, function patterns, testing without live
// infrastructure, and deploy layout. Fingerprinted by the Firebase project
// config every Firebase repo carries.
export default {
  id: 'firebase',
  always: false,
  marker: 'firebase.json',
  detect: (ctx) => ctx.tracked.includes('firebase.json'),
  prose: 'RULES.md',
  rules: [],
};
