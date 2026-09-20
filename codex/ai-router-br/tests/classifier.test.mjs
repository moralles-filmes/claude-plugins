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

const direct={router:{small_task_direct:true,small_task_max_files:1,small_task_max_chars:500},risk:{critical_score:8}};
test('bulk rename without declared scope is not small',()=>{const r=classifyTask({objective:'Renomear variáveis e padronizar imports em todo o projeto'},direct);assert.equal(r.small,false);assert.equal(r.executor,'deepseek');});
test('boilerplate is never small even with one file',()=>{const r=classifyTask({objective:'Gerar boilerplate de documentação repetitiva',allowed_files:['a.ts']},direct);assert.equal(r.small,false);assert.equal(r.executor,'deepseek');});
test('coding task is never small',()=>{const r=classifyTask({objective:'Criar componente de listagem',allowed_files:['a.tsx']},direct);assert.equal(r.small,false);assert.equal(r.executor,'codex');});
test('trivial task with declared scope still stays main',()=>{const r=classifyTask({objective:'Ajustar cor do botão',allowed_files:['a.tsx']},direct);assert.equal(r.small,true);assert.equal(r.executor,'main');});

// Substring: tokens curtos casavam dentro de palavras comuns em PT-BR e forçavam TIER 0.
for(const [what,objective] of [['controle','Criar controle de estoque'],['dropdown','Criar dropdown de filtros'],['secretaria','Criar cadastro de secretaria'],['ordem de produção','Criar ordem de produção de massas']])
  test(`"${what}" is not a critical domain`,()=>{const r=classifyTask({objective},cfg);assert.equal(r.risk_score,0);assert.notEqual(r.tier,0);});
test('rapidez does not match the api token',()=>assert.equal(classifyTask({objective:'Melhorar a rapidez da listagem'},cfg).tier,3));
test('testemunho does not match the test token',()=>assert.equal(classifyTask({objective:'Revisar testemunho do cliente'},cfg).tier,3));
test('fixtures does not match the fix token',()=>{const r=classifyTask({objective:'Gerar fixtures repetitivos'},cfg);assert.equal(r.tier,2);});

// ...e o que é sensível de verdade continua em TIER 0.
for(const [what,objective] of [['role','Criar controle de acesso por role'],['secret','Alterar secret do ambiente de produção'],['drop','Drop da tabela de pedidos'],['rls','Alterar autenticação e RLS']])
  test(`"${what}" still escalates`,()=>assert.equal(classifyTask({objective},cfg).tier,0));

// Domínio sensível escrito em PT-BR também escala: o gate era cego na língua dos objetivos.
for(const [what,objective] of [['senha','Alterar validação de senha no login'],['permissões','Criar tela de permissões do usuário'],['autenticação','Corrigir autenticação do JWT'],['service_role','Usar service_role na edge function'],['chave secreta','Rotacionar chave secreta da integração'],['revogar acesso','Revogar acesso do usuário']])
  test(`PT "${what}" escalates`,()=>assert.equal(classifyTask({objective},cfg).tier,0));

// ...mas vocabulário corrente de ERP não é domínio sensível.
for(const [what,objective] of [['pagamento','Criar ordem de pagamento ao fornecedor'],['autorização de compra','Criar autorização de compra'],['faturamento','Gerar relatório de faturamento mensal'],['resenha','Revisar resenha do produto'],['acesso à tela','Melhorar o acesso à tela de estoque'],['causar','Causar refresh da lista']])
  test(`"${what}" is business vocabulary`,()=>{const r=classifyTask({objective},cfg);assert.equal(r.risk_score,0);assert.notEqual(r.tier,0);});
