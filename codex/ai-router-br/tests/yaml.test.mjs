import test from 'node:test'; import assert from 'node:assert/strict'; import { parseYaml } from '../lib/simple-yaml.mjs';
test('parses nested yaml',()=>{const x=parseYaml('a:\n  b: true\n  c: [x, y]\n');assert.equal(x.a.b,true);assert.deepEqual(x.a.c,['x','y']);});
test('parses numbers',()=>assert.equal(parseYaml('x: 2\n').x,2));
