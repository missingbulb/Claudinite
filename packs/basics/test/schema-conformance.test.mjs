import { ruleTester } from '../../../engine-tests/helpers.mjs';
import rule from '../worldRules/schema-conformance.mjs';

const schema = JSON.stringify({
  type: 'object', required: ['id', 'frequency'], additionalProperties: false,
  properties: { $schema: { type: 'string' }, id: { type: 'string', minLength: 1 }, frequency: { enum: ['daily', 'weekly'] } },
});

ruleTester(rule, {
  clean: {
    'a document satisfying the schema it points at': { files: {
      'packs/t/task.schema.json': schema,
      'packs/t/tasks/a/task.json': '{"$schema":"../../task.schema.json","id":"a","frequency":"daily"}',
    } },
    'a $schema naming a URL is an editor hint, not judged': { files: {
      'x.json': '{"$schema":"https://json-schema.org/draft/2020-12/schema","anything":1}',
    } },
    'a document with no $schema, and a schema file itself, are out of scope': { files: {
      'plain.json': '{"id":""}', 'thing.schema.json': '{"type":"object","required":["never"]}',
    } },
  },
  flagged: {
    'each violation is one finding at the offending key': {
      files: {
        'packs/t/task.schema.json': schema,
        'packs/t/tasks/a/task.json': '{\n  "$schema": "../../task.schema.json",\n  "id": "",\n  "frequency": "hourly",\n  "extra": true\n}\n',
      },
      at: [
        { file: 'packs/t/tasks/a/task.json', line: 3, what: /at \/id: shorter than 1 characters \(against packs\/t\/task\.schema\.json\)/ },
        { file: 'packs/t/tasks/a/task.json', line: 4, what: /at \/frequency: "hourly" is not one of "daily", "weekly"/ },
        { file: 'packs/t/tasks/a/task.json', line: null, what: /the document: the property "extra" is not allowed/ },
      ],
    },
    'a $schema pointing at nothing in the tree is a finding at the pointer': {
      files: { 'a/doc.json': '{\n  "$schema": "../gone.schema.json",\n  "id": "x"\n}\n' },
      at: [{ file: 'a/doc.json', line: 2, what: /points at gone\.schema\.json as its schema, which is not in the tree/ }],
    },
  },
});
