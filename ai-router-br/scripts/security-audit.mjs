#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'); const bad=[];
const SECRET_VALUES=[/\bsk-[A-Za-z0-9_-]{20,}\b/,/\bgh[pousr]_[A-Za-z0-9]{30,}\b/,/\bAKIA[0-9A-Z]{16}\b/,/\bxox[abpors]-[A-Za-z0-9-]{20,}\b/,/-----BEGIN [A-Z ]*PRIVATE KEY-----/];
function walk(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){if(['node_modules','.git','.ai-router'].includes(e.name))continue;const p=path.join(d,e.name);if(e.isDirectory())walk(p);else{const rel=path.relative(root,p).replaceAll('\\','/');
  if(/(^|\/)\.env($|\.)/.test(rel) && !/\.(example|sample|template)$/.test(rel))bad.push(`${rel}: env file must not ship with the plugin`);
  const s=fs.readFileSync(p,'utf8');
  if(/\.(?:mjs|js|cjs|ts)$/.test(rel) && /child_process\.exec\s*\(|\bexecSync\s*\(|shell\s*:\s*true/.test(s))bad.push(`${rel}: unsafe shell execution`);
  if(/\.(?:mjs|js|cjs|ts)$/.test(rel) && /git\s+reset\s+--hard|git\s+clean\s+-fd|git\s+push\s+(?:--force|-f)/i.test(s) && !rel.includes('security') && !rel.startsWith('tests/'))bad.push(`${rel}: destructive git literal outside security policy/tests`);
  if(/\.(?:mjs|js|cjs|ts)$/.test(rel) && /ANTHROPIC_BASE_URL\s*=|OPENAI_API_KEY\s*=/.test(s))bad.push(`${rel}: must not set provider credentials or base URLs`);
  if(/DEEPSEEK_API_KEY\s*=\s*["'][^"']{8,}/.test(s))bad.push(`${rel}: embedded DeepSeek secret`);
  for(const re of SECRET_VALUES) if(re.test(s)) bad.push(`${rel}: secret-like value (${re.source.slice(0,24)}...)`);
}}
} walk(root); if(bad.length){console.error(bad.join('\n'));process.exit(1);} console.log('Security audit OK');
