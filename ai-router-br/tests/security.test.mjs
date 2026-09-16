import test from 'node:test'; import assert from 'node:assert/strict'; import { normalizeRelative,pathAllowed,forbiddenPath,splitCommand,validateTestCommand,assertEffects } from '../lib/security.mjs'; import { sanitizeEnv,redact } from '../lib/redact.mjs';
test('reject traversal',()=>assert.throws(()=>normalizeRelative('../x')));
test('reject absolute',()=>assert.throws(()=>normalizeRelative('/etc/passwd')));
test('forbid env',()=>assert.equal(forbiddenPath('.env'),true));
test('allow env example documentation',()=>assert.equal(forbiddenPath('.env.example'),false));
test('allowlisted file',()=>assert.equal(pathAllowed('src/a.ts',['src/']),true));
test('deny outside allowlist',()=>assert.equal(pathAllowed('other/a.ts',['src/']),false));
test('shell metachar rejected',()=>assert.throws(()=>splitCommand('npm test && rm -rf .')));
test('test exe allowlist',()=>assert.deepEqual(validateTestCommand('npm test'),['npm','test']));
test('test exe denied',()=>assert.throws(()=>validateTestCommand('powershell evil.ps1')));
test('max files',()=>assert.throws(()=>assertEffects(['a','b'],['a','b'],[],1)));
test('scope violation',()=>assert.throws(()=>assertEffects(['b'],['a'],[],20)));
test('sanitizes secret env',()=>{const x=sanitizeEnv({PATH:'x',OPENAI_API_KEY:'secret',DEEPSEEK_API_KEY:'secret2'});assert.equal(x.OPENAI_API_KEY,undefined);assert.equal(x.PATH,'x');});
test('redacts key-like values',()=>assert.ok(redact('token=abcdefghijklmno').includes('[REDACTED]')));

test('env local example is documentation',()=>assert.equal(forbiddenPath('.env.local.example'),false));
