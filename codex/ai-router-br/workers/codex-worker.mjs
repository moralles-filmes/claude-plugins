import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { run } from '../lib/process.mjs';
import { sanitizeEnv } from '../lib/redact.mjs';
import { readAllowedFiles, assertEffects, forbiddenPatterns } from '../lib/security.mjs';
import { createWorktree,changedFiles,discardIgnoredFiles,makePatch,removeWorktree,headOf,assertHeadUnchanged,assertNoWorkerLinks,repoSnapshot,assertRepoUnchanged } from '../lib/worktree.mjs';
import { taskPrompt } from '../lib/task-package.mjs';
import { validateTaskTests, testsForWorker } from '../lib/test-runner.mjs';
import { resolveCodexCommand } from '../lib/models.mjs';

const UNAVAILABLE_TEXT=/rate.?limit|quota|usage.?limit|too many requests|\b429\b|not logged in|log ?in required|please (?:log|sign) ?in|unauthori[sz]ed|\b401\b|authentication (?:failed|required|error)|token (?:has )?expired|sandbox|read-?only file ?system|access is denied|os error 5|network|connection (?:refused|reset|error|closed)|timed? ?out|service unavailable|\b50[234]\b|overloaded/i;
// The account cannot use this model (plan, rollout, retired slug): the next model on the ladder may still run.
// Only Codex's own phrasing or an error naming this exact slug counts: a worker editing ML code prints things like
// "model.pkl not found", and that must not re-run the task on the next paid rung.
const MODEL_UNAVAILABLE_TEXT=/not supported when using codex|\bmodel[_ ]not[_ ]found\b|do(?:es)? not have access to (?:the )?model/i;
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const modelRefused=(text,model)=>MODEL_UNAVAILABLE_TEXT.test(text) || new RegExp(`\\bmodel\\W{1,3}${esc(model)}\\W{1,3}(?:is not supported|is not available|does not exist|not found)|(?:unsupported|unknown) model\\W{1,3}${esc(model)}\\b`,'i').test(text);
const SANDBOX_BLOCKED=/read-?only|sandbox|permission denied|access is denied|operation not permitted|cannot write|unable to write|n[aã]o (?:foi poss[ií]vel|consegui) (?:escrever|gravar|editar)/i;
// danger-full-access is never used: the worker must stay inside the Codex sandbox.
const SANDBOXES=new Set(['read-only','workspace-write']);

// Codex may echo the prompt: task text such as "401" or "network" must not read as an outage.
const outputOf=(err,prompt)=>{ const clean=s=>(prompt?String(s||'').split(prompt).join(''):String(s||'')); return `${err.message}\n${clean(err.stderr).slice(-4000)}\n${clean(err.stdout).slice(-4000)}`; };
// Only failures to reach/authenticate/run Codex count as unavailability. Anything after Codex finished
// (scope, commits, tests, suspicious output) escalates to the main agent and never triggers fallback.
function classifyUnavailable(err,phase,prompt) {
  if (['auth_unavailable','sandbox_unavailable','model_unavailable'].includes(err?.code)) return true;
  if (phase!=='auth' && phase!=='exec') return false;
  if (err?.code==='spawn_error' || err?.code==='timeout') return true;
  if (err?.code!=='process_failed') return false;
  return UNAVAILABLE_TEXT.test(outputOf(err,prompt));
}

export async function codexWorker({root,task,config,candidate=null}) {
  const started=Date.now(); let wt; let outDir; let keep=false; let phase='prepare'; let changed; let patch; let discarded; let prompt='';
  const model=candidate?.model||null; const effort=candidate?.effort||null;
  const base={task_id:task.id,executor:'codex',...(model?{model}:{}),...(effort?{effort}:{}),attempts:1};
  const forbidden=forbiddenPatterns(task,config);
  try{
    validateTaskTests(task,config);
    const sandbox=config.codex?.sandbox||'workspace-write';
    if(!SANDBOXES.has(sandbox)) throw Object.assign(new Error(`codex_sandbox_not_allowed:${sandbox}`),{code:'unsafe_config'});
    const env=sanitizeEnv();
    phase='auth';
    const argv0=resolveCodexCommand(config.codex?.command||'codex');
    if(!argv0) throw Object.assign(new Error('codex_not_found'),{code:'spawn_error'});
    const [command,...pre]=argv0;
    let status;
    try { status=await run(command,[...pre,'login','status'],{cwd:root,env,timeoutMs:30000}); }
    catch (e) { if(e.code==='spawn_error' || e.code==='timeout') throw e; throw Object.assign(new Error('codex_not_logged_in'),{code:'auth_unavailable'}); }
    if(config.codex?.require_chatgpt_auth!==false && !/logged in using chatgpt/i.test(`${status.stdout}\n${status.stderr}`)) throw Object.assign(new Error('codex_not_chatgpt_authenticated'),{code:'auth_unavailable'});
    phase='prepare';
    wt=createWorktree(root,task.id); const head=headOf(wt);
    const files=readAllowedFiles(wt,[...new Set([...(task.relevant_files||[]),...(task.allowed_files||[])])],config.execution?.max_file_chars||60000,task.allowed_files,forbidden);
    outDir=fs.mkdtempSync(path.join(os.tmpdir(),'ai-router-codex-out-')); const outFile=path.join(outDir,'last-message.txt');
    const args=[...pre];
    for(const feat of config.codex?.disable_features||[]) args.push('--disable',String(feat));
    args.push('exec','--ephemeral','--sandbox',sandbox,'-C',wt,'--output-last-message',outFile);
    // The ladder picks model and effort per task; without them the worker inherited the user's interactive
    // config.toml, which is usually the flagship at high effort.
    if(model) args.push('-m',model);
    if(effort) args.push('-c',`model_reasoning_effort="${effort}"`);
    if(config.codex?.ignore_user_config===true) args.push('--ignore-user-config');
    args.push('-');
    prompt=taskPrompt(task,files);
    const mainBefore=repoSnapshot(root);
    phase='exec';
    let res;
    try { res=await run(command,args,{cwd:wt,env,input:prompt,timeoutMs:config.codex?.timeout_ms||900000}); }
    catch (e) { if(e.code==='process_failed' && model && modelRefused(outputOf(e,prompt),model)) { e.code='model_unavailable'; e.message=`codex_model_unavailable:${model}`; } throw e; }
    const message=fs.existsSync(outFile)?fs.readFileSync(outFile,'utf8').slice(0,12000):res.stdout.slice(-12000);
    phase='validate';
    assertRepoUnchanged(root,mainBefore,'worker_modified_main_repository');
    assertHeadUnchanged(wt,head);
    assertNoWorkerLinks(wt);
    discarded=discardIgnoredFiles(wt);
    changed=changedFiles(wt);
    if(!changed.length){
      if(SANDBOX_BLOCKED.test(message)) throw Object.assign(new Error('sandbox_unavailable'),{code:'sandbox_unavailable'});
      return {...base,status:'no_changes',unavailable:false,changed_files:[],discarded_ignored_files:discarded,tests:[],tests_status:'none',patch:'',worker_message:message,duration_ms:Date.now()-started};
    }
    assertEffects(changed,task.allowed_files,forbidden,config.execution?.max_files||20);
    patch=makePatch(wt);
    phase='tests';
    const tests=await testsForWorker(task,config,{root,wt,head});
    return {...base,status:'success',unavailable:false,changed_files:changed,discarded_ignored_files:discarded,...tests,patch,worker_message:message,duration_ms:Date.now()-started};
  } catch(err){
    const unavailable=classifyUnavailable(err,phase,prompt);
    // Fallback-eligible failures leave nothing worth inspecting; other failures keep the worktree when configured.
    keep=Boolean(wt && config.execution?.keep_failed_worktree && !unavailable);
    return {...base,status:'failed',unavailable,phase,error:String(err.message||err),error_code:err.code||null,
      changed_files:changed,discarded_ignored_files:discarded,tests:err.tests,patch:err.code==='tests_failed'?patch:undefined,kept_worktree:keep?wt:undefined,duration_ms:Date.now()-started};
  }
  finally {
    if(wt && !keep) removeWorktree(root,wt);
    if(outDir) { try{ fs.rmSync(outDir,{recursive:true,force:true}); }catch{} }
  }
}
