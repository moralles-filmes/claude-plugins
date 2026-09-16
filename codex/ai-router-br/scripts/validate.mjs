#!/usr/bin/env node
import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'); const errors=[];
for(const f of ['package.json','README.md','INSTALL.md','templates/config.yml','scripts/ai-router.mjs','scripts/sync-rules.mjs','scripts/doctor.mjs','lib/bootstrap.mjs','lib/rules.mjs','workers/codex-worker.mjs','workers/deepseek-worker.mjs']) if(!fs.existsSync(path.join(root,f)))errors.push(`missing ${f}`);
const manifests=['.claude-plugin/plugin.json','.codex-plugin/plugin.json'].filter(f=>fs.existsSync(path.join(root,f))); if(!manifests.length)errors.push('missing plugin manifest');
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
for(const m of manifests){try{const j=JSON.parse(fs.readFileSync(path.join(root,m),'utf8'));if(j.name!=='ai-router-br')errors.push(`${m}: wrong name`);if(!/^\d+\.\d+\.\d+/.test(j.version))errors.push(`${m}: invalid semver`);if(j.version!==pkg.version)errors.push(`${m}: version ${j.version} != package.json ${pkg.version}`);}catch(e){errors.push(`${m}: invalid JSON`);}}
if(fs.existsSync(path.join(root,'hooks','hooks.json'))){try{JSON.parse(fs.readFileSync(path.join(root,'hooks','hooks.json'),'utf8'));}catch{errors.push('hooks/hooks.json: invalid JSON');}}
const skillRoot=path.join(root,'skills'); if(!fs.existsSync(skillRoot) || !fs.readdirSync(skillRoot).length)errors.push('no skills');
else for(const s of fs.readdirSync(skillRoot)){
  const f=path.join(skillRoot,s,'SKILL.md'); if(!fs.existsSync(f)){errors.push(`skills/${s}: missing SKILL.md`);continue;}
  const body=fs.readFileSync(f,'utf8');
  if(!/^---\r?\n[\s\S]*?\bname:\s*\S[\s\S]*?\bdescription:\s*\S[\s\S]*?\r?\n---/.test(body))errors.push(`skills/${s}: frontmatter needs name and description`);
  // The CLI lives in the plugin, never in the user's project: bare relative script paths break outside the plugin dir.
  if(/(?<![\w/.}])scripts\/(?:ai-router|doctor|sync-rules)\.mjs/.test(body))errors.push(`skills/${s}: reference plugin scripts through the plugin root, not a project-relative path`);
}
if(errors.length){console.error(errors.join('\n'));process.exit(1);}console.log('Validation OK');
