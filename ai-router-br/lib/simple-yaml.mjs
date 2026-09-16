// Minimal YAML parser for ai-router-br's own config shape. No arbitrary tags/code.
function scalar(raw) {
  const s = raw.trim();
  if (s === '') return {};
  if (s === 'true') return true;
  if (s === 'false') return false;
  if (s === 'null' || s === '~') return null;
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
  if (s.startsWith('[') && s.endsWith(']')) {
    const inner = s.slice(1,-1).trim();
    if (!inner) return [];
    return splitCsv(inner).map(x => scalar(x));
  }
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1,-1);
  return s;
}
function splitCsv(s) {
  const out=[]; let cur=''; let q=null;
  for (const ch of s) {
    if ((ch==='"'||ch==="'") && (!q || q===ch)) { q=q?null:ch; cur+=ch; continue; }
    if (ch===',' && !q) { out.push(cur.trim()); cur=''; } else cur+=ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
export function parseYaml(text) {
  const root={}; const stack=[{indent:-1,obj:root}];
  for (const original of text.replace(/\r/g,'').split('\n')) {
    if (!original.trim() || original.trim().startsWith('#')) continue;
    const indent=original.match(/^ */)[0].length;
    const line=original.trim();
    const idx=line.indexOf(':');
    if (idx<1) throw new Error(`Unsupported YAML line: ${line}`);
    const key=line.slice(0,idx).trim();
    const raw=line.slice(idx+1).trim();
    while (stack.length>1 && indent<=stack.at(-1).indent) stack.pop();
    const parent=stack.at(-1).obj;
    const value=scalar(raw);
    // Prototype keys are dropped (children still parse into a detached object) so config files cannot pollute objects.
    if (!['__proto__','constructor','prototype'].includes(key)) parent[key]=value;
    if (raw==='') stack.push({indent,obj:value});
  }
  return root;
}
