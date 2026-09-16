import test from 'node:test';import assert from 'node:assert/strict';import { normalizeTask } from '../lib/task-package.mjs';
test('normalizes task defaults',()=>{const t=normalizeTask({objective:'x'});assert.ok(t.id.startsWith('TASK-'));assert.equal(t.max_attempts,2);});
test('normalizes portuguese keys',()=>{const t=normalizeTask({objetivo:'x',arquivos_permitidos:['a']});assert.equal(t.objective,'x');assert.deepEqual(t.allowed_files,['a']);});
