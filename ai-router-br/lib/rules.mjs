import fs from 'node:fs';
import path from 'node:path';

export const RULES_START='<!-- ai-router-br:start -->';
export const RULES_END='<!-- ai-router-br:end -->';
export const RULE_FILES=['CLAUDE.md','AGENTS.md'];
// Identical in CLAUDE.md and AGENTS.md. Keep it short: the manual lives in the plugin, not in project files.
export const RULES_BLOCK=`${RULES_START}
## AI Router BR
When ai-router-br is available (Claude Code skill \`ai-router-br:route\`, Codex skill \`$ai-router\`), classify substantial work by risk/cost before executing. Keep critical/security/architecture decisions with the main agent; delegate only when beneficial; external-worker output must be tested and reviewed before integration. Never place secrets in router state.
${RULES_END}`;

const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
// A router block is a start marker followed by the nearest end marker with no other start marker in between.
// A stray marker is left alone as user text instead of swallowing the content after it.
const PAIR=`${esc(RULES_START)}(?:(?!${esc(RULES_START)})[\\s\\S])*?${esc(RULES_END)}`;
const pairs=text=>[...String(text??'').matchAll(new RegExp(PAIR,'g'))];

export function stripRules(text) {
  return String(text??'').replace(new RegExp(`(?:\\r?\\n){0,2}${PAIR}(?:\\r?\\n)?`,'g'),'');
}
export function mergeRules(text) {
  const s=String(text??'');
  const eol=s.includes('\r\n')?'\r\n':'\n';
  const block=RULES_BLOCK.replace(/\n/g,eol);
  const found=pairs(s);
  if (!found.length) {
    if (!s) return block+eol;
    const sep=s.endsWith(eol+eol)?'':(s.endsWith('\n')?eol:eol+eol);
    return s+sep+block+eol;
  }
  // Replace the first block in place; duplicates go away together with the blank lines that introduced them.
  let out=''; let last=0;
  found.forEach((m,i)=>{
    const before=s.slice(last,m.index);
    out+=i===0?before+block:before.replace(/(?:\r?\n){1,2}$/,'');
    last=m.index+m[0].length;
  });
  return out+s.slice(last);
}
export function extractAllRules(text) {
  return pairs(text).map(m=>m[0].replace(/\r\n/g,'\n'));
}
export function extractRules(text) {
  return extractAllRules(text)[0]??null;
}
export function syncRuleFiles(files,{apply=false}={}) {
  const results=[];
  for (const file of files) {
    const before=fs.existsSync(file)?fs.readFileSync(file,'utf8'):'';
    const after=mergeRules(before);
    const changed=after!==before;
    if (apply && changed) { fs.mkdirSync(path.dirname(file),{recursive:true}); fs.writeFileSync(file,after); }
    results.push({file,changed,blocks:pairs(after).length});
  }
  const blocks=files.map(f=>extractRules(apply&&fs.existsSync(f)?fs.readFileSync(f,'utf8'):mergeRules(fs.existsSync(f)?fs.readFileSync(f,'utf8'):'')));
  return {results,structural_block_identical:blocks.every(b=>b===RULES_BLOCK)};
}
export function syncProjectRules(root,opts) {
  return syncRuleFiles(RULE_FILES.map(f=>path.join(root,f)),opts);
}
