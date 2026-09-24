import { classifyTask } from './classifier.mjs';
import { ensureSafeRepo, validateTaskPaths, relevantNotSent } from './security.mjs';
import { validateTaskTests } from './test-runner.mjs';
import { codexWorker } from '../workers/codex-worker.mjs';
import { deepseekWorker } from '../workers/deepseek-worker.mjs';
import { record } from './observability.mjs';

const EXECUTORS=new Set(['main','codex','deepseek']);
// Defense in depth: these outcomes escalate to the main agent even if a worker marked them unavailable.
const NEVER_FALLBACK=new Set(['scope_violation','max_files_exceeded','tracked_secret','tracked_router_config','not_git_repo','dirty_worktree','tests_failed','test_command_unavailable','budget_exceeded','unsafe_test_command','forbidden_command','path_traversal','invalid_path','glob_not_supported','invalid_output','context_too_large','unsafe_config']);

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

export async function route({root,task,config,dryRun=false,forceExecutor=null,workers={codex:codexWorker,deepseek:deepseekWorker}}){
  if(forceExecutor!=null && !EXECUTORS.has(forceExecutor)) throw Object.assign(new Error(`invalid_executor:${forceExecutor}`),{code:'invalid_executor'});
  const c=classifyTask(task,config);
  if(forceExecutor && c.tier!==0) { c.executor=forceExecutor; c.fallback=forceExecutor==='codex'?'deepseek':forceExecutor==='deepseek'?'codex':null; c.forced=true; }
  else if(config?.router?.auto_delegate===false && c.executor!=='main') { c.executor='main'; c.fallback=null; c.reasons.push('auto_delegate desativado no config'); }
  if(c.tier===0){c.executor='main';c.fallback=null;}
  const plan={task_id:task.id,...c,budget:task.budget,review_required:c.executor!=='main',auto_integrate:false,...(c.executor!=='main'?scopeNotes(task,config):{})};
  if(dryRun) return {status:'dry-run',...plan};
  if(c.executor==='main') return {status:'main_required',...plan};
  if(process.env.AI_ROUTER_WORKER==='1') return {status:'main_required',...plan,reason:'nested_delegation_blocked'};
  const blocked=e=>record(root,{...plan,status:'blocked',error:String(e.message||e),error_code:e.code||'blocked',review_required:true,fallback:false});
  try{ validateTaskPaths(task); validateTaskTests(task,config); }catch(e){ return blocked(e); }
  try{ ensureSafeRepo(root,{requireClean:config.execution?.require_clean_git_for_external_workers!==false}); }catch(e){ return blocked(e); }
  let result=await workers[c.executor]({root,task,config}); let fallback=false;
  if(result.status==='failed' && result.unavailable===true && c.fallback && !NEVER_FALLBACK.has(result.error_code)){
    fallback=true;
    const second=await workers[c.fallback]({root,task,config});
    result={...second,fallback:true,previous_executor:c.executor,previous_error:result.error,previous_error_code:result.error_code};
  }
  const final={...result,tier:c.tier,risk_score:c.risk_score,audit_required:c.audit_required,review_required:true,auto_integrate:false,fallback,...(plan.relevant_not_sent?{relevant_not_sent:plan.relevant_not_sent}:{})};
  return record(root,final,[process.env.DEEPSEEK_API_KEY,process.env.OPENAI_API_KEY,process.env.ANTHROPIC_API_KEY]);
}
