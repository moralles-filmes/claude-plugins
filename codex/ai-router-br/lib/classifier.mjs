const CRITICAL_ACTION=/(alter|change|modify|implement|create|delete|remove|migrate|deploy|rotate|fix|write|update|drop|purge|restore|editar|alterar|implementar|criar|excluir|remover|migrar|corrigir|atualizar)/i;
const CRITICAL_DOMAIN=/(\brls\b|auth(?:entication|orization)?|\brbac\b|multi[- ]?tenant|tenant isolation|membership|secret|api key|payment|billing|checkout|produção|production|permission|role|lgpd|security|segurança)/i;
const DESTRUCTIVE=/(drop|purge|restore|delete.*production|produção.*exclu|rotate.*secret|force push)/i;
const CODING=/(implement|create|build|refactor|bug|fix|component|api|crud|frontend|backend|feature|test|módulo|modulo|implementar|criar|corrigir|refatorar)/i;
const CHEAP=/(inventory|inventari|grep|search files|localizar|boilerplate|fixture|mock|rename|bulk|documentation|documenta|summar|catalog|dead[- ]code exploration|repetitiv|lint simples)/i;
const MECH=/(classif|organiza|sumariza|listar referências|listar referencias|buscar ocorrências|buscar ocorrencias)/i;
const BROAD=/(módulo completo|modulo completo|end[- ]to[- ]end|ponta a ponta|vários arquivos|varios arquivos|backend e frontend|full feature|entire module|\b(?:módulo|modulo|module)\b|inventari|catalogar código|catalog code|dead[- ]code exploration|bulk edit)/i;
export function classifyTask(task, config={}) {
  const objective=String(task.objective||task.objetivo||'');
  const context=String(task.context||task.contexto||'');
  const scope=`${objective}\n${context}`;
  const prohibited=String((task.forbidden_files||task.arquivos_proibidos||[]).join(' '));
  const files=task.allowed_files||task.arquivos_permitidos||[];
  let risk=0; const reasons=[];
  if(DESTRUCTIVE.test(scope)){risk+=10;reasons.push('operação destrutiva/produção');}
  if(CRITICAL_DOMAIN.test(scope) && CRITICAL_ACTION.test(scope)){risk+=8;reasons.push('alteração em domínio sensível');}
  else if(CRITICAL_DOMAIN.test(scope)){risk+=3;reasons.push('domínio sensível sem alteração crítica explícita');}
  if(/migration|migraç/i.test(scope) && /(security|auth|rls|tenant|payment|produção|production)/i.test(scope)){risk+=5;reasons.push('migração sensível');}
  if(/webhook/i.test(scope) && /(payment|billing|finance|pagamento|financeiro)/i.test(scope)){risk+=4;reasons.push('webhook financeiro');}
  const criticalScore=config?.risk?.critical_score ?? 8;
  let tier;
  if(risk>=criticalScore) tier=0;
  else if(MECH.test(objective) && !CODING.test(objective)) tier=3;
  else if(CHEAP.test(objective) && !CODING.test(objective)) tier=2;
  else if(CODING.test(objective) || BROAD.test(objective) || files.length>1) tier=1;
  else tier=3;
  // Prohibitions are guardrails, not task scope: mentioning "do not alter RLS" must not promote risk.
  if(CRITICAL_DOMAIN.test(prohibited) && !CRITICAL_DOMAIN.test(scope)) reasons.push('domínio sensível aparece apenas como proibição/guardrail');
  // "Pequena" exige escopo de arquivos declarado e pequeno, e só se aplica ao tier 3.
  // Sem `allowed_files` o escopo é desconhecido: `files.length<=1` passava com 0 arquivos
  // e devolvia ao principal justamente os tiers 2/3 que são do worker econômico.
  const maxSmallFiles=config?.router?.small_task_max_files??1;
  const maxSmallChars=config?.router?.small_task_max_chars??500;
  const small = tier===3 && files.length>=1 && files.length<=maxSmallFiles && objective.length<=maxSmallChars && !BROAD.test(objective) && !CHEAP.test(objective);
  let executor=tier===0?'main':tier===1?'codex':'deepseek';
  let fallback=tier===1?'deepseek':tier>=2?'codex':null;
  if(small && config?.router?.small_task_direct!==false){executor='main';fallback=null;reasons.push('tarefa pequena: principal pode resolver diretamente');}
  return {tier,risk_score:risk,executor,fallback,small,reasons,audit_required:tier===0 || risk>=5};
}
