#!/usr/bin/env node
import os from 'node:os'; import path from 'node:path';
import { syncRuleFiles, RULE_FILES } from '../lib/rules.mjs';
const args=process.argv.slice(2); const apply=args.includes('--apply');
// --codex-home: the same short block in the global Codex AGENTS.md ($CODEX_HOME or ~/.codex), so Codex knows the router in every project.
let files;
if(args.includes('--codex-home')) files=[path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'AGENTS.md')];
else { const root=path.resolve(args.find(x=>!x.startsWith('--'))||'.'); files=RULE_FILES.map(f=>path.join(root,f)); }
const r=syncRuleFiles(files,{apply});
console.log(JSON.stringify({apply,files:r.results,structural_block_identical:r.structural_block_identical},null,2));
if(!r.structural_block_identical) process.exit(1);
