import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingSecrets, renderSecretsIssue, SECRETS_ISSUE_TITLE } from '../../engine/scheduler/required-secrets.mjs';

const task = (pack, id, required_secrets) => ({ pack, id, decl: { required_secrets } });

test('missingSecrets: a declared secret the repo has is not missing', () => {
  const tasks = [task('gcec', 'create-extractor', ['SCRAPER_API_KEY'])];
  assert.deepEqual(missingSecrets(tasks, { SCRAPER_API_KEY: 'k' }), []);
});

test('missingSecrets: a declared secret the repo lacks is asked for, naming who needs it', () => {
  const tasks = [task('gcec', 'create-extractor', ['SCRAPER_API_KEY'])];
  assert.deepEqual(missingSecrets(tasks, {}), [{ name: 'SCRAPER_API_KEY', tasks: ['gcec/create-extractor'] }]);
});

test('missingSecrets: an unset secret renders as "" in toJSON(secrets) and still counts as missing', () => {
  const tasks = [task('gcec', 'create-extractor', ['SCRAPER_API_KEY'])];
  assert.deepEqual(missingSecrets(tasks, { SCRAPER_API_KEY: '' }), [
    { name: 'SCRAPER_API_KEY', tasks: ['gcec/create-extractor'] },
  ]);
});

test('missingSecrets: two tasks needing the same secret produce ONE ask listing both', () => {
  const tasks = [
    task('gcec', 'record-page', ['SCRAPER_API_KEY']),
    task('gcec', 'create-extractor', ['SCRAPER_API_KEY']),
  ];
  assert.deepEqual(missingSecrets(tasks, {}), [
    { name: 'SCRAPER_API_KEY', tasks: ['gcec/create-extractor', 'gcec/record-page'] },
  ]);
});

test('missingSecrets: tasks declaring nothing contribute nothing', () => {
  assert.deepEqual(missingSecrets([task('basics', 'baselining', undefined)], {}), []);
  assert.deepEqual(missingSecrets([], {}), []);
  assert.deepEqual(missingSecrets(undefined, {}), []);
});

test('missingSecrets: names are sorted, so the issue body is stable across runs', () => {
  const tasks = [task('p', 't', ['Z_KEY', 'A_KEY'])];
  assert.deepEqual(missingSecrets(tasks, {}).map((m) => m.name), ['A_KEY', 'Z_KEY']);
});

test('renderSecretsIssue: says what is missing, who needs it, and where to add it', () => {
  const body = renderSecretsIssue(
    [{ name: 'SCRAPER_API_KEY', tasks: ['gcec/create-extractor'] }],
    'missingbulb/GoogleCalendarEventCreator',
  );
  assert.match(body, /SCRAPER_API_KEY/);
  assert.match(body, /gcec\/create-extractor/);
  assert.match(body, /settings\/secrets\/actions/);
  // It must read as an ask, not a failure — nothing here says the pipeline broke.
  assert.match(body, /everything else keeps running normally/);
});

test('renderSecretsIssue: falls back to a human-readable location with no repo', () => {
  assert.match(renderSecretsIssue([{ name: 'K', tasks: ['p/t'] }]), /Secrets and variables/);
});

test('the issue title is a stable exact-match key (the at-most-one-open guard depends on it)', () => {
  assert.equal(SECRETS_ISSUE_TITLE, 'Claudinite: configure required Actions secrets');
});
