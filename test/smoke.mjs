import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')

let loaded
globalThis.window = { __ModuleLoader__: { load: (entry) => { loaded = entry } } }

new Function(source)()
assert.equal(loaded?.id, 'dsh-polish')

const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
}

const styleTags = []
globalThis.document = {
  documentElement: { style: {}, dataset: {} },
  querySelector: (selector) => (selector.includes('dsh-polish') ? styleTags[0] ?? null : null),
  createElement: () => ({ dataset: {}, textContent: '', remove() { styleTags.length = 0 } }),
  head: { appendChild: (tag) => styleTags.push(tag) },
}

const modules = { react: React }
const exported = loaded.factory((id) => {
  if (modules[id] === undefined) throw new Error(`неожиданный require: ${id}`)
  return modules[id]
})

const registrations = []
const effects = []
let boundNs = ''
const ctx = {
  effect: (fn) => { effects.push(fn) },
  locale: {
    bind: (ns) => { boundNs = ns; return (key) => key },
    register: (ns, a, b) => { assert.equal(typeof (b ?? a), 'object') },
    subscribe: () => () => {},
  },
  slots: {
    inject: (name, register) => { register() },
    register: (options, component) => { registrations.push({ options, component }) },
  },
}

exported.apply(ctx)

assert.equal(exported.inject.includes('slots'), true)
assert.equal(boundNs, 'dshPolish')
assert.equal(registrations.length, 1)
assert.equal(registrations[0].options.name, 'plugins.item')
assert.equal(typeof registrations[0].component, 'function')

// effect с включённым по умолчанию оформлением ставит слой стилей
for (const fn of effects) fn()
assert.ok(styleTags.length > 0, 'слой стилей добавлен')
const css = styleTags[0].textContent
assert.match(css, /button:hover/)
assert.match(css, /focus-visible/)
assert.match(css, /color-scheme: inherit/)

// карточка рендерится без ошибок
const card = registrations[0].component({})
assert.equal(card.type, 'div')
assert.ok(card.children.length >= 3)

console.log('polish smoke: OK')
console.log('  стили:', css.split('\n').length, 'строк | карточка:', card.children.length, 'элементов')
