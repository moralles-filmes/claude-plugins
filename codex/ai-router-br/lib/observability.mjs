import fs from 'node:fs';
import path from 'node:path';
import { redact, redactKnown, secretEnvValues } from './redact.mjs';
export function safeTaskFileName(id) {
  return String(id||'unknown').replace(/[^A-Za-z0-9_-]/g,'-').slice(0,80) || 'unknown';
}
// Redaction walks string values (never serialized JSON, which regexes could corrupt). The patch is code the
// main agent may apply, so only exact secret values and unmistakable token formats are masked there.
function scrub(value,known,key) {
  if (typeof value==='string') return key==='patch'?redactKnown(value,known):redact(value,known);
  if (Array.isArray(value)) return value.map(v=>scrub(v,known,key));
  if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,scrub(v,known,k)]));
  return value;
}
export function record(root,result,known=[]) {
  const base=path.join(root,'.ai-router'); const dir=path.join(base,'RESULTS'); fs.mkdirSync(dir,{recursive:true});
  const safe=scrub(result,[...known,...secretEnvValues()],null);
  // A masked patch no longer applies verbatim: say so instead of silently handing over altered code.
  if (typeof result.patch==='string' && safe.patch!==result.patch) safe.patch_redacted=true;
  fs.writeFileSync(path.join(dir,`${safeTaskFileName(result.task_id)}.json`),JSON.stringify(safe,null,2)+'\n');
  // Metrics only: no prompts, no patch, no credentials.
  fs.appendFileSync(path.join(base,'COSTS.jsonl'),JSON.stringify({at:new Date().toISOString(),task_id:safe.task_id,executor:safe.executor,attempts:safe.attempts,cost_usd:safe.cost_usd??null,status:safe.status,fallback:safe.fallback??false})+'\n');
  return safe;
}
