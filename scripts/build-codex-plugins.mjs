#!/usr/bin/env node
/**
 * scripts/build-codex-plugins.mjs
 *
 * Gera a versão nativa Codex (codex/<plugin>/) de cada plugin Claude listado em PLUGINS, e as entradas
 * correspondentes em .agents/plugins/marketplace.json. O plugin Claude é a fonte única: nunca edite
 * codex/<plugin>/ à mão — mude o plugin Claude e rode este script.
 *
 *   node scripts/build-codex-plugins.mjs           # regenera
 *   node scripts/build-codex-plugins.mjs --check   # só confere se está em dia (validate.mjs/CI)
 *
 * O Codex só carrega skills (o manifesto não tem `agents`, `commands` nem `hooks`), então:
 *   - skills/      → copiadas; SKILL.md e .md do topo de cada skill recebem as adaptações abaixo;
 *   - agents/*.md  → skills/<nome>/SKILL.md, com o modo de leitura/escrita das `tools` escrito no texto;
 *   - commands/*.md→ skills/<nome>/SKILL.md (`$ARGUMENTS` vira `<argumentos>`);
 *   - hooks.json   → não vai (sem equivalente aqui); scripts em hooks/ continuam como referência;
 *   - `${CLAUDE_PLUGIN_ROOT}` → `<plugin-root>`; `plugin:nome` e `/comando` → `$plugin:nome` (o Codex também prefixa).
 * Subpastas das skills (assets/, templates/...) são copiadas byte a byte: são kits gravados em projetos.
 * ai-router-br não passa por aqui: tem versão Codex própria em codex/ai-router-br/.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const REPO_URL='https://github.com/moralles-filmes/claude-plugins';
const PLUGINS={
  'padrao-saas':{displayName:'Padrão SaaS',short:'Arquitetura, multi-tenancy e acesso de SaaS',prompt:'Use $padrao-saas:aplicar para instalar, auditar ou atualizar o Padrão SaaS neste repositório.'},
  'saas-shield-br':{displayName:'SaaS Shield BR',short:'Segurança e custo de SaaS Supabase + Vercel',prompt:'Use $saas-shield-br:pre-deploy para rodar o checklist de segurança antes do deploy.'},
  'saas-builder-br':{displayName:'SaaS Builder BR',short:'Constrói SaaS multi-tenant Vite + Supabase',prompt:'Use $saas-builder-br:novo-saas para começar um SaaS novo a partir do conceito.'},
  'saas-audit-br':{displayName:'SaaS Audit BR',short:'Auditoria ponta a ponta de SaaS (P0–P3)',prompt:'Use $saas-audit-br:module para auditar um módulo do SaaS sem alterar código.'},
  'code-health':{displayName:'Code Health',short:'Dead code e código não-funcional em JS/TS',prompt:'Use $code-health:health para o relatório de saúde do código (dead code + não-funcional).'},
  'turbo':{displayName:'Turbo',short:'Performance ponta a ponta React + Postgres',prompt:'Use $turbo:turbo para diagnosticar e otimizar a performance do sistema.'},
  'pt-br-utils':{displayName:'PT-BR Utils',short:'Revisão de PT-BR e orçamento de tokens',prompt:'Use $pt-br-utils:pt-br-translator para revisar as strings de UI em português.'}
};
// O Codex lista skills de plugin como `<plugin>:<nome>`, como o Claude: os nomes ficam iguais. RENAME só serve para
// colisão dentro do mesmo plugin (agente e comando de mesmo nome já viram uma skill só, ver buildPlugin).
const RENAME={};
// Fora da cópia: manifesto/peças só do Claude e artefatos de desenvolvimento do plugin.
const SKIP_TOP=new Set(['.claude-plugin','agents','commands','tests','node_modules','INSTALL.md','package.ps1','package.sh']);
const WRITE_TOOLS=['Edit','Write','NotebookEdit','MultiEdit'];

const read=f=>fs.readFileSync(f,'utf8').replace(/\r\n/g,'\n');
const exists=f=>fs.existsSync(f);
const list=d=>exists(d)?fs.readdirSync(d):[];

function frontmatter(text) {
  const m=text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return {fm:{},body:text};
  const fm={}; let key=null;
  for (const line of m[1].split('\n')) {
    const item=line.match(/^\s+-\s+(.*)$/);
    if (item && key) { (Array.isArray(fm[key])?fm[key]:(fm[key]=[])).push(unquote(item[1])); continue; }
    const kv=line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (kv) { key=kv[1]; fm[key]=kv[2]===''?[]:unquote(kv[2]); }
  }
  return {fm,body:text.slice(m[0].length)};
}
function unquote(v) {
  const s=v.trim();
  if (s.startsWith('"') && s.endsWith('"')) return s.slice(1,-1).replace(/\\"/g,'"').replace(/\\\\/g,'\\');
  if (s.startsWith("'") && s.endsWith("'")) return s.slice(1,-1).replace(/''/g,"'");
  return s;
}
// Sempre entre aspas duplas: descrições têm ": " e " #", que quebrariam o YAML sem aspas.
const yq=s=>`"${String(s).replace(/\\/g,'\\\\').replace(/"/g,'\\"')}"`;
const header=(name,description)=>`---\nname: ${name}\ndescription: ${yq(description)}\n---\n`;

// Nomes que cada plugin expõe, para reescrever referências cruzadas sem tocar em caminhos (/app, /tmp...).
function catalog() {
  const names={}; const commands={};
  for (const p of Object.keys(PLUGINS)) {
    const dir=path.join(ROOT,p); names[p]={};
    for (const s of list(path.join(dir,'skills'))) if (exists(path.join(dir,'skills',s,'SKILL.md'))) names[p][s]=`${p}:${s}`;
    for (const kind of ['agents','commands']) for (const f of list(path.join(dir,kind)).filter(f=>f.endsWith('.md'))) {
      const n=f.slice(0,-3); const out=`${p}:${RENAME[`${p}:${n}`]||n}`; names[p][n]=out;
      if (kind==='commands') (commands[n]||=[]).push(out);
    }
  }
  return {names,commands};
}
// Skill citada sem plugin (frontmatter `skills:` de agente): a do próprio plugin, senão a única que tiver o nome.
const qualify=(plugin,name,{names})=>names[plugin]?.[name]||Object.values(names).map(n=>n[name]).find(Boolean)||name;
function adapt(text,{names,commands}) {
  let t=text.replaceAll('${CLAUDE_PLUGIN_ROOT}','<plugin-root>');
  const plugins=Object.keys(PLUGINS).map(p=>p.replace(/[-]/g,'\\-')).join('|');
  t=t.replace(new RegExp(`(?<![\\w./-])/?(${plugins}):([a-z0-9-]+)\\b`,'g'),(m,p,n)=>names[p]?.[n]?`$${names[p][n]}`:m);
  // `/comando` sem plugin só é reescrito quando um único plugin tem esse comando (`/audit` existe em dois).
  const bare=Object.keys(commands).filter(n=>commands[n].length===1).join('|');
  if (bare) t=t.replace(new RegExp(`(?<![\\w./:$-])/(${bare})\\b(?![\\w/.-])`,'g'),(m,n)=>`$${commands[n][0]}`);
  return t;
}
const NOTE=plugin=>`\n\n## Nota para o Codex\n\nGerado de \`${plugin}/\` (plugin Claude Code) por \`scripts/build-codex-plugins.mjs\`. \`<plugin-root>\` é a pasta que contém \`.codex-plugin/\`, dois níveis acima deste \`SKILL.md\`. Onde o texto manda acionar um agente ou subagente (Agent tool, \`subagent_type\`), use a skill de mesmo nome deste plugin (\`$${plugin}:<nome>\`) — nesta sessão ou num sub-agente do Codex, se disponível —, respeitando o modo de leitura/escrita que ela declara. Um \`/comando\` do Claude Code é a skill \`$<plugin>:<comando>\`.\n`;

function toolMode(tools) {
  if (!tools) return null;
  const t=(Array.isArray(tools)?tools:String(tools).split(',')).map(s=>s.trim()).filter(Boolean);
  if (t.includes('*')) return null;
  const writes=t.some(x=>WRITE_TOOLS.includes(x)); const edits=t.includes('Edit')||t.includes('MultiEdit');
  const shell=t.includes('Bash')||t.includes('PowerShell');
  if (!writes && !shell) return 'Modo somente leitura: não crie, edite nem apague arquivos, e não rode comandos que alterem o projeto.';
  if (!writes) return 'Não edite arquivos. Comandos só para leitura e verificação (testes, build, lint, typecheck).';
  if (!edits) return 'Pode criar arquivos novos (ex.: relatórios); não edite arquivos existentes do projeto.';
  return null;
}
function agentSkill(plugin,name,text,ctx) {
  const {fm,body}=frontmatter(text);
  const lines=[`> Papel de agente — no Claude Code é o subagente isolado \`${plugin}:${name}\`.`];
  const mode=toolMode(fm.tools); if (mode) lines.push(`> ${mode}`);
  const pre=(Array.isArray(fm.skills)?fm.skills:[]).map(s=>`\`$${qualify(plugin,s,ctx)}\``);
  if (pre.length) lines.push(`> Antes de começar, carregue as skills ${pre.join(', ')}.`);
  return {description:adapt(fm.description||name,ctx),body:`${lines.join('\n')}\n\n${adapt(body.trim(),ctx)}`};
}
function commandSkill(plugin,name,text,ctx) {
  const {fm,body}=frontmatter(text);
  const hint=typeof fm['argument-hint']==='string' && fm['argument-hint']?` — formato \`${fm['argument-hint']}\``:'';
  // The suffix names the Claude Code command on purpose, so it is appended after adapt().
  const description=`${adapt(String(fm.description||name),ctx).replace(/\.\s*$/,'')}. Use quando o usuário pedir (equivale ao comando /${name} do Claude Code).`;
  return {description,body:`\`<argumentos>\` = o que o usuário pediu junto com a skill${hint}.\n\n${adapt(body.trim().replaceAll('$ARGUMENTS','<argumentos>'),ctx)}`};
}

function copyDir(src,dst,{transformTop=false,ctx}={}) {
  fs.mkdirSync(dst,{recursive:true});
  for (const e of fs.readdirSync(src,{withFileTypes:true})) {
    const s=path.join(src,e.name); const d=path.join(dst,e.name);
    if (e.isDirectory()) copyDir(s,d,{ctx});
    else if (transformTop && e.name.endsWith('.md')) fs.writeFileSync(d,adapt(read(s),ctx));
    else fs.copyFileSync(s,d);
  }
}
function buildPlugin(plugin,out,ctx) {
  const src=path.join(ROOT,plugin);
  const claude=JSON.parse(read(path.join(src,'.claude-plugin','plugin.json')));
  fs.mkdirSync(out,{recursive:true});
  for (const e of fs.readdirSync(src,{withFileTypes:true})) {
    if (SKIP_TOP.has(e.name)) continue;
    const s=path.join(src,e.name); const d=path.join(out,e.name);
    if (e.name==='hooks') { copyDir(s,d,{ctx}); fs.rmSync(path.join(d,'hooks.json'),{force:true}); continue; }
    if (e.name!=='skills') { e.isDirectory()?copyDir(s,d,{ctx}):fs.copyFileSync(s,d); continue; }
    for (const skill of fs.readdirSync(s,{withFileTypes:true}).filter(x=>x.isDirectory())) {
      const sd=path.join(s,skill.name); const dd=path.join(d,skill.name);
      copyDir(sd,dd,{transformTop:true,ctx});
      const {fm,body}=frontmatter(read(path.join(sd,'SKILL.md')));
      let description=adapt(fm.description||skill.name,ctx);
      // O Codex não aceita skill só manual; o pedido explícito fica escrito na descrição.
      if (fm['disable-model-invocation']==='true') description=`${String(description).replace(/\.\s*$/,'')}. Use só quando o usuário pedir explicitamente.`;
      fs.writeFileSync(path.join(dd,'SKILL.md'),header(fm.name||skill.name,description)+adapt(body,ctx).trimEnd()+NOTE(plugin));
    }
  }
  const agents=Object.fromEntries(list(path.join(src,'agents')).filter(f=>f.endsWith('.md')).map(f=>[f.slice(0,-3),read(path.join(src,'agents',f))]));
  const cmds=Object.fromEntries(list(path.join(src,'commands')).filter(f=>f.endsWith('.md')).map(f=>[f.slice(0,-3),read(path.join(src,'commands',f))]));
  const emit=(name,{description,body})=>{
    const dir=path.join(out,'skills',name);
    if (exists(path.join(dir,'SKILL.md'))) throw new Error(`${plugin}: skill ${name} já existe (renomeie em RENAME)`);
    fs.mkdirSync(dir,{recursive:true}); fs.writeFileSync(path.join(dir,'SKILL.md'),header(name,description)+body.trimEnd()+NOTE(plugin));
  };
  for (const [name,text] of Object.entries(agents)) {
    const a=agentSkill(plugin,name,text,ctx);
    // Comando que só despacha para o agente de mesmo nome (turbo): uma skill com as regras de despacho e o protocolo.
    if (cmds[name] && !RENAME[`${plugin}:${name}`]) { const c=commandSkill(plugin,name,cmds[name],ctx); emit(name,{description:a.description,body:`## Despacho\n\n${c.body}\n\n## Protocolo do agente\n\n${a.body}`}); delete cmds[name]; }
    else emit(name,a);
  }
  for (const [name,text] of Object.entries(cmds)) emit(RENAME[`${plugin}:${name}`]||name,commandSkill(plugin,name,text,ctx));
  const meta=PLUGINS[plugin];
  const manifest={name:plugin,version:claude.version,description:claude.description,author:claude.author,homepage:claude.homepage||REPO_URL,repository:claude.repository||REPO_URL,license:claude.license||'MIT',keywords:claude.keywords||[],skills:'./skills',
    interface:{displayName:meta.displayName,shortDescription:meta.short,longDescription:claude.description,developerName:claude.author?.name||'Yuri Moraes',category:'Developer Tools',capabilities:['Read','Write'],defaultPrompt:[meta.prompt]}};
  fs.mkdirSync(path.join(out,'.codex-plugin'),{recursive:true});
  fs.writeFileSync(path.join(out,'.codex-plugin','plugin.json'),JSON.stringify(manifest,null,2)+'\n');
  fs.writeFileSync(path.join(out,'GENERATED.md'),`# ${meta.displayName} — versão Codex (gerada)\n\nGerada de \`../../${plugin}/\` por \`scripts/build-codex-plugins.mjs\`. Não edite à mão: mude o plugin Claude e rode \`node scripts/build-codex-plugins.mjs\`.\n\n- Agentes e comandos do Claude Code viram skills (o manifesto Codex só tem \`skills\`).\n- \`hooks/hooks.json\` não é usado aqui: os bloqueios automáticos do Claude Code não existem nesta versão.\n`);
}
function marketplace(current) {
  const mp=current?JSON.parse(current):{name:'morallesfilms-local',interface:{displayName:'Morallesfilms — Marketplace local'},plugins:[]};
  const generated=new Set(Object.keys(PLUGINS));
  mp.plugins=[...mp.plugins.filter(p=>!generated.has(p.name)),...Object.keys(PLUGINS).map(name=>({name,source:{source:'local',path:`./codex/${name}`},policy:{installation:'AVAILABLE',authentication:'ON_USE'},category:'Developer Tools'}))];
  return JSON.stringify(mp,null,2)+'\n';
}

const walk=d=>exists(d)?fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)).map(f=>path.join(e.name,f)):[e.name]):[];
const norm=f=>{ const b=fs.readFileSync(f); return /\.(md|json|mjs|js|ts|tsx|sql|yml|yaml|txt|sh|ps1)$/i.test(f)?b.toString('utf8').replace(/\r\n/g,'\n'):b.toString('base64'); };

const check=process.argv.includes('--check');
const ctx=catalog();
const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'codex-plugins-'));
const drift=[];
try {
  for (const p of Object.keys(PLUGINS)) {
    const built=path.join(tmp,p); buildPlugin(p,built,ctx);
    const target=path.join(ROOT,'codex',p);
    if (check) {
      const a=new Set(walk(built)); const b=new Set(walk(target));
      for (const f of new Set([...a,...b])) if (!a.has(f)||!b.has(f)||norm(path.join(built,f))!==norm(path.join(target,f))) drift.push(`codex/${p}/${f.replace(/\\/g,'/')}`);
    } else { fs.rmSync(target,{recursive:true,force:true}); copyDir(built,target); }
  }
  const mpPath=path.join(ROOT,'.agents','plugins','marketplace.json');
  const current=exists(mpPath)?read(mpPath):null; const next=marketplace(current);
  if (check) { if (current!==next) drift.push('.agents/plugins/marketplace.json'); }
  else { fs.mkdirSync(path.dirname(mpPath),{recursive:true}); fs.writeFileSync(mpPath,next); }
} finally { fs.rmSync(tmp,{recursive:true,force:true}); }

if (check) {
  if (drift.length) { console.error(`Versões Codex desatualizadas (${drift.length}); rode: node scripts/build-codex-plugins.mjs\n${drift.slice(0,20).map(f=>`  - ${f}`).join('\n')}`); process.exit(1); }
  console.log(`Versões Codex em dia (${Object.keys(PLUGINS).length} plugins).`);
} else console.log(`Gerado: ${Object.keys(PLUGINS).map(p=>`codex/${p}`).join(', ')} e .agents/plugins/marketplace.json`);
