import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// One chat line saying who handled the task, how it ended and what it cost. Built only from fixed fields,
// codes and numbers: never worker text, prompts, paths or error messages.
export const SUMMARY_PREFIX='🔀 Router';
const MAIN='agente principal';
const STATUS={success:'sucesso',no_changes:'sem alterações',failed:'falhou'};
const code=v=>String(v??'').replace(/[^A-Za-z0-9_.:-]/g,'').slice(0,60);

// Model the Codex worker inherits from the user's Codex config (top-level `model` key only).
export function codexModel(env=process.env) {
  try {
    const text=fs.readFileSync(path.join(env.CODEX_HOME||path.join(os.homedir(),'.codex'),'config.toml'),'utf8');
    for (const line of text.split(/\r?\n/)) {
      if (/^\s*\[/.test(line)) break;
      const m=line.match(/^\s*model\s*=\s*["']([^"']{1,80})["']/);
      if (m) return code(m[1])||null;
    }
  } catch {}
  return null;
}

const CLAUDE_NAMES={haiku:'Haiku',sonnet:'Sonnet'};
// The rung's own model/effort when the ladder chose one; the user's Codex config only for a forced run without it.
function label(executor,config,models,model=null,effort=null) {
  if (executor==='deepseek') return `DeepSeek (${code(config?.deepseek?.model)||'deepseek-flash'})`;
  if (executor==='codex') {
    const m=model?code(model):config?.codex?.ignore_user_config===true?null:models.codex();
    return m?`Codex (${m}${effort?` · ${code(effort)}`:''})`:'Codex';
  }
  if (executor==='claude') return `Claude ${CLAUDE_NAMES[model]||code(model)||''} (subagente)`.replace('  ',' ');
  return executor==='main'?MAIN:code(executor)||'?';
}
const of=(c,config,models)=>label(c?.executor,config,models,c?.model,c?.effort);
const unavailable=res=>{ const r=[...new Set((Array.isArray(res?.skipped_candidates)?res.skipped_candidates:[]).map(s=>code(s?.reason)).filter(Boolean))]; return r.length?`indisponível: ${r.join(', ')}`:null; };
const money=v=>`US$${v.toFixed(v<1?4:2).replace('.',',')}`;
const duration=ms=>ms<1000?`${Math.round(ms)} ms`:ms<60000?`${(ms/1000).toFixed(1).replace('.',',')} s`:`${(ms/60000).toFixed(1).replace('.',',')} min`;

export function summaryLine(res,config,{codexModel:cm=codexModel}={}) {
  const models={codex:cm};
  const tier=Number.isInteger(res?.tier)?` · TIER ${res.tier}`:'';
  const level=res?.complexity && res?.executor!=='main'?` · ${code(res.complexity)}`:'';
  const head=`${SUMMARY_PREFIX}${tier}${level} →`;
  const previous=res?.fallback && res.previous_executor?`${label(res.previous_executor,config,models,res.previous_model,res.previous_effort)} indisponível → `:'';
  if (res?.status==='error') return `${SUMMARY_PREFIX} · erro (${code(res.error_code)||'desconhecido'})`;
  if (res?.status==='dry-run') {
    const parts=[`${head} ${of(res,config,models)}${res.executor==='main'&&res.small?' (tarefa pequena)':''}`];
    const fb=Array.isArray(res.fallback_chain)?res.fallback_chain:null;
    if (fb?.length) parts.push(`fallback: ${fb.map(c=>of(c,config,models)).join(' → ')}`);
    else if (!fb && res.fallback) parts.push(`fallback: ${label(res.fallback,config,models)}`);
    parts.push('classificação');
    const skipped=unavailable(res); if (skipped) parts.push(skipped);
    if (res.dispatch_error) parts.push(`dispatch será bloqueado (${code(res.dispatch_error)})`);
    const n=Array.isArray(res.relevant_not_sent)?res.relevant_not_sent.length:0;
    if (n) parts.push(n===1?'1 arquivo de contexto não vai ao worker':`${n} arquivos de contexto não vão ao worker`);
    return parts.join(' · ');
  }
  if (res?.status==='main_required') return [`${head} ${MAIN}`,unavailable(res)].filter(Boolean).join(' · ');
  if (res?.status==='blocked') return `${head} bloqueado (${code(res.error_code)||'blocked'}) · segue com o ${MAIN}`;
  if (res?.status==='delegate_claude') {
    const why=res.external_blocked?`workers externos bloqueados (${code(res.external_blocked)}) → `:previous;
    return `${head} ${why}${label('claude',config,models,res.model)} · delegado ao subagente`;
  }
  const parts=[`${head} ${previous}${of(res,config,models)}`,`${STATUS[res?.status]||code(res?.status)||'?'}${res?.status==='failed'&&res.error_code?` (${code(res.error_code)})`:''}`];
  if (typeof res?.cost_usd==='number' && Number.isFinite(res.cost_usd)) parts.push(money(res.cost_usd));
  else if (res?.executor==='codex') parts.push('sem custo de API');
  if (Number.isFinite(res?.duration_ms)) parts.push(duration(res.duration_ms));
  if (res?.status==='failed' && res.suggested_next) parts.push(`correção: ${of(res.suggested_next,config,models)}`);
  return parts.join(' · ');
}

// PostToolUse (Claude Code): pull summary_line out of a router command's output. Display only.
const ROUTER_COMMAND=/ai-router\.mjs["']?\s+(?:dry-run|classify|dispatch)\b/;
const strings=(v,out=[])=>{ if(typeof v==='string') out.push(v); else if(v && typeof v==='object') for(const x of Object.values(v)) strings(x,out); return out; };
export function noticeFor(input) {
  if (!ROUTER_COMMAND.test(String(input?.tool_input?.command||''))) return null;
  for (const text of strings(input?.tool_response)) {
    // summary_line is the first key the CLI prints, so it survives a truncated tool output.
    const m=text.match(/"summary_line"\s*:\s*("(?:[^"\\\r\n]|\\.)*")/);
    if (!m) continue;
    try {
      const line=JSON.parse(m[1]);
      if (typeof line==='string' && line.startsWith(SUMMARY_PREFIX)) return line.replace(/\p{Cc}/gu,' ').slice(0,300);
    } catch {}
  }
  return null;
}
