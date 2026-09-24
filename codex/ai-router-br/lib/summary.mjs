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

function label(executor,config,models) {
  if (executor==='deepseek') return `DeepSeek (${code(config?.deepseek?.model)||'deepseek-flash'})`;
  if (executor==='codex') { const m=config?.codex?.ignore_user_config===true?null:models.codex(); return m?`Codex (${m})`:'Codex'; }
  return executor==='main'?MAIN:code(executor)||'?';
}
const money=v=>`US$${v.toFixed(v<1?4:2).replace('.',',')}`;
const duration=ms=>ms<1000?`${Math.round(ms)} ms`:ms<60000?`${(ms/1000).toFixed(1).replace('.',',')} s`:`${(ms/60000).toFixed(1).replace('.',',')} min`;

export function summaryLine(res,config,{codexModel:cm=codexModel}={}) {
  const models={codex:cm};
  const head=Number.isInteger(res?.tier)?`${SUMMARY_PREFIX} · TIER ${res.tier} →`:`${SUMMARY_PREFIX} →`;
  if (res?.status==='error') return `${SUMMARY_PREFIX} · erro (${code(res.error_code)||'desconhecido'})`;
  if (res?.status==='dry-run') {
    const parts=[`${head} ${label(res.executor,config,models)}${res.executor==='main'&&res.small?' (tarefa pequena)':''}`];
    if (res.fallback) parts.push(`fallback: ${label(res.fallback,config,models)}`);
    parts.push('classificação');
    if (res.dispatch_error) parts.push(`dispatch será bloqueado (${code(res.dispatch_error)})`);
    const n=Array.isArray(res.relevant_not_sent)?res.relevant_not_sent.length:0;
    if (n) parts.push(n===1?'1 arquivo de contexto não vai ao worker':`${n} arquivos de contexto não vão ao worker`);
    return parts.join(' · ');
  }
  if (res?.status==='main_required') return `${head} ${MAIN}`;
  if (res?.status==='blocked') return `${head} bloqueado (${code(res.error_code)||'blocked'}) · segue com o ${MAIN}`;
  let who=label(res?.executor,config,models);
  if (res?.fallback && res.previous_executor) who=`${label(res.previous_executor,config,models)} indisponível → ${who}`;
  const parts=[`${head} ${who}`,`${STATUS[res?.status]||code(res?.status)||'?'}${res?.status==='failed'&&res.error_code?` (${code(res.error_code)})`:''}`];
  if (typeof res?.cost_usd==='number' && Number.isFinite(res.cost_usd)) parts.push(money(res.cost_usd));
  else if (res?.executor==='codex') parts.push('sem custo de API');
  if (Number.isFinite(res?.duration_ms)) parts.push(duration(res.duration_ms));
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
