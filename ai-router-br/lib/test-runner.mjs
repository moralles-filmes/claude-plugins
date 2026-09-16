import { run, resolveCommand } from './process.mjs';
import { sanitizeEnv } from './redact.mjs';
import { validateTestCommand } from './security.mjs';
import { repoSnapshot, assertRepoUnchanged, assertHeadUnchanged } from './worktree.mjs';

export function validateTaskTests(task,config) {
  return (task.tests||[]).map(command=>({command,argv:validateTestCommand(command,config?.execution?.allowed_test_executables)}));
}
/** Runs the task's test commands inside the worker worktree. A failing test is never "unavailability". */
export async function runTaskTests(task,config,cwd) {
  const results=[];
  for (const {command,argv} of validateTaskTests(task,config)) {
    const [cmd,...args]=resolveCommand(argv);
    try {
      const r=await run(cmd,args,{cwd,env:sanitizeEnv(),timeoutMs:Number(config?.execution?.test_timeout_ms||300000)});
      results.push({command,ok:true,stdout:r.stdout.slice(-4000)});
    } catch (e) {
      const code=e.code==='spawn_error'?'test_command_unavailable':'tests_failed';
      results.push({command,ok:false,error:e.code==='spawn_error'?`${code}:${e.errno||''}`:e.code,exit_code:e.exitCode??null,stdout:String(e.stdout||'').slice(-4000),stderr:String(e.stderr||'').slice(-4000)});
      throw Object.assign(new Error(code),{code,tests:results});
    }
  }
  return results;
}
/**
 * Test commands execute worker-written code with the user's privileges, outside any sandbox. By default they are
 * deferred: the main agent reviews the patch first and runs them in the real tree. Running them in the worktree
 * is an opt-in of the plugin template, and any write to the main repository or worktree HEAD fails the task.
 */
export async function testsForWorker(task,config,{root,wt,head}) {
  const commands=(task.tests||[]).map(String);
  if (!commands.length) return {tests:[],tests_status:'none'};
  if (config?.execution?.run_tests_in_worktree!==true) return {tests:[],tests_status:'deferred_to_main',tests_pending:commands};
  const before=repoSnapshot(root);
  let tests;
  try { tests=await runTaskTests(task,config,wt); }
  finally {
    assertRepoUnchanged(root,before,'tests_modified_main_repository');
    assertHeadUnchanged(wt,head);
  }
  return {tests,tests_status:'passed'};
}
