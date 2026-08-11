import { finding } from '../../engine/checks/helpers/findings.mjs';
import { stripComments } from '../../engine/checks/helpers/code-scanning.mjs';

// Converted from this pack's exit-path prose: `NSSupportsSuddenTermination` tells
// macOS it may SIGKILL the app at logout instead of asking it to quit — which
// skips `applicationWillTerminate`, and with it every teardown that runs there.
// An app that abandons a CoreAudio IOProc this way can leave some USB input
// devices wedged until they are physically re-plugged.
//
// The check fires on exactly the condition the rule states — the key is declared
// AND the app has terminate-time teardown to lose — so an app that genuinely has
// nothing to run on the way out keeps the launch-time optimisation and stays
// quiet. Both halves are read as structure, not text:
//   * the plist value must actually be <true/>; `<key>…</key><false/>` is the
//     explicit opt-OUT and must never be flagged;
//   * the Swift gate is read with comments stripped, so prose naming the key or
//     the delegate method is not evidence of either.
//
// Blocking: the failure is silent and only reachable at logout/restart, which is
// the one exit path nobody rehearses.

const PLIST = /\.plist$/;
const SWIFT = /\.swift$/;

const KEY = 'NSSupportsSuddenTermination';

// Teardown that a SIGKILL would skip. `applicationWillTerminate` is the delegate
// hook itself; `installTap(` is the capture registration whose abandonment is the
// expensive case — an app with either has something to lose at logout.
const TEARDOWN = /\bapplicationWillTerminate\b|\binstallTap\s*\(/;

// The value element following `<key>NSSupportsSuddenTermination</key>`: the first
// tag after the key's close, ignoring whitespace and comments. Returns the tag
// name (`true`, `false`, `string`, …) or null when the file ends or is malformed
// — say nothing rather than guess at a half-written plist.
function valueTagAfter(text, keyEnd) {
  const rest = text.slice(keyEnd);
  const m = /^\s*(?:<!--[\s\S]*?-->\s*)*<\s*([A-Za-z]+)/.exec(rest);
  return m ? m[1].toLowerCase() : null;
}

const rule = {
  id: 'sudden-termination-vs-teardown',
  severity: 'blocking',
  description: `An app with terminate-time teardown does not declare ${KEY} (*.plist)`,
  doc: 'packs/macos/RULES.md',
  why: 'sudden termination licenses the system to SIGKILL the app at logout, past applicationWillTerminate and every teardown that runs there — an abandoned CoreAudio IOProc is how a USB input device ends up wedged until it is re-plugged',

  run(ctx) {
    // Only an app that runs something at terminate has anything to lose.
    const hasTeardown = ctx.files
      .filter((f) => SWIFT.test(f))
      .some((f) => {
        const text = ctx.read(f);
        return text !== null && TEARDOWN.test(stripComments(text));
      });
    if (!hasTeardown) return [];

    const out = [];
    for (const file of ctx.files.filter((f) => PLIST.test(f))) {
      const text = ctx.read(file);
      if (text === null) continue;
      const marker = new RegExp(`<\\s*key\\s*>\\s*${KEY}\\s*<\\s*/\\s*key\\s*>`, 'g');
      let m = marker.exec(text);
      while (m !== null) {
        if (valueTagAfter(text, m.index + m[0].length) === 'true') {
          out.push(finding(rule, {
            file,
            line: text.slice(0, m.index).split('\n').length,
            what: `${file} declares ${KEY} in an app that has teardown to run at terminate`,
            fix: `remove the ${KEY} key (or set it <false/>) — the app must be given the chance to remove its tap and stop its engine on the way out; if a logout-speed cost is the motivation, measure it against a device left wedged`,
          }));
        }
        m = marker.exec(text);
      }
    }
    return out;
  },
};

export default rule;
