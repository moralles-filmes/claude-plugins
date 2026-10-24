// Testes do scripts/security/deps-audit.mjs (lockfiles, audit prod × dev, watchlist, runtime, exceções).
// Rodar: node --test saas-shield-br/tests/*.test.mjs
// 100% local: o audit do gerenciador é substituído por um `npm` falso no PATH. Nada vai à rede.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  audit, checkWatch, compareVersions, loadWatchlist, parseBunAudit, parseDeclaredNode, parseNpmAudit,
  parsePnpmAudit, rangeLowerBound, readBunLock, readPnpmLock, readYarnLock,
} from '../scripts/security/deps-audit.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CLI = join(ROOT, 'scripts', 'security', 'deps-audit.mjs')
const TODAY = '2026-10-24'

function project(t, files) {
  const dir = mkdtempSync(join(tmpdir(), 'deps-audit-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), typeof content === 'string' ? content : JSON.stringify(content, null, 2))
  }
  return dir
}

// package-lock v3 mínimo: { 'node_modules/x': { version, dev?, engines?, resolved? } }
const lock = (packages) => ({ name: 'app', lockfileVersion: 3, requires: true, packages: { '': { name: 'app' }, ...packages } })
const reg = (name, version) => `https://registry.npmjs.org/${name}/-/${name.split('/').pop()}-${version}.tgz`

// O cenário dos sistemas de out/2026
const VULNERAVEL = lock({
  'node_modules/next': { version: '15.5.20', resolved: reg('next', '15.5.20') },
  'node_modules/next/node_modules/postcss': { version: '8.4.31' },
  'node_modules/sharp': { version: '0.34.5', optional: true },
  'node_modules/react': { version: '19.2.0' },
  'node_modules/react-dom': { version: '19.2.0' },
  'node_modules/zod': { version: '3.25.76' },
  'node_modules/xlsx': { version: '0.18.5', resolved: reg('xlsx', '0.18.5') },
  'node_modules/react-router-dom': { version: '6.30.1' },
  'node_modules/vitest': { version: '4.1.10', dev: true },
  'node_modules/puppeteer': { version: '25.16.0', engines: { node: '>=22.17.0' } },
})
const CORRIGIDO = lock({
  'node_modules/next': { version: '15.5.28' },
  'node_modules/next/node_modules/postcss': { version: '8.5.31' },
  'node_modules/sharp': { version: '0.35.5', optional: true },
  'node_modules/react': { version: '19.2.6' },
  'node_modules/react-dom': { version: '19.2.6' },
  'node_modules/zod': { version: '4.6.7' },
  'node_modules/xlsx': { version: '0.20.3', resolved: 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz' },
  'node_modules/react-router-dom': { version: '7.18.4' },
  'node_modules/vitest': { version: '4.1.12', dev: true },
  'node_modules/puppeteer': { version: '25.16.0', engines: { node: '>=22.17.0' } },
})

const ids = (r) => r.findings.filter((f) => !f.excepted).map((f) => `${f.severity} ${f.id}`)

test('semver: comparação e piso de range de engines', () => {
  assert.ok(compareVersions('15.5.20', '15.5.28') < 0)
  assert.ok(compareVersions('0.35.5-rc.1', '0.35.5') < 0)
  assert.equal(compareVersions('4.6.6', '4.6.6'), 0)
  assert.equal(String(Object.values(rangeLowerBound('^20.19.0 || >=22.12.0'))), '20,19,0,')
  assert.equal(rangeLowerBound('>=22.17.0').minor, 17)
  assert.equal(rangeLowerBound('>= 18 < 22').major, 18)
  assert.equal(rangeLowerBound('*').major, 0)
  assert.equal(parseDeclaredNode('20').major, 20)
  assert.equal(parseDeclaredNode('lts/jod').major, 22)
  assert.equal(parseDeclaredNode('v22.11.0').minor, 11)
})

test('watchlist: next, zod 3, xlsx do registry, react-router 6 e linha sem correção', () => {
  const w = Object.fromEntries(loadWatchlist().packages.map((p) => [p.name, p]))
  assert.match(checkWatch(w.next, '15.5.20').reason, /< 15\.5\.28/)
  assert.equal(checkWatch(w.next, '15.5.28'), null)
  assert.equal(checkWatch(w.next, '16.4.3'), null)
  assert.equal(checkWatch(w.next, '14.2.30').needsMajor, true, 'linha 14 sem correção conhecida')
  assert.equal(checkWatch(w.zod, '3.25.76').needsMajor, true)
  assert.match(checkWatch(w.zod, '4.5.0').reason, /< 4\.6\.6/)
  assert.equal(checkWatch(w.zod, '4.6.7'), null)
  assert.ok(checkWatch(w.xlsx, '0.18.5', reg('xlsx', '0.18.5')))
  assert.equal(checkWatch(w.xlsx, '0.20.3', 'https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz'), null)
  assert.equal(checkWatch(w['react-router-dom'], '6.30.6').needsMajor, true)
  assert.equal(checkWatch(w.sharp, '0.34.5').needsMajor, true, '0.34 → 0.35 é major em 0.x')
  assert.equal(checkWatch(w.vitest, '4.1.10').needsMajor, false)
  assert.equal(checkWatch(w.react, '18.3.1'), null, 'React 18 não tem RSC')
  assert.ok(checkWatch(w.react, '19.2.0'))
})

test('sistema de out/2026 (sem rede): FAIL com a correção certa para cada caso', (t) => {
  const dir = project(t, {
    'package.json': { name: 'app', dependencies: { next: '^15.5.20' }, engines: { node: '>=20' } },
    'package-lock.json': VULNERAVEL,
    '.nvmrc': '20\n',
    '.github/workflows/ci.yml': 'jobs:\n  ci:\n    steps:\n      - uses: actions/setup-node@v4\n        with: { node-version: 20, cache: npm }\n',
  })
  const r = audit({ root: dir, runAudit: false, today: TODAY })
  assert.equal(r.verdict, 'FAIL')
  const got = ids(r)
  for (const want of ['P0 watchlist:next', 'P0 watchlist:sharp', 'P1 watchlist:postcss', 'P1 watchlist:react', 'P1 watchlist:zod', 'P1 watchlist:xlsx', 'P1 watchlist:react-router-dom', 'P2 watchlist:vitest', 'P1 node-eol:./.nvmrc', 'P1 node-eol:.github/workflows/ci.yml', 'P1 node-abaixo-do-exigido:./.nvmrc']) {
    assert.ok(got.includes(want), `faltou ${want}\n${got.join('\n')}`)
  }
  const zod = r.findings.find((f) => f.id === 'watchlist:zod')
  assert.match(zod.fix, /MAJOR — decisão do usuário/)
  assert.match(r.findings.find((f) => f.id === 'watchlist:postcss').fix, /"overrides": \{ "next": \{ "postcss": "\^8\.5\.31" \} \}/)
  assert.match(r.findings.find((f) => f.id === 'watchlist:xlsx').fix, /cdn\.sheetjs\.com/)
  assert.equal(r.findings.find((f) => f.id === 'watchlist:vitest').env, 'dev')
  assert.ok(r.inconclusive.some((i) => /não executado/.test(i)), 'sem audit fica registrado')
})

test('mesmo sistema corrigido: sem P0/P1; sem audit o veredito é INCONCLUSIVE, nunca PASS', (t) => {
  const dir = project(t, {
    'package.json': { name: 'app', engines: { node: '>=22.17' } },
    'package-lock.json': CORRIGIDO,
    '.nvmrc': '22\n',
  })
  const r = audit({ root: dir, runAudit: false, today: TODAY })
  assert.equal(r.blocking, 0, ids(r).join('\n'))
  assert.equal(r.verdict, 'INCONCLUSIVE')
})

test('lockfiles duplicados (npm + pnpm + bun.lock + bun.lockb) e pacote sem lockfile', (t) => {
  const dir = project(t, {
    'package.json': { name: 'app', packageManager: 'pnpm@10.28.0' },
    'package-lock.json': lock({}),
    'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
    'bun.lock': '{ "lockfileVersion": 1, "workspaces": { "": { "name": "app" } }, "packages": {} }',
    'bun.lockb': 'binário',
    'tools/script/package.json': { name: 'solto' },
  })
  const r = audit({ root: dir, runAudit: false, today: TODAY })
  const dup = r.findings.find((f) => f.id === 'lockfile-duplicado:.')
  assert.equal(dup.severity, 'P1')
  assert.match(dup.detail, /package-lock\.json, pnpm-lock\.yaml, bun\.lock, bun\.lockb/)
  assert.match(dup.fix, /declarado \(pnpm\)/)
  assert.match(dup.fix, /bun\.lockb é o formato binário antigo/)
  assert.equal(r.units[0].lockfile, 'pnpm-lock.yaml', 'usa o lockfile do packageManager')
  assert.ok(r.findings.some((f) => f.id === 'sem-lockfile:tools/script'))
})

test('exceção válida tira o bloqueio; vencida vira P2 e o bloqueio volta', (t) => {
  const base = {
    'package.json': { name: 'app' },
    'package-lock.json': lock({ 'node_modules/zod': { version: '3.25.76' } }),
    '.nvmrc': '24\n',
  }
  const ok = project(t, { ...base, 'docs/security/exceptions.json': { exceptions: [{ id: 'watchlist:zod', reason: 'migração para zod 4 agendada', mitigation: 'limite de 100 KB no body antes do parse', owner: 'yuri', expires: '2026-11-15' }] } })
  const r1 = audit({ root: ok, runAudit: false, today: TODAY })
  assert.equal(r1.blocking, 0)
  assert.equal(r1.findings.find((f) => f.id === 'watchlist:zod').excepted.owner, 'yuri')

  const old = project(t, { ...base, 'docs/security/exceptions.json': { exceptions: [{ id: 'watchlist:zod', reason: 'x', mitigation: 'y', owner: 'yuri', expires: '2026-09-01' }] } })
  const r2 = audit({ root: old, runAudit: false, today: TODAY })
  assert.equal(r2.blocking, 1)
  assert.ok(ids(r2).includes('P2 excecao-vencida:watchlist:zod'))
})

test('parsers de audit: npm v2, pnpm (advisories) e bun', () => {
  const npm = parseNpmAudit({ vulnerabilities: { zod: { name: 'zod', severity: 'high', isDirect: true, via: [{ title: 'Zod can exhaust memory', url: 'https://github.com/advisories/GHSA-mrhx-c7xc-m3w5', range: '<4.6.6' }], range: '<4.6.6', fixAvailable: { name: 'zod', version: '4.6.7', isSemVerMajor: true } } } })
  assert.deepEqual(npm[0].ids, ['GHSA-mrhx-c7xc-m3w5'])
  assert.equal(npm[0].fix.kind, 'major')
  const pnpm = parsePnpmAudit({ advisories: { 1: { module_name: 'esbuild', severity: 'moderate', github_advisory_id: 'GHSA-67mh-4wv8-2f99', title: 't', vulnerable_versions: '<=0.24.2', patched_versions: '>=0.25.0', findings: [{ version: '0.21.5', paths: ['.>vite>esbuild'] }] } } })
  assert.equal(pnpm[0].direct, false)
  assert.deepEqual(pnpm[0].versions, ['0.21.5'])
  const bun = parseBunAudit({ tinypool: [{ id: 1, url: 'https://github.com/advisories/GHSA-5gmw-xhrv-c9v3', title: 't', severity: 'critical', vulnerable_versions: '<1.1.1' }] })
  assert.equal(bun[0].severity, 'critical')
  assert.equal(parseNpmAudit({ error: 'x' }), null)
})

test('leitura de pnpm-lock v9, bun.lock (prod × dev) e yarn.lock', () => {
  const pnpm = readPnpmLock(`lockfileVersion: '9.0'

importers:

  .:
    dependencies:
      next:
        specifier: ^15.5.20
        version: 15.5.20(react@19.2.0)
    devDependencies:
      vitest:
        specifier: ^4.1.10
        version: 4.1.10

packages:

  '@next/env@15.5.20':
    resolution: {integrity: sha512-x}

  next@15.5.20:
    resolution: {integrity: sha512-x}
    engines: {node: ^18.18.0 || ^19.8.0 || >= 20.0.0}

  vitest@4.1.10:
    resolution: {integrity: sha512-x}

  'xlsx@https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz':
    resolution: {tarball: https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz}
    version: 0.20.3
`)
  assert.equal(pnpm.get('next')[0].version, '15.5.20')
  assert.equal(pnpm.get('next')[0].engines, '^18.18.0 || ^19.8.0 || >= 20.0.0')
  assert.equal(pnpm.get('@next/env')[0].version, '15.5.20')
  assert.equal(pnpm.get('vitest')[0].dev, true)
  assert.match(pnpm.get('xlsx')[0].source, /^https:\/\/cdn\.sheetjs\.com\//)

  const bun = readBunLock(`{
  "lockfileVersion": 1,
  "workspaces": { "": { "name": "app", "dependencies": { "next": "^15" }, "devDependencies": { "vitest": "^4" }, }, },
  "packages": {
    "next": ["next@15.5.20", "", { "dependencies": { "postcss": "8.4.31" } }, "sha512-x"],
    "postcss": ["postcss@8.4.31", "", {}, "sha512-x"],
    "vitest": ["vitest@4.1.10", "", {}, "sha512-x"],
    "xlsx": ["xlsx@https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz", {}],
  }
}`)
  assert.equal(bun.get('postcss')[0].dev, false, 'transitiva de prod')
  assert.equal(bun.get('vitest')[0].dev, true)
  assert.match(bun.get('xlsx')[0].source, /cdn\.sheetjs\.com/)

  const yarn = readYarnLock(`# yarn lockfile v1

"@babel/core@^7.26.0", "@babel/core@^7.20.0":
  version "7.26.0"
  resolved "https://registry.yarnpkg.com/@babel/core/-/core-7.26.0.tgz"

zod@^3.23.8:
  version "3.25.76"
`)
  assert.equal(yarn.get('@babel/core')[0].version, '7.26.0')
  assert.equal(yarn.get('zod')[0].version, '3.25.76')
})

// npm falso no PATH: devolve o JSON de audit conforme --omit=dev
function fakeNpm(t, full, prod) {
  const bin = mkdtempSync(join(tmpdir(), 'deps-audit-bin-'))
  t.after(() => rmSync(bin, { recursive: true, force: true }))
  writeFileSync(join(bin, 'full.json'), JSON.stringify(full))
  writeFileSync(join(bin, 'prod.json'), JSON.stringify(prod))
  const script = `#!/usr/bin/env node
const f = process.argv.includes('--omit=dev') ? 'prod.json' : 'full.json'
process.stdout.write(require('fs').readFileSync(require('path').join(${JSON.stringify(bin)}, f), 'utf8'))
process.exit(1)
`
  writeFileSync(join(bin, 'npm'), script)
  chmodSync(join(bin, 'npm'), 0o755)
  writeFileSync(join(bin, 'npm.cmd'), `@node "%~dp0npm" %*\r\n`)
  return bin
}

const vuln = (name, severity, url, extra = {}) => ({ name, severity, isDirect: true, via: [{ title: `${name} vuln`, url, range: '<9' }], range: '<9', fixAvailable: true, ...extra })

test('CLI com audit (npm falso): prod bloqueia; dev de build vira P1; dev local vira P2; exit 1', { skip: process.platform === 'win32' }, (t) => {
  const dir = project(t, { 'package.json': { name: 'app' }, 'package-lock.json': lock({ 'node_modules/left': { version: '1.0.0' } }), '.nvmrc': '24\n' })
  const full = { vulnerabilities: {
    'lib-prod': vuln('lib-prod', 'high', 'https://github.com/advisories/GHSA-aaaa-bbbb-cccc'),
    vite: vuln('vite', 'high', 'https://github.com/advisories/GHSA-dddd-eeee-ffff', { fixAvailable: { name: 'vite', version: '8.3.5', isSemVerMajor: true } }),
    vitest: vuln('vitest', 'critical', 'https://github.com/advisories/GHSA-gggg-hhhh-iiii'),
  } }
  const prod = { vulnerabilities: { 'lib-prod': full.vulnerabilities['lib-prod'] } }
  const bin = fakeNpm(t, full, prod)
  const r = spawnSync(process.execPath, [CLI, '--root', dir, '--json', '--today', TODAY], { encoding: 'utf8', env: { ...process.env, PATH: `${bin}${delimiter}${process.env.PATH}` } })
  assert.equal(r.status, 1, r.stdout + r.stderr)
  const rep = JSON.parse(r.stdout)
  const by = Object.fromEntries(rep.findings.filter((f) => f.kind === 'audit').map((f) => [f.package, f]))
  assert.equal(by['lib-prod'].severity, 'P1')
  assert.equal(by['lib-prod'].env, 'prod')
  assert.equal(by.vite.severity, 'P1', 'roda no build com segredos')
  assert.equal(by.vite.env, 'dev (build)')
  assert.match(by.vite.fix, /MAJOR — decisão do usuário/)
  assert.equal(by.vitest.severity, 'P2', 'dev local')
  assert.equal(rep.verdict, 'FAIL')
})

test('CLI sem o gerenciador instalado: INCONCLUSIVO (exit 2) e diz o que faltou', (t) => {
  const dir = project(t, { 'package.json': { name: 'app' }, 'bun.lock': '{ "lockfileVersion": 1, "workspaces": { "": {} }, "packages": {} }', '.nvmrc': '24\n' })
  const empty = mkdtempSync(join(tmpdir(), 'deps-audit-nobin-'))
  t.after(() => rmSync(empty, { recursive: true, force: true }))
  const r = spawnSync(process.execPath, [CLI, '--root', dir, '--today', TODAY], { encoding: 'utf8', env: { ...process.env, PATH: empty } })
  assert.equal(r.status, 2, r.stdout + r.stderr)
  assert.match(r.stdout, /bun não encontrado no PATH/)
  assert.match(r.stdout, /Veredito: INCONCLUSIVE/)
})

test('watchlist.json revisada há no máximo max_age_days (falha de propósito quando envelhece)', () => {
  const w = loadWatchlist()
  const age = (Date.now() - Date.parse(w.reviewed_at)) / 86_400_000
  assert.ok(age <= w.max_age_days, `watchlist revisada em ${w.reviewed_at} (${Math.round(age)} dias): confira os advisories e atualize reviewed_at`)
  for (const p of w.packages) {
    assert.ok(p.name && p.severity && p.issue && p.hint, `${p.name}: name, severity, issue e hint`)
    assert.ok(p.fixed || p.fixed_any || p.min_major || p.source_must_start, `${p.name}: precisa de uma regra`)
  }
  assert.ok(JSON.parse(readFileSync(join(ROOT, 'scripts', 'security', 'watchlist.json'), 'utf8')))
})
