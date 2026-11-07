import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeClaudeMd, START, END } from './sync-global.mjs'

const body = '# Regras\n\n1. a\n2. b\n'

test('arquivo inexistente: cria só com o bloco', () => {
  const r = mergeClaudeMd(null, body)
  assert.equal(r.status, 'criado')
  assert.equal(r.text, `${START}\n# Regras\n\n1. a\n2. b\n${END}\n`)
})

test('arquivo com conteúdo próprio: acrescenta no fim e preserva o resto', () => {
  const r = mergeClaudeMd('# Minhas notas\n\nnão apagar\n', body)
  assert.equal(r.status, 'acrescentado')
  assert.ok(r.text.startsWith('# Minhas notas\n\nnão apagar\n\n' + START))
})

test('arquivo já com o texto sem marcadores (máquina antiga): só envolve', () => {
  const r = mergeClaudeMd('topo\n' + body.replace(/\n/g, '\r\n') + 'rodapé\n', body)
  assert.equal(r.status, 'marcado')
  assert.equal(r.text, `topo\n${START}\n# Regras\n\n1. a\n2. b\n${END}\nrodapé\n`)
})

test('bloco existente desatualizado: troca só o bloco', () => {
  const cur = `antes\n${START}\nvelho\n${END}\ndepois\n`
  const r = mergeClaudeMd(cur, body)
  assert.equal(r.status, 'atualizado')
  assert.equal(r.text, `antes\n${START}\n# Regras\n\n1. a\n2. b\n${END}\ndepois\n`)
})

test('bloco igual: não muda nada (idempotente)', () => {
  const once = mergeClaudeMd('x\n', body).text
  const twice = mergeClaudeMd(once, body)
  assert.equal(twice.status, 'igual')
  assert.equal(twice.text, once)
})

test('só um marcador: não escreve', () => {
  const r = mergeClaudeMd(`a\n${START}\nb\n`, body)
  assert.equal(r.status, 'marcador-quebrado')
})
