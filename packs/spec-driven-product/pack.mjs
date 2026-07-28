// A project-CLASS pack (prose-only, no fingerprint): a product project of this
// class declares it. No detect — declaration is authoritative. The general
// test-trust rules the playbook leans on (see-it-fail, snapshot hygiene,
// re-baselining approval) stay in the writing-tests skill; release mechanics
// stay in the platform's release pack (e.g. chrome-extension-release).
export default {
  id: 'spec-driven-product',
  badge: {
    file: 'badge.svg',
    color: '#7c3aed',
    glyph: 'M19 7.5h-6.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h7a2 2 0 0 0 2-2V10.5z M19 7.5v3h2.5 M13.5 18l2.2 2.2 4.3-4.3',
  },
  marker: null,
  detect: null,
  // The product playbook runs its spec as tests — it leans on the framework
  // mechanics the executable-requirements pack carries.
  requires: ['executable-requirements'],
  prose: 'RULES.md',
  rules: [],
};
