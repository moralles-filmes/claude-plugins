#!/usr/bin/env node
// SessionStart context for Claude Code: a few lines so normal requests reach the router without the user naming it.
// Prints nothing inside worker processes or when the project disabled auto delegation.
import fs from 'node:fs'; import path from 'node:path';
if (process.env.AI_ROUTER_WORKER==='1') process.exit(0);
try {
  const cfg=path.join(process.env.CLAUDE_PROJECT_DIR||process.cwd(),'.ai-router','config.yml');
  if (fs.existsSync(cfg) && /^\s*auto_delegate:\s*false\s*$/m.test(fs.readFileSync(cfg,'utf8'))) process.exit(0);
} catch {}
console.log([
  'ai-router-br is installed. Before executing a substantial development request (feature, module, multi-file change, refactor, bug hunt, repo-wide inventory), invoke the `ai-router-br:route` skill to classify it by risk/cost; it bootstraps .ai-router/ on first use.',
  'Small or trivial requests: just do them. The user does not need to mention the router.'
].join('\n'));
