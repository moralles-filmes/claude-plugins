import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { relevantNotSent, normalizeRelative, safeResolve, pathAllowed, forbiddenPatterns } from './security.mjs';

// Model ladder per complexity. Each entry is `executor[:model[:effort]]`: the first available entry runs the task
// and the rest are the fallback, in order. `claude:*` is a Claude Code subagent (Agent tool), never the main agent.
// gpt-6-astra is left out on purpose: frontier price for work the cheaper rungs handle; only an explicit --model uses it.
// Same lists as templates/config.yml; this copy covers configs that predate `routing`.
export const COMPLEXITIES=['mechanical','simple','standard','complex'];
export const DEFAULT_ROUTING={
  mechanical:['deepseek','codex:gpt-6-luna:low','claude:haiku'],
  simple:['deepseek','codex:gpt-6-luna:medium','claude:haiku'],
  standard:['codex:gpt-6.1-sol:low','codex:gpt-6-sol:low','deepseek','claude:sonnet'],
  complex:['codex:gpt-6.1-sol:high','codex:gpt-6-sol:high','claude:sonnet']
};
export const CLAUDE_WORKERS={haiku:'ai-router-br:claude-worker-haiku',sonnet:'ai-router-br:claude-worker-sonnet'};
const EFFORTS=new Set(['low','medium','high','xhigh','max','ultra']);
const MODEL_NAME=/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
// DeepSeek keys are printable ASCII without spaces. A key saved as a keystroke (Ctrl+V = \x16) or a placeholder
// otherwise reaches fetch() and fails as UND_ERR_INVALID_ARG, which looked like a network error.
const DEEPSEEK_KEY=/^[\x21-\x7e]{20,512}$/;

const fail=(code,msg)=>Object.assign(new Error(msg),{code});

export function parseCandidate(entry) {
  const [executor,model,effort,...rest]=String(entry??'').trim().split(':');
  if (rest.length) return null;
  if (executor==='deepseek') return model===undefined?{executor}:null;
  if (executor==='codex') {
    if (!MODEL_NAME.test(model||'') || (effort!==undefined && !EFFORTS.has(effort))) return null;
    return {executor,model,effort:effort??null};
  }
  if (executor==='claude') return Object.hasOwn(CLAUDE_WORKERS,model||'') && effort===undefined?{executor,model,agent:CLAUDE_WORKERS[model]}:null;
  return null;
}
export const candidateKey=c=>`${c.executor}:${c.model||''}:${c.effort||''}`;
export const briefCandidate=c=>({executor:c.executor,...(c.model?{model:c.model}:{}),...(c.effort?{effort:c.effort}:{}),...(c.agent?{agent:c.agent}:{})});

export function ladderFor(config,complexity) {
  const raw=config?.routing?.[complexity] ?? DEFAULT_ROUTING[complexity] ?? [];
  const out=[];
  for (const c of (Array.isArray(raw)?raw:[]).map(parseCandidate)) if (c && !out.some(x=>candidateKey(x)===candidateKey(c))) out.push(c);
  return out;
}

/** Candidate for `--executor`: explicit model/effort win, otherwise the rung the ladder has for that executor. */
export function forcedCandidate(executor,{model=null,effort=null}={},config,complexity) {
  if (executor==='deepseek') return {executor};
  const fromLadder=[complexity,...COMPLEXITIES].map(k=>ladderFor(config,k).find(c=>c.executor===executor)).find(Boolean);
  if (executor==='codex') {
    if (model!=null && !MODEL_NAME.test(String(model))) throw fail('invalid_model',`invalid_model:${String(model).slice(0,64)}`);
    if (effort!=null && !EFFORTS.has(String(effort))) throw fail('invalid_model',`invalid_effort:${String(effort).slice(0,16)}`);
    const m=model!=null?String(model):fromLadder?.model??null;
    return {executor,model:m,effort:effort!=null?String(effort):(model!=null?null:fromLadder?.effort??null)};
  }
  if (executor==='claude') {
    const m=model!=null?String(model):fromLadder?.model??(['mechanical','simple'].includes(complexity)?'haiku':'sonnet');
    if (!Object.hasOwn(CLAUDE_WORKERS,m)) throw fail('invalid_model',`invalid_model:${m.slice(0,64)}`);
    return {executor,model:m,agent:CLAUDE_WORKERS[m]};
  }
  throw fail('invalid_executor',`invalid_executor:${executor}`);
}

/** Claude subagents exist only when the main agent is Claude Code. */
export function detectHost(env=process.env) {
  const h=String(env.AI_ROUTER_HOST||'').toLowerCase();
  if (h==='claude' || h==='other') return h;
  return env.CLAUDECODE==='1'?'claude':'other';
}

const isFile=p=>{ try { return fs.statSync(p).isFile(); } catch { return false; } };
/**
 * argv prefix that runs the Codex CLI without a shell, or null. Only the plugin default `codex` is searched:
 * an explicit command (tests) is used as given. Windows cannot spawn the npm `.cmd` shim, so its JS entry point
 * runs through node; the desktop app ships the CLI under %LOCALAPPDATA%\OpenAI\Codex\bin\<build>\ outside PATH.
 */
export function resolveCodexCommand(command='codex',env=process.env,platform=process.platform) {
  if (command!=='codex') return [command];
  const override=env.AI_ROUTER_CODEX_BIN;
  if (override && path.isAbsolute(override) && isFile(override)) return [override];
  const dirs=String(env.PATH??env.Path??'').split(path.delimiter).filter(Boolean);
  for (const d of dirs) {
    if (platform!=='win32') { if (isFile(path.join(d,'codex'))) return [path.join(d,'codex')]; continue; }
    if (isFile(path.join(d,'codex.exe'))) return [path.join(d,'codex.exe')];
    const js=path.join(d,'node_modules','@openai','codex','bin','codex.js');
    if (isFile(path.join(d,'codex.cmd')) && isFile(js)) return [process.execPath,js];
  }
  if (platform==='win32' && env.LOCALAPPDATA) {
    const bin=path.join(env.LOCALAPPDATA,'OpenAI','Codex','bin');
    try {
      const found=fs.readdirSync(bin).map(b=>path.join(bin,b,'codex.exe')).filter(isFile)
        .map(p=>({p,t:fs.statSync(p).mtimeMs})).sort((a,b)=>b.t-a.t);
      if (found.length) return [found[0].p];
    } catch {}
  }
  return null;
}

/** Models the user's Codex account can use, from the CLI's own cache. null = unknown (no cache): do not filter. */
export function codexModels(env=process.env) {
  try {
    const j=JSON.parse(fs.readFileSync(path.join(env.CODEX_HOME||path.join(os.homedir(),'.codex'),'models_cache.json'),'utf8'));
    const models=new Map();
    for (const m of Array.isArray(j?.models)?j.models:[]) {
      if (typeof m?.slug!=='string') continue;
      let levels=m.supported_reasoning_levels;
      if (typeof levels==='string') { try { levels=JSON.parse(levels); } catch { levels=[]; } }
      models.set(m.slug,new Set((Array.isArray(levels)?levels:[]).map(l=>l?.effort).filter(e=>typeof e==='string')));
    }
    return models.size?{fetched_at:typeof j.fetched_at==='string'?j.fetched_at:null,models}:null;
  } catch { return null; }
}

export function deepseekKeyState(env=process.env) {
  const k=env.DEEPSEEK_API_KEY;
  if (k===undefined || k==='') return 'missing';
  return DEEPSEEK_KEY.test(k)?'ok':'malformed';
}

export function probeEnvironment({config,env=process.env,host=null}={}) {
  return {host:host||detectHost(env),codex_command:resolveCodexCommand(config?.codex?.command||'codex',env),codex_models:codexModels(env),deepseek_key:deepseekKeyState(env)};
}

/** Drops an effort the model does not list, so Codex uses the model's own default instead of rejecting the run. */
export function resolveCandidate(c,probe) {
  if (c.executor!=='codex' || !c.effort || !c.model) return c;
  const efforts=probe?.codex_models?.models?.get(c.model);
  return efforts && efforts.size && !efforts.has(c.effort)?{...c,effort:null}:c;
}
export function unavailableReason(c,probe) {
  if (c.executor==='deepseek') return probe.deepseek_key==='ok'?null:`deepseek_key_${probe.deepseek_key}`;
  if (c.executor==='codex') {
    if (!probe.codex_command) return 'codex_not_found';
    if (c.model && probe.codex_models && !probe.codex_models.models.has(c.model)) return 'codex_model_not_listed';
    return null;
  }
  if (c.executor==='claude') return probe.host==='claude'?null:'claude_host_required';
  return 'unknown_executor';
}

/**
 * DeepSeek has no tools: it only sees the files sent and answers with each changed file in full. A task that needs
 * files outside the allowlist, a file the reader would truncate, or a rewrite larger than one answer cannot succeed
 * there, so the rung is skipped before any call instead of returning an invented or truncated result.
 */
export function deepseekFit(root,task,config) {
  if (relevantNotSent(task,config).length) return 'deepseek_needs_unsent_files';
  const maxFile=Number(config?.execution?.max_file_chars)||60000;
  const maxOut=Number(config?.deepseek?.max_output_tokens)||16000;
  const maxCtx=Number(config?.deepseek?.max_context_chars)||180000;
  const forbidden=forbiddenPatterns(task,config);
  let context=0; let writable=0;
  for (const f of new Set([...(task.relevant_files||[]),...(task.allowed_files||[])].map(String))) {
    let abs; let size;
    try { abs=safeResolve(root,normalizeRelative(f)); const st=fs.statSync(abs); if (!st.isFile()) continue; size=st.size; } catch { continue; }
    // The reader truncates by characters, not bytes: count characters when the byte size alone is over the limit.
    if (size>maxFile) { try { size=fs.readFileSync(abs,'utf8').length; } catch { continue; } }
    if (size>maxFile) return 'deepseek_file_too_large';
    context+=size;
    // Same rule the worker uses to send and accept files, so a directory entry like `src/` counts too.
    let writes=false; try { writes=pathAllowed(f,task.allowed_files,forbidden); } catch {}
    if (writes) writable+=size;
  }
  if (context+JSON.stringify(task).length>maxCtx) return 'deepseek_context_too_large';
  // ~3 characters per token for code; the answer repeats every file it changes.
  if (writable/3>maxOut) return 'deepseek_output_too_large';
  return null;
}
