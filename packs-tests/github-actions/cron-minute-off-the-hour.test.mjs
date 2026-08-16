import { ruleTester } from '../../engine-tests/helpers.mjs';
import cronMinuteOffTheHour from '../../packs/github-actions/cron-minute-off-the-hour.mjs';

const scheduled = (cronLines) => `name: Nightly
on:
  schedule:
${cronLines}
  workflow_dispatch:

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`;

const at = (expression) => `    - cron: '${expression}'`;

ruleTester(cronMinuteOffTheHour, {
  flagged: {
    'a cron on the hour': {
      files: { '.github/workflows/nightly.yml': scheduled(at('0 3 * * *')) },
      at: [{
        file: '.github/workflows/nightly.yml', line: 4, severity: 'advisory',
        what: /minute field "0"/,
        fix: /:10–:50/,
      }],
    },
    'a step value fires on :00 too': {
      files: { '.github/workflows/poll.yml': scheduled(at('*/15 * * * *')) },
      at: [{ file: '.github/workflows/poll.yml', what: /minute field "\*\/15"/ }],
    },
    'a minute below the band': {
      files: { '.github/workflows/poll.yml': scheduled(at('5 4 * * *')) },
      at: [{ file: '.github/workflows/poll.yml', what: /minute field "5"/ }],
    },
    'a minute above the band': {
      files: { '.github/workflows/poll.yml': scheduled(at('55 * * * *')) },
      at: [{ file: '.github/workflows/poll.yml', what: /minute field "55"/ }],
    },
    'a comma list is not a fixed minute': {
      files: { '.github/workflows/poll.yml': scheduled(at('0,30 * * * *')) },
      at: [{ file: '.github/workflows/poll.yml', what: /minute field "0,30"/ }],
    },
    'every entry in the block is judged, and an unquoted scalar reads the same': {
      files: {
        '.github/workflows/poll.yml': scheduled(
          `${at('44 * * * *')}\n    - cron: 0 12 * * *   # midday sweep`
        ),
      },
      at: [{ file: '.github/workflows/poll.yml', line: 5, what: /cron "0 12 \* \* \*"/ }],
    },
    'a column-0 comment inside the block does not end it': {
      files: {
        '.github/workflows/poll.yml': `name: Poll
on:
  schedule:
# the nightly sweep
    - cron: '0 3 * * *'

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`,
      },
      at: [{ file: '.github/workflows/poll.yml', line: 5, what: /minute field "0"/ }],
    },
  },
  clean: {
    'a fixed minute inside the band': {
      files: { '.github/workflows/nightly.yml': scheduled(at('44 3 * * *')) },
    },
    'the band is inclusive at both ends': {
      files: {
        '.github/workflows/low.yml': scheduled(at('10 * * * *')),
        '.github/workflows/high.yml': scheduled(at('50 * * * *')),
      },
    },
    'a `cron` mapping key outside any schedule: block (FP guard)': {
      files: {
        '.github/workflows/manual.yml': `name: Manual
on:
  workflow_dispatch:
    inputs:
      cron: '0 * * * *'

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - run: echo hi
`,
      },
    },
    'a `- cron:` item under a step input, after the schedule block closed (FP guard)': {
      files: {
        '.github/workflows/nightly.yml': `name: Nightly
on:
  schedule:
    - cron: '44 3 * * *'

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: acme/mirror-schedule@v1
        with:
          schedules:
            - cron: '0 * * * *'
`,
      },
    },
    'a `cron:` mapping key inside a step\'s own `schedule:` input is not a trigger (FP guard)': {
      files: {
        '.github/workflows/nightly.yml': `name: Nightly
on:
  workflow_dispatch:

jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: acme/scheduler@v1
        with:
          schedule:
            cron: '0 * * * *'
`,
      },
    },
    'a commented-out cron line is not a schedule (FP guard)': {
      files: {
        '.github/workflows/nightly.yml': scheduled(
          `${at('44 3 * * *')}\n    # - cron: '0 3 * * *'`
        ),
      },
    },
    'the vendored scheduler is core scheduler-workflow-shape\'s file, not this rule\'s (FP guard)': {
      files: { '.github/workflows/claudinite-scheduler.yml': scheduled(at('0 * * * *')) },
    },
    'a cron outside .github/workflows is out of scope (FP guard)': {
      files: { 'deploy/cron.yml': scheduled(at('0 * * * *')) },
    },
  },
});
