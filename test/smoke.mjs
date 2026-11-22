import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')

let loaded
globalThis.window = { __ModuleLoader__: { load: (entry) => { loaded = entry } } }

new Function(source)()
assert.equal(loaded?.id, 'dsh-polish')

/* --- Минимальный DOM, достаточный для client.js -------------------------- */

class FakeElement {
  constructor(tag) {
    this.nodeType = 1
    this.tagName = String(tag).toUpperCase()
    this.className = ''
    this.textContent = ''
    this.title = ''
    this.childNodes = []
    this.parentElement = null
    this.dataset = {}
    this.attrs = {}
    this.listeners = {}
    this.innerHTML = ''
    this.style = {}
    const self = this
    this.classList = {
      list: () => String(self.className).split(/\s+/).filter(Boolean),
      add: (...names) => {
        const list = this.classList.list()
        for (const name of names) if (!list.includes(name)) list.push(name)
        self.className = list.join(' ')
      },
      remove: (...names) => {
        self.className = this.classList.list().filter((name) => !names.includes(name)).join(' ')
      },
      contains: (name) => this.classList.list().includes(name),
    }
  }

  get firstChild() {
    return this.childNodes[0] ?? null
  }

  appendChild(node) {
    this._detach(node)
    node.parentElement = this
    this.childNodes.push(node)
    return node
  }

  insertBefore(node, reference) {
    if (reference === null || reference === undefined) return this.appendChild(node)
    const index = this.childNodes.indexOf(reference)
    if (index < 0) return this.appendChild(node)
    this._detach(node)
    node.parentElement = this
    this.childNodes.splice(index, 0, node)
    return node
  }

  _detach(node) {
    if (node?.parentElement !== null && node?.parentElement !== undefined) node.parentElement.removeChild(node)
  }

  removeChild(node) {
    const index = this.childNodes.indexOf(node)
    if (index >= 0) this.childNodes.splice(index, 1)
    node.parentElement = null
    return node
  }

  remove() {
    if (this.parentElement !== null) this.parentElement.removeChild(this)
  }

  setAttribute(name, value) {
    if (name === 'class') this.className = String(value)
    else this.attrs[name] = String(value)
  }

  getAttribute(name) {
    if (name === 'class') return this.className
    return this.attrs[name] ?? null
  }

  removeAttribute(name) {
    if (name === 'class') this.className = ''
    else delete this.attrs[name]
  }

  addEventListener(type, handler) {
    ;(this.listeners[type] ??= []).push(handler)
  }

  dispatch(type, event = {}) {
    for (const handler of this.listeners[type] ?? []) handler(event)
  }
}

function walk(node, visit) {
  visit(node)
  for (const child of node.childNodes) walk(child, visit)
}

function matches(node, selector) {
  if (selector.includes('style[data-plugin')) return node.tagName === 'STYLE' && node.dataset.plugin === 'dsh-polish'
  if (selector === '[data-dsh-polish-desc]') return node.attrs['data-dsh-polish-desc'] !== undefined
  if (selector.includes('detailTitle')) return String(node.className).includes('detailTitle')
  if (selector.includes('detailDesc')) return String(node.className).includes('detailDesc')
  return false
}

const bodyElement = new FakeElement('body')
const headElement = new FakeElement('head')
const documentElement = new FakeElement('html')

globalThis.document = {
  documentElement,
  body: bodyElement,
  head: headElement,
  createElement: (tag) => new FakeElement(tag),
  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null
  },
  querySelectorAll(selector) {
    const found = []
    for (const root of [headElement, bodyElement]) {
      walk(root, (node) => {
        if (node !== root && matches(node, selector)) found.push(node)
      })
    }
    return found
  },
}

globalThis.getComputedStyle = () => ({ backgroundColor: 'rgb(24, 24, 27)' })

const storage = new Map()
globalThis.localStorage = {
  getItem: (key) => (storage.has(key) ? storage.get(key) : null),
  setItem: (key, value) => { storage.set(key, String(value)) },
  removeItem: (key) => { storage.delete(key) },
}

const observers = []
globalThis.MutationObserver = class {
  constructor(callback) {
    this.callback = callback
    this.targets = []
    this.active = true
    observers.push(this)
  }

  observe(target, options) {
    this.targets.push({ target, options })
  }

  disconnect() {
    this.active = false
  }
}

const React = {
  createElement: (type, props, ...children) => ({ type, props, children }),
  useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  useEffect: () => {},
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

/* --- Страница плагина: заголовок, секции и описание ---------------------- */
const mainElement = new FakeElement('div')
mainElement.className = 'detailMain_c1'
const titleElement = new FakeElement('h2')
titleElement.className = 'detailTitle_c1'
titleElement.textContent = 'dsh-polish'
const sectionsElement = new FakeElement('div')
sectionsElement.className = 'detailSections_c1'
const descElement = new FakeElement('div')
descElement.className = 'detailDesc_c1'
const paragraph = new FakeElement('p')
paragraph.textContent = 'Подсветка кнопок, фокус и тема.'
descElement.appendChild(paragraph)
mainElement.appendChild(titleElement)
mainElement.appendChild(sectionsElement)
mainElement.appendChild(descElement)
bodyElement.appendChild(mainElement)

exported.apply(ctx)

assert.equal(exported.inject.includes('slots'), true)
assert.equal(boundNs, 'dshPolish')
assert.ok(registrations.length >= 1, 'есть регистрации слотов')
const sectionRegistration = registrations.find((item) => item.options.name === 'plugins.detail.section')
assert.ok(sectionRegistration !== undefined, 'секция страницы плагина зарегистрирована')
assert.equal(typeof registrations[0].component, 'function')

// Эффекты включают слой стилей и слой свёрнутого описания.
const cleanups = effects.map((fn) => fn())

const styleElement = headElement.firstChild
assert.ok(styleElement !== null, 'слой стилей добавлен')
const css = styleElement.textContent
assert.match(css, /button:hover/)
assert.match(css, /focus-visible/)
assert.match(css, /color-scheme: inherit/)
assert.match(css, /\.dsh-polish-desc-bar/)
assert.match(css, /\.dsh-polish-desc-body/)
assert.match(css, /margin-left: auto/)
assert.match(css, /rotate\(180deg\)/)
assert.match(css, /display: none/)
assert.match(css, /\.is-open > \.dsh-polish-desc-body/)

/* --- Описание свёрнуто и размечено --------------------------------------- */

function findChildClass(element, className) {
  for (const node of element.childNodes) {
    if (node.nodeType === 1 && String(node.className).split(/\s+/).includes(className)) return node
  }
  return null
}

assert.notEqual(descElement.getAttribute('data-dsh-polish-desc'), null, 'описание помечено data-атрибутом')
const bar = findChildClass(descElement, 'dsh-polish-desc-bar')
const body = findChildClass(descElement, 'dsh-polish-desc-body')
assert.ok(bar !== null, 'строка-переключатель добавлена')
assert.ok(body !== null, 'тело описания обёрнуто')
assert.equal(descElement.firstChild, bar, 'строка стоит перед телом')
assert.equal(paragraph.parentElement, body, 'текст перенесён в тело')
assert.equal(descElement.classList.contains('is-open'), false, 'по умолчанию свёрнуто')
assert.equal(bar.getAttribute('aria-expanded'), 'false')
assert.equal(bar.getAttribute('role'), 'button')
assert.equal(bar.getAttribute('tabindex'), '0')
const label = findChildClass(bar, 'dsh-polish-desc-label')
const chevron = findChildClass(bar, 'dsh-polish-desc-chevron')
assert.equal(label?.textContent, 'desc', 'подпись берётся из словаря')
assert.match(chevron?.innerHTML ?? '', /<svg/, 'шеврон — SVG')

/* --- Клик разворачивает и запоминает состояние --------------------------- */

bar.dispatch('click', { preventDefault() {}, stopPropagation() {} })
assert.equal(descElement.classList.contains('is-open'), true, 'клик разворачивает')
assert.equal(bar.getAttribute('aria-expanded'), 'true')
const savedKey = [...storage.keys()].find((key) => key.startsWith('dsh-polish:desc-open:'))
assert.ok(savedKey !== undefined, 'состояние сохранено в localStorage')
assert.equal(storage.get(savedKey), '1')

/* --- Перерисовка React: без дублей, новое описание с тем же состоянием --- */

const collapseObserver = observers.find((item) =>
  item.targets.some((entry) => entry.options?.childList === true && entry.options?.subtree === true),
)
assert.ok(collapseObserver !== undefined, 'MutationObserver за перерисовками подключён')

// React добавил ещё один абзац мимо обёртки — он должен попасть в тело.
const moved = new FakeElement('p')
moved.textContent = 'Новый абзац после перерисовки.'
descElement.appendChild(moved)

// Новая страница плагина с тем же заголовком — состояние должно вспомниться.
const secondDesc = new FakeElement('div')
secondDesc.className = 'detailDesc_c2'
const secondParagraph = new FakeElement('p')
secondParagraph.textContent = 'Второе описание.'
secondDesc.appendChild(secondParagraph)
mainElement.appendChild(secondDesc)

collapseObserver.callback()
await new Promise((resolve) => setTimeout(resolve, 320))

assert.equal(moved.parentElement, body, 'новый узел React попал в тело')
assert.equal(findChildClass(descElement, 'dsh-polish-desc-bar'), bar, 'строка не задублирована')
assert.equal(descElement.childNodes.filter((node) => String(node.className).includes('dsh-polish-desc-bar')).length, 1)
assert.equal(secondDesc.classList.contains('is-open'), true, 'развёрнутое состояние вспомнилось')
assert.equal(findChildClass(secondDesc, 'dsh-polish-desc-body') !== null, true)
assert.equal(secondParagraph.parentElement, findChildClass(secondDesc, 'dsh-polish-desc-body'))

/* --- Повторный клик сворачивает ------------------------------------------ */

bar.dispatch('click', { preventDefault() {}, stopPropagation() {} })
assert.equal(descElement.classList.contains('is-open'), false, 'повторный клик сворачивает')
assert.equal(bar.getAttribute('aria-expanded'), 'false')
assert.equal(storage.get(savedKey), '0')

// карточка рендерится без ошибок
// Внешняя обёртка — свёрнутая строка; проверяем и её, и содержимое.
const wrapper = sectionRegistration.component({ subject: { kind: 'bundle', pkg: { name: 'dsh-polish' } } })
assert.equal(typeof wrapper.type, 'function')
assert.equal(typeof wrapper, 'object')
const inner = wrapper.type({ ...wrapper.props, children: null })
assert.equal(inner.type, 'div')
assert.ok(inner.children.length >= 2)

/* --- Выключение оформления возвращает исходную разметку ------------------ */

assert.equal(typeof cleanups[1], 'function', 'у слоя описания есть cleanup')
cleanups[1]()
assert.equal(descElement.getAttribute('data-dsh-polish-desc'), null, 'data-атрибут снят')
assert.equal(findChildClass(descElement, 'dsh-polish-desc-bar'), null, 'строка убрана')
assert.equal(findChildClass(descElement, 'dsh-polish-desc-body'), null, 'обёртка убрана')
assert.equal(paragraph.parentElement, descElement, 'текст вернулся в описание')

console.log('polish smoke: OK')
console.log('  стили:', css.split('\n').length, 'строк | карточка:', inner.children.length, 'элементов')
console.log('  описание:', 'свёрнуто, шеврон, память в localStorage, без дублей при перерисовке')
