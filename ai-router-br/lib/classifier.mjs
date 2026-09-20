// Tokens curtos são ancorados em \b. Sem isso casavam dentro de palavras comuns em
// PT-BR e a tarefa virava TIER 0 no principal, com auditoria falsa: "role" em
// "controle", "drop" em "dropdown", "secret" em "secretaria", "fix" em "fixtures",
// "api" em "rapidez", "test" em "testemunho".
// "produção" sozinha é vocabulário de domínio (linha/ordem de produção); só conta
// como ambiente quando qualificada.
const PROD_ENV=String.raw`(?:\bproduction\b|\bprod\b|em produção|(?:ambiente|banco|base|servidor|dados)\s+de\s+produção)`;
// Verbo crítico só conta junto com domínio crítico, então pode ser generoso —
// "usar" sozinho não escala nada. Sem os equivalentes PT ("rotacionar a chave",
// "conceder permissão", "usar service_role") o risco parava em 3 e não alcançava
// o TIER 0, mesmo com o domínio reconhecido.
const CRITICAL_ACTION=/(\balter\w*|\bchange\w*|\bmodif\w*|\bimplement\w*|\bcreate\w*|\bdelete\w*|\bremove\w*|\bmigrat\w*|\bdeploy\w*|\brotate\b|\bgrant\w*|\brevoke\w*|\bbypass\w*|\bdisable\w*|\benable\w*|\bfix(?:e[sd]|ing)?\b|\bwrite\b|\bupdate\w*|\bdrop(?:ar|s|ping|ped)?\b|\bpurge\b|\brestore\b|editar|alterar|implementar|criar|excluir|remover|migrar|corrigir|atualizar|rotacionar|conceder|revogar|configurar|desabilitar|habilitar|\busar\b)/i;
// Equivalentes PT-BR: sem eles o gate ficava cego justamente na língua em que os
// objetivos são escritos, e tarefa sensível escapava do TIER 0. Ficam de fora de
// propósito "pagamento", "faturamento", "cobrança" e "autorização" — vocabulário
// corrente de ERP (ordem de pagamento, autorização de compra) que repetiria o
// caso "produção". O sentido de acesso já é coberto por permissão/RBAC/role.
// "acesso" sozinho fica de fora ("melhorar o acesso à tela"); só a locução conta.
const CRITICAL_PT=String.raw`\bpermiss(?:ão|ões|ao|oes)\b|\bautentica\w*|\bsegredos?\b|chaves?\s+secretas?|chaves?\s+de\s+api|\bsenhas?\b|\bjwt\b|\bcriptograf\w*|controle\s+de\s+acesso|(?:conceder|revogar|dar|remover|negar)\s+(?:o\s+)?acesso`;
const CRITICAL_DOMAIN=new RegExp(String.raw`(\brls\b|\bauth(?:entication|orization|n|z)?\b|\brbac\b|multi[- ]?tenant|tenant isolation|membership|\bsecret(?:s|os?|as?)?\b|\bapi keys?\b|payment|billing|checkout|${PROD_ENV}|permission|\broles?\b|service[_ ]?role|\blgpd\b|security|segurança|${CRITICAL_PT})`,'i');
const DESTRUCTIVE=new RegExp(String.raw`(\bdrop(?:ar|s|ping|ped)?\b|\bpurge\b|\brestore\b|delete.*${PROD_ENV}|${PROD_ENV}.*exclu|rotate.*\bsecret|force push)`,'i');
const CODING=/(\bimplement\w*|\bcreate\w*|\bbuild(?:s|ing)?\b|\brefactor\w*|\bde?bug(?:s|ar|ging|ged)?\b|\bfix(?:e[sd]|ing)?\b|\bcomponent\w*|\bapis?\b|\bcrud\b|\bfrontend\b|\bbackend\b|\bfeatures?\b|\btest(?:e|es|s|ar|ando|ing|ed)?\b|módulo|modulo|implementar|criar|corrigir|refatorar)/i;
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
