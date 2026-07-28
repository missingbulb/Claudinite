// The git/GitHub domain pack: the procedures and owner commands for the
// git/GitHub side of the task lifecycle, bundled as skills
// (skills/git-github-advanced, skills/merge-to-main). No prose and no checks of
// its own (the lifecycle checks stay in basics for now); universal reach comes
// from basics naming it in `requires`, so the closure materializes it into
// every declaration — never seeded directly (#385).
export default {
  id: 'git-github',
  badge: {
    file: 'badge.svg',
    color: '#6e5494',
    glyph: 'M9.5 9.5a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M9.5 23a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M18.5 9.5a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M11.5 11.5v9.5 M20.5 11.5c0 5-9 2-9 7',
  },
  detect: null,
  marker: null,
  prose: null,
  rules: [],
};
