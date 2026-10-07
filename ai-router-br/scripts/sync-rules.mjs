#!/usr/bin/env node
import os from 'node:os'; import path from 'node:path';
import { syncRuleFiles, syncProjectRules } from '../lib/rules.mjs';
const args=process.argv.slice(2); const apply=args.includes('--apply');
// --codex-home: the same short block in the global Codex AGENTS.md ($CODEX_HOME or ~/.codex), so Codex knows the router in every project.
// Project roots go through syncProjectRules: a CLAUDE.md that imports @AGENTS.md keeps no copy of the block.
const r=args.includes('--codex-home')
  ? syncRuleFiles([path.join(process.env.CODEX_HOME||path.join(os.homedir(),'.codex'),'AGENTS.md')],{apply})
  : syncProjectRules(path.resolve(args.find(x=>!x.startsWith('--'))||'.'),{apply});
console.log(JSON.stringify({apply,files:r.results,structural_block_identical:r.structural_block_identical},null,2));
if(!r.structural_block_identical) process.exit(1);
