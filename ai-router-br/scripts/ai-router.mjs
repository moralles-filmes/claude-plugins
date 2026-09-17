#!/usr/bin/env node
import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { loadConfig } from '../lib/config.mjs'; import { normalizeTask,loadTask,saveTask } from '../lib/task-package.mjs'; import { route } from '../lib/router.mjs';
import { ensureInitialized, resolveProjectRoot } from '../lib/bootstrap.mjs'; import { summaryLine } from '../lib/summary.mjs';
const pluginRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const argv=process.argv.slice(2); const cmd=argv.shift()||'help';
function flag(name,def=null){const i=argv.indexOf(`--${name}`); if(i<0)return def; return argv[i+1]&&!argv[i+1].startsWith('--')?argv[i+1]:true;}
const list=v=>typeof v==='string'?v.split(',').map(s=>s.trim()).filter(Boolean):[];
const print=obj=>console.log(JSON.stringify(obj,null,2));
const ROUTING=['dry-run','dispatch','classify','new-task'];
try {
  if(cmd==='init') {
    print(ensureInitialized(flag('root','.'),pluginRoot,{syncRules:'always'}));
  } else if(ROUTING.includes(cmd)) {
    // First use in any project bootstraps .ai-router/ silently and idempotently (disable with --no-init).
    const boot=argv.includes('--no-init')?{root:resolveProjectRoot(flag('root','.')),status:'disabled'}:ensureInitialized(flag('root','.'),pluginRoot);
    const root=boot.root;
    const auto_init=boot.status==='created'?{status:'created',rules_synced:boot.rules_synced,git_exclude:boot.git_exclude}:boot.status==='skipped'?{status:'skipped',reason:boot.reason}:boot.status;
    if(cmd==='new-task'){ const p=saveTask(root,{objective:flag('objective',''),allowed_files:list(flag('allowed')),forbidden_files:list(flag('forbidden'))}); print({status:'task_created',task:p,auto_init}); }
    else {
      const config=loadConfig(root,pluginRoot);
      const tf=flag('task');
      const task=typeof tf==='string'?loadTask(path.resolve(tf)):normalizeTask({objective:flag('objective',''),allowed_files:list(flag('allowed')),forbidden_files:list(flag('forbidden'))});
      const force=flag('executor'); const res=await route({root,task,config,dryRun:cmd!=='dispatch',forceExecutor:force===null?null:String(force)});
      const ignored=config.ignored_project_settings||[];
      // summary_line first: the chat line (skills, PostToolUse hook) survives even a truncated output.
      print({summary_line:summaryLine(res,config),...res,auto_init,...(ignored.length?{config_ignored_settings:ignored}:{})});
    }
  } else {
    console.log('Usage: ai-router.mjs init|dry-run|classify|dispatch|new-task --root . [--task file.json] [--objective text] [--allowed a,b] [--forbidden x/] [--executor codex|deepseek|main] [--no-init]');
    process.exit(cmd==='help'||cmd==='--help'?0:1);
  }
} catch (e) {
  print({summary_line:summaryLine({status:'error',error_code:e.code},null),status:'error',error:String(e.message||e),error_code:e.code||null});
  process.exit(1);
}
