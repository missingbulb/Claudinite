import { declaredCheck, ruleTester } from '../../../../../engine-tests/helpers.mjs';

// A print and a hard exit on one line: the status survives the exit, the output does
// not. The allowed shapes are process.exitCode (with a return where the exit was also
// ending the flow) and an exit from the write's own callback, which hook-runner.mjs uses
// because its exit code is the whole protocol.
ruleTester(declaredCheck('.claudinite/local/packs/claudinite', 'print-then-exit'), {
  clean: {
    'exitCode with a return in its place': {
      base: { 'cli.mjs': 'const go = () => 1;\n' },
      files: { 'cli.mjs': "const go = () => 1;\nif (!go()) { console.error('no'); process.exitCode = 1; return; }\n" },
    },
    'an exit from the write callback, nothing left queued': {
      base: {},
      files: { 'hook.mjs': 'process.stderr.write(verdict.block, () => process.exit(2));\n' },
    },
    'a comment describing the pattern, which is where a naive matcher trips': {
      base: { 'cli.mjs': 'const go = () => 1;\n' },
      files: { 'cli.mjs': "const go = () => 1;\n// never console.error('no'); process.exit(1); - the write is still queued\n" },
    },
    'a print and an exit the base already held': {
      base: { 'cli.mjs': "console.error('old'); process.exit(1);\n" },
      files: { 'cli.mjs': "console.error('old'); process.exit(1);\nconst x = 1;\n" },
    },
  },
  flagged: {
    'an added print-then-exit': {
      base: { 'cli.mjs': 'const go = () => 1;\n' },
      files: { 'cli.mjs': "const go = () => 1;\nif (!go()) { console.error('no'); process.exit(1); }\n" },
      at: [{ file: 'cli.mjs', line: 2, what: /prints and then exits hard/ }],
    },
    'a catch that reports and exits': {
      base: {},
      files: { 'worker.mjs': 'main().catch((e) => { console.error(`worker failed: ${e.message}`); process.exit(1); });\n' },
      at: [{ file: 'worker.mjs', line: 1, what: /prints and then exits hard/ }],
    },
    'a .cjs entry point, same shape': {
      base: {},
      files: { 'tool.cjs': "console.log('done'); process.exit(0);\n" },
      at: [{ file: 'tool.cjs', line: 1, what: /prints and then exits hard/ }],
    },
  },
});
