import { declaredCheck, ruleTester } from '../../../engine-tests/helpers.mjs';

const deviceClockNotInjected = declaredCheck('packs/flutter', 'flutter/device-clock-not-injected');

// The port, and the one class allowed to read the device clock: it is what the
// `class …Clock` exemption is for, and what a fake replaces in a widget test.
const CLOCK_PORT = `abstract class Clock {
  DateTime now();
}

class SystemClock implements Clock {
  @override
  DateTime now() => DateTime.now();
}
`;

ruleTester(deviceClockNotInjected, {
  flagged: {
    'a widget rendering relative time off the device clock': {
      files: {
        'lib/ui/countdown.dart':
          "import 'package:flutter/material.dart';\n"
          + 'String remaining(DateTime start) =>\n'
          + '  start.difference(DateTime.now()).inMinutes.toString();\n',
      },
      at: [{
        file: 'lib/ui/countdown.dart', line: 3, on_fail: 'block',
        what: /reads the device clock directly/,
        fix: /take a Clock port/,
      }],
    },
    'a model deciding what is past by asking the device': {
      files: {
        'lib/models/show.dart':
          'bool get isOver => end.isBefore(DateTime.now());\n',
      },
      at: [{ file: 'lib/models/show.dart', line: 1 }],
    },
  },
  clean: {
    'time read through the injected port (FP guard)': {
      files: {
        'lib/ui/countdown.dart':
          'String remaining(Clock clock, DateTime start) =>\n'
          + '  start.difference(clock.now()).inMinutes.toString();\n',
      },
    },
    'the class that implements the port is where the read belongs (FP guard)': {
      files: { 'lib/adapters/system_clock.dart': CLOCK_PORT },
    },
    'the shipped fake world pins its own clock (FP guard)': {
      files: {
        'lib/testing/fake_world.dart':
          'DateTime pinned() => DateTime.now();\n',
      },
    },
    'a comment explaining what not to call (FP guard)': {
      files: {
        'lib/ui/notes.dart':
          '// Never DateTime.now() in a widget — the golden drifts with the wall clock.\n'
          + 'String label(Clock clock) => clock.now().toIso8601String();\n',
      },
    },
    'a Dart file outside lib/ is not the shipped tree (FP guard)': {
      files: {
        'tool/generate_fixtures.dart':
          'void main() => print(DateTime.now());\n',
      },
    },
    'a construction that is not a clock read (FP guard)': {
      files: {
        'lib/ui/calendar.dart':
          'DateTime epoch() => DateTime.utc(1970);\n'
          + 'DateTime parsed(String s) => DateTime.parse(s);\n',
      },
    },
  },
});
