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

  get previousElementSibling() {
    const parent = this.parentElement
    if (parent === null) return null
    const index = parent.childNodes.indexOf(this)
    for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
      if (parent.childNodes[cursor].nodeType === 1) return parent.childNodes[cursor]
    }
    return null
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

const hasClass = (element, name) => String(element?.className ?? '').split(/\s+/).filter(Boolean).includes(name)

function matches(node, selector) {
  if (selector.includes('style[data-plugin')) return node.tagName === 'STYLE' && node.dataset.plugin === 'dsh-polish'
  if (selector === '[data-detail-document]') return node.attrs['data-detail-document'] !== undefined
  if (selector === '[data-dsh-polish-desc]') return node.attrs['data-dsh-polish-desc'] !== undefined
  if (selector === '[data-dsh-polish-doc]') return node.attrs['data-dsh-polish-doc'] !== undefined
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

// Ровно те правила из CSS, которые проверяем: тело описания и скрытый документ.
function displayOf(element) {
  if (hasClass(element, 'dsh-polish-desc-body')) {
    const parent = element.parentElement
    return parent !== null && hasClass(parent, 'is-open') ? 'block' : 'none'
  }
  if (element.attrs['data-detail-document'] !== undefined) {
    return hasClass(element, 'dsh-polish-doc-hidden') ? 'none' : 'block'
  }
  return 'block'
}

globalThis.getComputedStyle = (element) => ({
  backgroundColor: 'rgb(24, 24, 27)',
  display: displayOf(element),
})

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

/* --- Реальная разметка страницы плагина (имена классов как у хоста) ------ */
const pageRoot = new FakeElement('div')
pageRoot.className = 'V7pFBG_detailPage'

const detailMain = new FakeElement('div')
detailMain.className = 'V7pFBG_detailMain'
const titleRow = new FakeElement('div')
titleRow.className = 'V7pFBG_titleRow'
const titleElement = new FakeElement('h3')
titleElement.className = 'V7pFBG_detailTitle'
titleElement.textContent = 'dsh-polish'
titleRow.appendChild(titleElement)
detailMain.appendChild(titleRow)

const descElement = new FakeElement('p')
descElement.className = 'V7pFBG_detailDesc'
const paragraph = new FakeElement('span')
paragraph.textContent = 'Единый слой оформления для всех плагинов.'
descElement.appendChild(paragraph)
detailMain.appendChild(descElement)

const detailSections = new FakeElement('div')
detailSections.className = 'V7pFBG_detailSections'
const docSection = new FakeElement('section')
docSection.className = 'V7pFBG_section'
docSection.setAttribute('data-detail-document', 'true')
const docBody = new FakeElement('div')
docBody.textContent = 'Длинное описание из README/DETAIL.md'
docSection.appendChild(docBody)
const configSection = new FakeElement('section')
configSection.className = 'V7pFBG_detailSection'
configSection.setAttribute('data-plugin-config', 'true')
detailSections.appendChild(docSection)
detailSections.appendChild(configSection)

pageRoot.appendChild(detailMain)
pageRoot.appendChild(detailSections)
bodyElement.appendChild(pageRoot)

const registrations = []
const effects = []
let boundNs = ''
let dict = {}
const ctx = {
  effect: (fn) => { effects.push(fn) },
  locale: {
    bind: (ns) => { boundNs = ns; return (key) => dict[key] ?? key },
    register: (ns, bundles) => {
      assert.equal(typeof bundles, 'object')
      dict = bundles?.ru ?? {}
    },
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
assert.ok(registrations.length >= 1, 'есть регистрации слотов')
const sectionRegistration = registrations.find((item) => item.options.name === 'plugins.detail.section')
assert.ok(sectionRegistration !== undefined, 'секция страницы плагина зарегистрирована')
assert.equal(typeof registrations[0].component, 'function')

const cleanups = effects.map((fn) => fn())

const styleElement = headElement.firstChild
assert.ok(styleElement !== null, 'слой стилей добавлен')
const css = styleElement.textContent
assert.match(css, /button:hover/)
assert.match(css, /focus-visible/)
assert.match(css, /color-scheme: inherit/)
assert.match(css, /\.dsh-polish-desc-bar/)
assert.match(css, /\.dsh-polish-desc-bar\.is-open \.dsh-polish-desc-chevron/)
assert.match(css, /rotate\(180deg\)/)
assert.match(css, /\.dsh-polish-desc-body \{\s*display: none/)
assert.match(css, /\[class\*="detailDesc"\]\.is-open > \.dsh-polish-desc-body/)
assert.match(css, /\[data-detail-document\]\.dsh-polish-doc-hidden/)
assert.match(css, /display: none !important/)

function findChildClass(element, className) {
  for (const node of element.childNodes) {
    if (node.nodeType === 1 && hasClass(node, className)) return node
  }
  return null
}

/* --- Короткое описание: свёрнуто, шеврон, память --------------------------- */

assert.notEqual(descElement.getAttribute('data-dsh-polish-desc'), null, 'описание помечено data-атрибутом')
const descBar = findChildClass(descElement, 'dsh-polish-desc-bar')
const descBody = findChildClass(descElement, 'dsh-polish-desc-body')
assert.ok(descBar !== null, 'строка-переключатель описания добавлена')
assert.ok(descBody !== null, 'тело описания обёрнуто')
assert.equal(descElement.firstChild, descBar, 'строка стоит перед телом')
assert.equal(paragraph.parentElement, descBody, 'текст перенесён в тело')
assert.equal(descElement.classList.contains('is-open'), false, 'описание по умолчанию свёрнуто')
assert.equal(getComputedStyle(descBody).display, 'none', 'computed display тела — none')
assert.equal(descBar.getAttribute('aria-expanded'), 'false')
assert.equal(descBar.getAttribute('role'), 'button')
assert.equal(descBar.getAttribute('tabindex'), '0')
assert.equal(findChildClass(descBar, 'dsh-polish-desc-label')?.textContent, 'Описание', 'подпись из ru-словаря')
assert.match(findChildClass(descBar, 'dsh-polish-desc-chevron')?.innerHTML ?? '', /<svg/, 'шеврон — SVG')

/* --- Подробное описание (data-detail-document): скрыто, своя строка -------- */

assert.notEqual(docSection.getAttribute('data-dsh-polish-doc'), null, 'документ помечен data-атрибутом')
const docBar = docSection.previousElementSibling
assert.ok(docBar !== null, 'строка подробного описания стоит перед документом')
assert.equal(hasClass(docBar, 'dsh-polish-desc-bar'), true)
assert.notEqual(docBar.getAttribute('data-dsh-polish-doc-bar'), null)
assert.equal(hasClass(docSection, 'dsh-polish-doc-hidden'), true, 'документ скрыт классом')
assert.equal(getComputedStyle(docSection).display, 'none', 'computed display документа — none')
assert.equal(findChildClass(docBar, 'dsh-polish-desc-label')?.textContent, 'Подробное описание')
assert.equal(detailSections.childNodes.length, 3, 'секции: документ, конфиг и строка')
const docBarAtStart = docBar

/* --- Клик разворачивает оба блока, состояние пишется в localStorage -------- */

descBar.dispatch('click', { preventDefault() {}, stopPropagation() {} })
assert.equal(descElement.classList.contains('is-open'), true, 'клик разворачивает описание')
assert.equal(descBar.classList.contains('is-open'), true)
assert.equal(getComputedStyle(descBody).display, 'block', 'computed display тела — block')
assert.equal(descBar.getAttribute('aria-expanded'), 'true')

docBar.dispatch('click', { preventDefault() {}, stopPropagation() {} })
assert.equal(hasClass(docSection, 'dsh-polish-doc-hidden'), false, 'клик показывает документ')
assert.equal(docSection.classList.contains('is-open'), true)
assert.equal(docBar.classList.contains('is-open'), true)
assert.equal(getComputedStyle(docSection).display, 'block', 'computed display документа — block')

const baseKey = [...storage.keys()].find((key) => key.startsWith('dsh-polish:desc-open:') && !key.endsWith(':doc'))
const docKey = [...storage.keys()].find((key) => key.endsWith(':doc'))
assert.ok(baseKey !== undefined, 'состояние описания сохранено')
assert.equal(storage.get(baseKey), '1')
assert.ok(docKey !== undefined, 'состояние документа сохранено')
assert.equal(storage.get(docKey), '1')
assert.equal(docKey, baseKey + ':doc', 'ключ документа — ключ плагина + :doc')

/* --- Перерисовка React: без дублей, новые узлы попадают в тело ------------ */

const collapseObserver = observers.find((item) =>
  item.targets.some((entry) => entry.options?.childList === true && entry.options?.subtree === true),
)
assert.ok(collapseObserver !== undefined, 'MutationObserver подключён')

const strayText = new FakeElement('span')
strayText.textContent = 'Текст, добавленный React после обёртки.'
descElement.appendChild(strayText)

collapseObserver.callback()
await new Promise((resolve) => setTimeout(resolve, 320))

assert.equal(strayText.parentElement, descBody, 'новый узел описания попал в тело')
assert.equal(descElement.childNodes.filter((node) => hasClass(node, 'dsh-polish-desc-bar')).length, 1)
assert.equal(descElement.childNodes.filter((node) => hasClass(node, 'dsh-polish-desc-body')).length, 1)
assert.equal(docSection.previousElementSibling, docBarAtStart, 'строка документа не задублирована')
assert.equal(detailSections.childNodes.filter((node) => hasClass(node, 'dsh-polish-desc-bar')).length, 1)

/* --- Отключение оформления возвращает исходную разметку ------------------ */

assert.equal(typeof cleanups[1], 'function', 'у слоя описания есть cleanup')
cleanups[1]()
assert.equal(descElement.getAttribute('data-dsh-polish-desc'), null, 'data-атрибут описания снят')
assert.equal(findChildClass(descElement, 'dsh-polish-desc-bar'), null, 'строка описания убрана')
assert.equal(findChildClass(descElement, 'dsh-polish-desc-body'), null, 'обёртка тела убрана')
assert.equal(paragraph.parentElement, descElement, 'текст вернулся в описание')
assert.equal(docSection.getAttribute('data-dsh-polish-doc'), null, 'data-атрибут документа снят')
assert.equal(docSection.previousElementSibling, null, 'строка документа убрана')
assert.equal(hasClass(docSection, 'dsh-polish-doc-hidden'), false, 'скрывающий класс снят')
assert.equal(getComputedStyle(docSection).display, 'block', 'документ виден как был')
assert.equal(detailSections.childNodes.length, 2, 'секции не сломаны: документ и конфиг')

// карточка рендерится без ошибок
const wrapper = sectionRegistration.component({ subject: { kind: 'bundle', pkg: { name: 'dsh-polish' } } })
assert.equal(typeof wrapper.type, 'function')
const inner = wrapper.type({ ...wrapper.props, children: null })
assert.equal(inner.type, 'div')
assert.ok(inner.children.length >= 2)

console.log('polish smoke: OK')
console.log('  стили:', css.split('\n').length, 'строк | карточка:', inner.children.length, 'элементов')
console.log('  описание:', 'свёрнуто, шеврон, localStorage:', baseKey, '|', docKey)
console.log('  документ:', 'скрыт data-detail-document, без дублей, restore очищает разметку')
