import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { git, statusEntries } from './security.mjs';
export function createWorktree(root,taskId) {
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),`ai-router-${String(taskId).replace(/[^A-Za-z0-9_-]/g,'-').slice(0,40)}-`));
  try { git(root,['worktree','add','--detach',dir,'HEAD']); }
  catch (e) { try{ fs.rmSync(dir,{recursive:true,force:true}); }catch{} throw e; }
  return dir;
}
export function headOf(worktree) {
  return git(worktree,['rev-parse','HEAD']).stdout.trim();
}
/** Every path touched in the worktree, including both sides of renames and files inside new directories. */
export function changedFiles(worktree) {
  const out=new Set();
  for (const e of statusEntries(worktree)) { out.add(e.path.replaceAll('\\','/')); if(e.from) out.add(e.from.replaceAll('\\','/')); }
  return [...out];
}
function isLink(p) { try { return fs.lstatSync(p).isSymbolicLink(); } catch { return false; } }
/**
 * Symlinks and Windows junctions created by the worker can expose or redirect files outside the worktree
 * (git lists, reads and would let us delete files through a junction). They are unlinked without being
 * followed and fail validation. Symlinks committed in HEAD are repository content and stay.
 */
export function assertNoWorkerLinks(worktree) {
  const committed=new Set(git(worktree,['ls-tree','-r','-z','--full-tree','HEAD']).stdout.split('\0')
    .filter(l=>l.startsWith('120000 ')).map(l=>l.slice(l.indexOf('\t')+1)));
  const found=[]; const stack=[''];
  while (stack.length) {
    const rel=stack.pop();
    for (const e of fs.readdirSync(path.join(worktree,rel),{withFileTypes:true})) {
      if (!rel && e.name==='.git') continue;
      const child=rel?`${rel}/${e.name}`:e.name;
      if (e.isSymbolicLink()) { if (!committed.has(child)) { try{ fs.unlinkSync(path.join(worktree,child)); }catch{} found.push(child); } }
      else if (e.isDirectory()) stack.push(child);
    }
  }
  if (found.length) throw Object.assign(new Error(`worker_created_link:${found[0]}`),{code:'scope_violation'});
}
/**
 * A fresh worktree holds only tracked files, so every ignored file in it was created by the worker.
 * Ignored files never appear in changed_files or in the patch; they are deleted so tests and review
 * only ever see what the patch contains.
 */
export function discardIgnoredFiles(worktree) {
  const list=()=>git(worktree,['ls-files','--others','--ignored','--exclude-standard','-z']).stdout.split('\0').filter(Boolean);
  const ignored=list();
  for (const rel of ignored) {
    const segs=rel.split('/');
    if (segs.some(s=>!s || s==='.' || s==='..')) continue;
    // Never delete through a link: every parent must be a real directory of the worktree.
    let cur=worktree; let viaLink=false;
    for (const seg of segs.slice(0,-1)) { cur=path.join(cur,seg); if (isLink(cur)) { viaLink=true; break; } }
    if (!viaLink) { try{ fs.unlinkSync(path.join(worktree,...segs)); }catch{} }
  }
  if (ignored.length && list().length) throw Object.assign(new Error('ignored_files_not_removed'),{code:'scope_violation'});
  return ignored.map(p=>p.replaceAll('\\','/'));
}
/** A worker must never move HEAD: a commit would hide its changes from scope validation. */
export function assertHeadUnchanged(worktree,expected) {
  const now=headOf(worktree);
  if (now!==expected) throw Object.assign(new Error('worker_committed'),{code:'scope_violation'});
}
/**
 * Local branches/tags, HEAD and working-tree status of the main repository, to detect writes by worker
 * processes or tests. Remote-tracking refs are left out: IDE auto-fetch may legitimately move them.
 */
export function repoSnapshot(root) {
  return JSON.stringify([
    git(root,['rev-parse','HEAD'],{allowFailure:true}).stdout.trim(),
    git(root,['symbolic-ref','-q','HEAD'],{allowFailure:true}).stdout.trim(),
    git(root,['for-each-ref','--format=%(refname) %(objectname)','refs/heads','refs/tags']).stdout,
    git(root,['status','--porcelain=v1','-z','--untracked-files=all']).stdout
  ]);
}
export function assertRepoUnchanged(root,snapshot,reason) {
  if (repoSnapshot(root)!==snapshot) throw Object.assign(new Error(reason),{code:'scope_violation'});
}
export function makePatch(worktree) {
  const untracked=git(worktree,['ls-files','--others','--exclude-standard','-z']).stdout.split('\0').filter(Boolean);
  if(untracked.length) git(worktree,['add','-N','--',...untracked]);
  // Explicit options: user git config (external diff, textconv, prefixes, color, relative) must not alter the patch.
  return git(worktree,['diff','--binary','--no-ext-diff','--no-textconv','--no-color','--no-relative','--src-prefix=a/','--dst-prefix=b/','HEAD']).stdout;
}
export function removeWorktree(root,dir) {
  try{ git(root,['worktree','remove','--force',dir]); }catch{}
  try{ fs.rmSync(dir,{recursive:true,force:true}); }catch{}
  try{ git(root,['worktree','prune']); }catch{}
}
