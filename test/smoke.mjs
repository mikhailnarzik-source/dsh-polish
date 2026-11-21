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
assert.equal(registrations[0].options.name, 'plugins.detail.section')
assert.equal(typeof registrations[0].component, 'function')

// effect с включённым по умолчанию оформлением ставит слой стилей
for (const fn of effects) fn()
assert.ok(styleTags.length > 0, 'слой стилей добавлен')
const css = styleTags[0].textContent
assert.match(css, /button:hover/)
assert.match(css, /focus-visible/)
assert.match(css, /color-scheme: inherit/)

// карточка рендерится без ошибок
// Внешняя обёртка — свёрнутая строка; проверяем и её, и содержимое.
const wrapper = registrations[0].component({ subject: { kind: 'bundle', pkg: { name: 'dsh-polish' } } })
assert.equal(typeof wrapper.type, 'function')
const card = wrapper.children[2] === null ? wrapper : registrations[0].component({ subject: { kind: 'bundle', pkg: { name: 'dsh-polish' } } })
assert.equal(typeof wrapper, 'object')
const inner = wrapper.type({ ...wrapper.props, children: null })
assert.equal(inner.type, 'div')
assert.ok(inner.children.length >= 2)

console.log('polish smoke: OK')
console.log('  стили:', css.split('\n').length, 'строк | карточка:', inner.children.length, 'элементов')
