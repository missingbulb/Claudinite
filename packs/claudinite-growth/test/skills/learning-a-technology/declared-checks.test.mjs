// Fixtures for the learning-a-technology skill's three declared checks, which
// hold the shape that makes a technology skill liftable: it says what it was
// written from, and nothing in its folder points out of it.
//
// Co-located with the skill that owns the checks, and driven through real repo
// fixtures rather than a hand-built context, so each case exercises the same
// scan the runner performs — including the comment- and fence-blind views two
// of these three rules depend on.
import { declaredCheck, ruleTester } from '../../../../../engine-tests/helpers.mjs';

const SKILL_DIR = 'packs/claudinite-growth/skills/learning-a-technology';
const SKILL = 'packs/site/skills/cloudflare-email/SKILL.md';
const CODE = 'packs/site/skills/cloudflare-email/send.mjs';
const TEST = 'packs/site/skills/cloudflare-email/send.test.mjs';

// A marked technology skill, complete: the `technology:` key the three rules
// select on, plus the two provenance sections the first one requires.
const marked = (...body) => [
  '---',
  'name: cloudflare-email',
  'description: Send one transactional email through the vendor.',
  'metadata:',
  '  technology: Cloudflare Email Service',
  '---',
  '',
  ...body,
  '',
].join('\n');

const SOURCES = ['## Sources', '', '- https://developers.example.com/email/send/ — fetched 2026-09-10', ''];
const VERIFIED = ['## Verified', '', '- 2026-09-10: one send to the owner, accepted with id `abc`.'];
const complete = () => marked(...SOURCES, ...VERIFIED);

// The same document with no `technology:` key — an ordinary procedure skill,
// which every one of these rules must leave alone.
const unmarked = (...body) => [
  '---',
  'name: some-procedure',
  'description: A procedure that is not about a vendor.',
  '---',
  '',
  ...body,
  '',
].join('\n');

ruleTester(declaredCheck(SKILL_DIR, 'technology-skill-cites-dated-sources'), {
  clean: {
    'a marked skill carrying both provenance sections is silent': {
      files: { [SKILL]: complete() },
    },
    'an unmarked skill is not asked for provenance at all': {
      files: { [SKILL]: unmarked('A skill about a procedure, not a vendor.') },
    },
    'the marker is the frontmatter key, not the word in prose': {
      files: { [SKILL]: unmarked('Record the technology: whichever one the job needs.') },
    },
  },
  flagged: {
    'a Sources section with no fetch date beside its URL': {
      files: {
        [SKILL]: marked('## Sources', '', '- https://developers.example.com/email/send/', '', ...VERIFIED),
      },
      at: [{ file: SKILL, what: /fetch date \(YYYY-MM-DD\)/, fix: /the date it was fetched/ }],
    },
    'no Verified section — nothing says whether a call was ever made': {
      files: { [SKILL]: marked(...SOURCES) },
      at: [{ file: SKILL, what: /no `## Verified` section/ }],
    },
    'a dated URL only inside a fenced example is not a source': {
      files: {
        [SKILL]: marked('## Sources', '', '```', 'curl https://developers.example.com/ # 2026-09-10', '```', '', ...VERIFIED),
      },
      at: [{ file: SKILL, what: /no `## Sources` section/ }],
    },
  },
});

ruleTester(declaredCheck(SKILL_DIR, 'technology-skill-links-inside-its-folder'), {
  clean: {
    'a link to a sibling inside the folder is what promotion carries': {
      files: { [SKILL]: marked(...SOURCES, ...VERIFIED, '', 'Run [send.mjs](send.mjs).') },
    },
    'an outward path inside a fenced example is an example, not a link': {
      files: { [SKILL]: marked(...SOURCES, ...VERIFIED, '', '```', 'cp -r .claudinite/local/packs/site/skills/x .', '```') },
    },
    'an unmarked skill may link its siblings across the pack': {
      files: { [SKILL]: unmarked('See [the contract](../writing-tasks/SKILL.md).') },
    },
  },
  flagged: {
    'a relative link out of the folder, and a mount path, each at their line': {
      files: {
        [SKILL]: [
          '---',
          'name: cloudflare-email',
          'metadata:',
          '  technology: Cloudflare Email Service',
          '---',
          'See [the task contract](../../claudinite-growth/skills/writing-tasks/SKILL.md).',
          'Or read .claudinite/local/packs/site/RULES.md first.',
          '',
        ].join('\n'),
      },
      at: [
        { file: SKILL, line: 6, what: /points outside its own folder/ },
        { file: SKILL, line: 7, what: /points outside its own folder/ },
      ],
    },
  },
});

ruleTester(declaredCheck(SKILL_DIR, 'technology-skill-code-imports-inside-its-folder'), {
  clean: {
    'code importing only its own folder is silent': {
      files: { [SKILL]: complete(), [CODE]: "import { post } from './http.mjs';\nexport const send = post;\n" },
    },
    'a commented-out outward import is not an import': {
      files: { [SKILL]: complete(), [CODE]: "// import x from '../x.mjs';\nexport const a = 1;\n" },
    },
    "the skill's own fixture may reach the engine it tests against": {
      files: { [SKILL]: complete(), [TEST]: "import { declaredCheck } from '../../../../engine-tests/helpers.mjs';\n" },
    },
    'code beside an unmarked skill is not judged': {
      files: { [SKILL]: unmarked('A procedure.'), [CODE]: "import x from '../x.mjs';\n" },
    },
  },
  flagged: {
    'an outward import in the technology code, named by its technology': {
      files: {
        [SKILL]: complete(),
        [CODE]: "import { finding } from '../../../engine/checks/helpers/findings.mjs';\n",
      },
      at: [{ file: CODE, line: 1, what: /Cloudflare Email Service technology skill imports from outside/ }],
    },
    'a require() reaching out is the same escape': {
      files: {
        [SKILL]: complete(),
        [CODE]: "const { finding } = require('../helpers.cjs');\n",
      },
      at: [{ file: CODE, line: 1, what: /imports from outside the skill's folder/ }],
    },
  },
});
