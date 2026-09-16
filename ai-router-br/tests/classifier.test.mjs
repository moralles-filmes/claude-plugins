import test from 'node:test'; import assert from 'node:assert/strict'; import { classifyTask } from '../lib/classifier.mjs';
const cfg={router:{small_task_direct:false},risk:{critical_score:8}};
test('auth change is tier0',()=>assert.equal(classifyTask({objective:'Alterar autenticação e RLS em produção'},cfg).tier,0));
test('coding is tier1',()=>assert.equal(classifyTask({objective:'Implementar módulo completo de fornecedores backend e frontend'},cfg).tier,1));
test('inventory is tier2',()=>assert.equal(classifyTask({objective:'Inventariar arquivos e catalogar código repetitivo'},cfg).tier,2));
test('mechanical is tier3',()=>assert.equal(classifyTask({objective:'Classificar e organizar informações'},cfg).tier,3));
test('forbidden auth guardrail does not escalate',()=>assert.equal(classifyTask({objective:'Criar componente visual',forbidden_files:['auth/','rls/']},cfg).tier,1));
test('small can stay main',()=>assert.equal(classifyTask({objective:'Ajustar texto',allowed_files:['a.ts']},{router:{small_task_direct:true,small_task_max_files:1,small_task_max_chars:500},risk:{critical_score:8}}).executor,'main'));

test('natural module request is substantial',()=>{const r=classifyTask({objective:'Crie um módulo de fornecedores.'},{router:{small_task_direct:true,small_task_max_files:1,small_task_max_chars:500},risk:{critical_score:8}});assert.equal(r.tier,1);assert.equal(r.executor,'codex');});

test('repo-wide inventory routes cheap worker',()=>{const r=classifyTask({objective:'Inventariar arquivos e catalogar código repetitivo.'},{router:{small_task_direct:true,small_task_max_files:1,small_task_max_chars:500},risk:{critical_score:8}});assert.equal(r.tier,2);assert.equal(r.executor,'deepseek');});
