#!/usr/bin/env node
// Portable test entry: shells on Windows do not expand tests/*.test.mjs and Node 20 does not expand globs itself.
import fs from 'node:fs'; import path from 'node:path'; import { spawnSync } from 'node:child_process'; import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const files=fs.readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.test.mjs')).sort().map(f=>path.join('tests',f));
const r=spawnSync(process.execPath,['--test',...files],{cwd:root,stdio:'inherit'});
process.exit(r.status??1);
