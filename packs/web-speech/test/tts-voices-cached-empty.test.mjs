import { declaredCheck, ruleTester } from '../../../engine-tests/helpers.mjs';

const voicesCached = declaredCheck('packs/web-speech', 'tts-voices-cached-empty');

const speakBody = `
export function speak(text) {
  const u = new SpeechSynthesisUtterance(text);
  u.voice = voices.find((v) => v.name === 'Samantha') ?? null;
  speechSynthesis.speak(u);
}
`;

ruleTester(voicesCached, {
  flagged: {
    'a module-scope const holding the voice list': {
      files: { 'src/tts.js': `const voices = speechSynthesis.getVoices();\n${speakBody}` },
      at: [{
        file: 'src/tts.js', line: 1, on_fail: 'block',
        what: /caches getVoices\(\)/,
        fix: /resolve the voice inside/,
      }],
    },
    'the window-qualified spelling, declared with let and never refreshed': {
      files: {
        'app/voices.ts':
          'let cached = window.speechSynthesis.getVoices();\nexport const all = () => cached;\n',
      },
      at: [{ file: 'app/voices.ts', line: 1 }],
    },
  },
  clean: {
    'resolving inside speak() — the remedy the rule asks for (FP guard)': {
      files: {
        'src/tts.js':
          'export function speak(text) {\n'
          + '  const voices = speechSynthesis.getVoices();\n'
          + '  const u = new SpeechSynthesisUtterance(text);\n'
          + '  u.voice = voices[0] ?? null;\n'
          + '  speechSynthesis.speak(u);\n'
          + '}\n',
      },
    },
    'a module-scope cache the file refreshes from voiceschanged (FP guard)': {
      files: {
        'src/tts.js':
          'let voices = speechSynthesis.getVoices();\n'
          + "speechSynthesis.addEventListener('voiceschanged', () => {\n"
          + '  voices = speechSynthesis.getVoices();\n'
          + '});\n'
          + speakBody,
      },
    },
    'the call quoted in a block comment is not the call (FP guard)': {
      files: {
        'src/tts.js':
          '/* the shape this pack warns about, spelled out at column 0:\n'
          + 'const voices = speechSynthesis.getVoices();\n'
          + '*/\n'
          + speakBody,
      },
    },
    'a hand-rolled speech fake under test scaffolding (FP guard)': {
      files: {
        'test/fake-speech.js': 'const voices = speechSynthesis.getVoices();\nexport default voices;\n',
      },
    },
    'a built bundle nobody edits (FP guard)': {
      files: { 'dist/bundle.js': 'const voices = speechSynthesis.getVoices();\n' },
    },
  },
});
