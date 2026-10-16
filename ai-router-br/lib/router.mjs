import { classifyTask } from './classifier.mjs';
import { ensureSafeRepo, validateTaskPaths, relevantNotSent } from './security.mjs';
import { validateTaskTests } from './test-runner.mjs';
import { codexWorker } from '../workers/codex-worker.mjs';
import { deepseekWorker } from '../workers/deepseek-worker.mjs';
import { record } from './observability.mjs';
import { ladderFor, forcedCandidate, probeEnvironment, resolveCandidate, unavailableReason, deepseekFit, candidateKey, briefCandidate } from './models.mjs';

const EXECUTORS=new Set(['main','codex','deepseek','claude']);
// Defense in depth: these outcomes escalate to the main agent even if a worker marked them unavailable.
const NEVER_FALLBACK=new Set(['scope_violation','max_files_exceeded','tracked_secret','tracked_router_config','not_git_repo','dirty_worktree','tests_failed','test_command_unavailable','budget_exceeded','unsafe_test_command','forbidden_command','path_traversal','invalid_path','glob_not_supported','invalid_output','unsafe_config']);
// Gates that exist because code leaves for a third-party worker in a worktree. A Claude subagent edits the main tree
// under the session's own permissions, exactly as the main agent would, so these never force the most expensive model.
const EXTERNAL_ONLY_BLOCKS=new Set(['dirty_worktree','tracked_secret','tracked_router_config','not_git_repo']);
// A model the account cannot use says nothing about the executor's other models; login, binary or usage limit do.
const MODEL_LEVEL_FAILURES=new Set(['model_unavailable']);

// Package problems a delegated task would hit, surfaced already in the dry-run so the package is fixed before dispatch.
function scopeNotes(task,config){
  const out={};
  const refuse=(e,what)=>{ out.dispatch_error=e.code||'blocked'; out.dispatch_error_detail=what?`${e.message||e}: ${what}`:String(e.message||e); };
  try{ validateTaskPaths(task); }catch(e){ refuse(e); }
  if(!out.dispatch_error) for(const t of task.tests||[]){ try{ validateTaskTests({tests:[t]},config); }catch(e){ refuse(e,t); break; } }
  const skipped=relevantNotSent(task,config);
  if(skipped.length) out.relevant_not_sent=skipped;
  return out;
}

function ladderOf(c,{config,forceExecutor,forceModel,forceEffort}){
  if(c.tier===0) return [];
  if(forceExecutor==='main'){ c.forced=true; return []; }
  if(forceExecutor){
    const f=forcedCandidate(forceExecutor,{model:forceModel,effort:forceEffort},config,c.complexity); c.forced=true;
    return [f,...ladderFor(config,c.complexity).filter(x=>x.executor!==f.executor)];
  }
  if(config?.router?.auto_delegate===false){ c.reasons.push('auto_delegate desativado no config'); return []; }
  // The classifier keeps small tasks with the main agent.
  return c.executor==='main'?[]:ladderFor(config,c.complexity);
}

function availableCandidates(ladder,{forced,root,task,config,probe}){
  const candidates=[]; const skipped=[];
  ladder.forEach((raw,i)=>{
    const cand=resolveCandidate(raw,probe);
    // An explicitly forced executor is tried even when the probe doubts it: its worker reports the real outcome.
    const why=forced && i===0?null:unavailableReason(cand,probe) ?? (cand.executor==='deepseek'?deepseekFit(root,task,config):null);
    if(why) skipped.push({...briefCandidate(cand),reason:why});
    else if(!candidates.some(x=>candidateKey(x)===candidateKey(cand))) candidates.push(cand);
  });
  return {candidates,skipped};
}

const previous=t=>t?{previous_executor:t.executor,...(t.model?{previous_model:t.model}:{}),...(t.effort?{previous_effort:t.effort}:{}),previous_error:t.error,previous_error_code:t.error_code}:{};
const chain=tried=>tried.map(({error,...t})=>t);
// Every paid rung counts: a truncated DeepSeek answer still cost money before the next rung ran.
const spent=tried=>{ const c=tried.map(t=>t.cost_usd).filter(Number.isFinite); return c.length?{cost_usd:c.reduce((a,b)=>a+b,0)}:{}; };
const SUBAGENT_FIXABLE=new Set(['tests_failed','invalid_output']);

export async function route({root,task,config,dryRun=false,forceExecutor=null,forceModel=null,forceEffort=null,host=null,probe=null,workers={codex:codexWorker,deepseek:deepseekWorker}}){
  if(forceExecutor!=null && !EXECUTORS.has(forceExecutor)) throw Object.assign(new Error(`invalid_executor:${forceExecutor}`),{code:'invalid_executor'});
  const c=classifyTask(task,config);
  const ladder=ladderOf(c,{config,forceExecutor,forceModel,forceEffort});
  const env=ladder.length?(probe||probeEnvironment({config,host})):null;
  const {candidates,skipped}=ladder.length?availableCandidates(ladder,{forced:c.forced,root,task,config,probe:env}):{candidates:[],skipped:[]};
  const first=candidates[0]||null;
  if(ladder.length && !first) c.reasons.push('nenhum worker disponível nesta máquina');
  const executor=first?.executor||'main';
  const external=executor==='codex'||executor==='deepseek';
  // Package errors apply to every worker: a Claude subagent has Bash and runs the package's tests too. Only the
  // note about files the external worker will not receive is external-only (a subagent reads the tree itself).
  const notes=executor==='main'?{}:scopeNotes(task,config);
  if(!external) delete notes.relevant_not_sent;
  const plan={task_id:task.id,...c,executor,
    ...(first?.model?{model:first.model}:{}),...(first?.effort?{effort:first.effort}:{}),...(first?.agent?{claude_agent:first.agent}:{}),
    fallback:candidates[1]?.executor??null,fallback_chain:candidates.slice(1).map(briefCandidate),
    ...(skipped.length?{skipped_candidates:skipped}:{}),
    budget:task.budget,review_required:executor!=='main',auto_integrate:false,...notes};
  if(dryRun) return {status:'dry-run',...plan};
  if(executor==='main') return {status:'main_required',...plan};
  if(process.env.AI_ROUTER_WORKER==='1') return {status:'main_required',...plan,reason:'nested_delegation_blocked'};
  // The main agent runs the Agent tool with this subagent; the CLI cannot start Claude Code subagents itself.
  const handoff=(cand,extra={})=>{
    const {effort,...rest}=plan;
    return record(root,{...rest,status:'delegate_claude',executor:'claude',model:cand.model,claude_agent:cand.agent,review_required:true,...extra});
  };
  const blocked=(e,{repo=false}={})=>{
    const claude=repo && EXTERNAL_ONLY_BLOCKS.has(e.code)?candidates.find(x=>x.executor==='claude'):null;
    if(claude) return handoff(claude,{external_blocked:e.code,external_blocked_detail:String(e.message||e)});
    return record(root,{...plan,status:'blocked',error:String(e.message||e),error_code:e.code||'blocked',review_required:true,fallback:false});
  };
  try{ validateTaskPaths(task); validateTaskTests(task,config); }catch(e){ return blocked(e); }
  if(executor==='claude') return handoff(first);
  try{ ensureSafeRepo(root,{requireClean:config.execution?.require_clean_git_for_external_workers!==false}); }catch(e){ return blocked(e,{repo:true}); }
  const tried=[]; const down=new Set(); let result=null; let ran=null;
  for(const cand of candidates){
    if(down.has(cand.executor)) continue;
    if(cand.executor==='claude') return handoff(cand,{fallback:true,attempts_chain:chain(tried),...previous(tried.at(-1)),...spent(tried)});
    const r=await workers[cand.executor]({root,task,config,candidate:cand});
    tried.push({...briefCandidate(cand),status:r.status,error_code:r.error_code??null,error:r.error,...(Number.isFinite(r.cost_usd)?{cost_usd:r.cost_usd}:{})});
    result=r; ran=cand;
    if(!(r.status==='failed' && r.unavailable===true && !NEVER_FALLBACK.has(r.error_code))) break;
    if(!MODEL_LEVEL_FAILURES.has(r.error_code)) down.add(cand.executor);
  }
  // A Claude subagent may fix a patch whose tests fail or an unusable answer; never a safety gate (scope, budget,
  // max files, unsafe config): it has no budget cap and no enforced file scope.
  const next=result.status==='failed' && (SUBAGENT_FIXABLE.has(result.error_code) || !NEVER_FALLBACK.has(result.error_code))?candidates.find(x=>x.executor==='claude'):null;
  const final={...result,...(ran.model?{model:ran.model}:{}),...(ran.effort?{effort:ran.effort}:{}),...spent(tried),
    tier:c.tier,risk_score:c.risk_score,complexity:c.complexity,audit_required:c.audit_required,review_required:true,auto_integrate:false,
    fallback:tried.length>1,...(tried.length>1?{...previous(tried.at(-2)),attempts_chain:chain(tried)}:{}),
    ...(next?{suggested_next:briefCandidate(next)}:{}),
    ...(plan.relevant_not_sent?{relevant_not_sent:plan.relevant_not_sent}:{})};
  return record(root,final,[process.env.DEEPSEEK_API_KEY,process.env.OPENAI_API_KEY,process.env.ANTHROPIC_API_KEY]);
}
