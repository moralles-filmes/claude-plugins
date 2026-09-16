import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

function killTree(child) {
  if (process.platform==='win32' && child.pid) {
    spawnSync('taskkill',['/pid',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
  } else {
    try { child.kill('SIGKILL'); } catch {}
  }
}
/**
 * Windows cannot spawn npm/npx (.cmd shims) without a shell. Run their JS entry points with node instead,
 * so test commands keep working with shell:false. Other .cmd-only tools must be invoked through node/npm.
 */
export function resolveCommand(argv) {
  if (process.platform!=='win32') return argv;
  const exe=path.basename(argv[0]).replace(/\.(cmd|exe|bat)$/i,'').toLowerCase();
  if (exe==='node') return [process.execPath,...argv.slice(1)];
  if (exe==='npm' || exe==='npx') {
    const cli=path.join(path.dirname(process.execPath),'node_modules','npm','bin',`${exe}-cli.js`);
    if (fs.existsSync(cli)) return [process.execPath,cli,...argv.slice(1)];
  }
  return argv;
}
export async function run(command,args,{cwd,env=process.env,input='',timeoutMs=300000,allowCodes=[0]}={}) {
  return await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd,env,stdio:['pipe','pipe','pipe'],shell:false,windowsHide:true});
    let stdout='',stderr='',timedOut=false;
    const timer=setTimeout(()=>{timedOut=true; killTree(child);},timeoutMs);
    child.stdout.on('data',d=>stdout+=d); child.stderr.on('data',d=>stderr+=d);
    // A child that exits early must not crash the router with EPIPE on stdin.
    child.stdin.on('error',()=>{});
    child.on('error',e=>{clearTimeout(timer); reject(Object.assign(e,{code:'spawn_error',errno:e.code}));});
    child.on('close',code=>{clearTimeout(timer); if(timedOut) return reject(Object.assign(new Error('timeout'),{code:'timeout',stdout,stderr})); if(!allowCodes.includes(code)) return reject(Object.assign(new Error(`process_exit_${code}`),{code:'process_failed',exitCode:code,stdout,stderr})); resolve({code,stdout,stderr});});
    if(input) child.stdin.write(input); child.stdin.end();
  });
}
