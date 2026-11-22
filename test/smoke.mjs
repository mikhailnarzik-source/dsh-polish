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
let registeredLocales = {}
const ctx = {
  effect: (fn) => { effects.push(fn) },
  locale: {
    bind: (ns) => { boundNs = ns; return (key) => dict[key] ?? key },
    register: (ns, bundles) => {
      assert.equal(typeof bundles, 'object')
      registeredLocales = bundles
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

/* --- Единый стиль страницы плагина -------------------------------------- */

function renderTree(node, depth = 0) {
  if (node === null || node === undefined || typeof node !== 'object') return node
  let current = node
  let guard = 0
  while (typeof current?.type === 'function' && guard < 20) {
    current = current.type(current.props ?? {})
    guard += 1
    if (current === null || current === undefined) return null
  }
  if (typeof current?.type !== 'string') return current
  current.children = (current.children ?? []).map((child) => renderTree(child, depth + 1))
  return current
}

function collect(node, predicate, found = []) {
  if (node === null || node === undefined || typeof node !== 'object') return found
  if (predicate(node)) found.push(node)
  for (const child of node.children ?? []) collect(child, predicate, found)
  return found
}

const pageTree = renderTree(inner)
const pageFrame = pageTree.props?.style ?? {}
assert.equal(pageFrame.maxWidth, 960, 'страница центрирована по maxWidth 960')
assert.equal(pageFrame.margin, '0 auto', 'страница по центру: margin auto')
assert.equal(pageFrame.padding, '24px 28px 40px', 'отступы страницы 24/28/40')
assert.notEqual(pageTree.props?.['data-dsh-polish-page'], undefined, 'страница помечена data-атрибутом')

const headers = collect(pageTree, (node) => node.props?.['data-dsh-polish-header'] === 'header')
assert.equal(headers.length, 1, 'шапка страницы одна')
const logos = collect(pageTree, (node) => node.props?.style?.width === 52)
assert.equal(logos.length, 1, 'иконка-эмодзи 52 в шапке')
assert.equal(logos[0].children?.[0], '🎨', 'в шапке эмодзи 🎨')
const headings = collect(pageTree, (node) => node.type === 'h1' && node.props?.style?.fontSize === 20)
assert.equal(headings.length, 1, 'заголовок 20px')
const chips = collect(pageTree, (node) => node.props?.['data-dsh-polish-chip'] === 'status')
assert.ok(chips.length >= 1, 'статус-чип в шапке')
const refreshButtons = collect(
  pageTree,
  (node) => node.type === 'button' && node.props?.style?.height === 32 && node.props?.['data-dsh-polish-button'] === 'refresh',
)
assert.equal(refreshButtons.length, 1, 'кнопка «Обновить» в шапке')

const cards = collect(pageTree, (node) => typeof node.props?.['data-dsh-polish-card'] === 'string')
assert.ok(cards.length >= 4, `карточки-секции отрисованы (${cards.length})`)
assert.ok(cards.every((card) => card.props?.style?.borderRadius === 14), 'у карточек радиус 14')
assert.ok(cards.every((card) => card.props?.style?.background === 'var(--dsw-alias-bg-layer-1)'), 'фон карточек — токен слоя')
const switchInput = collect(pageTree, (node) => node.type === 'input' && node.props?.type === 'checkbox')
assert.equal(switchInput.length, 1, 'переключатель оформления на месте')

const pageStyles = collect(pageTree, (node) => node.type === 'style')
const pageCss = pageStyles.map((node) => node.children?.join('') ?? '').join('\n')
assert.match(pageCss, /\[data-dsh-polish-row\]:hover/, 'hover строк списка')
assert.match(pageCss, /data-dsh-polish-button\]:disabled/, 'disabled-состояние кнопок')
assert.match(pageCss, /@media \(max-width: 900px\)/, 'адаптив под средний экран')
assert.match(pageCss, /@media \(max-width: 640px\)/, 'адаптив под узкий экран')
assert.match(pageCss, /\[data-dsh-polish-page\]\{padding:18px 16px 32px/, 'на узком экране меньше отступы')
assert.match(pageCss, /grid-template-columns:1fr !important/, 'на 900 px сетка карточек в одну колонку')
assert.match(pageCss, /\[data-dsh-polish-row\] > span\{min-width:0 !important\}/, 'на 640 px колонки строк не имеют фиксированной ширины')
assert.match(pageCss, /margin-top:auto/, 'футер карточки прижат к низу')

// Итерация 2: единые кнопки — мягкая primary-заливка, secondary 32, ширина по тексту.
const refreshStyle = refreshButtons[0].props.style
assert.equal(refreshStyle.padding, '0 14px')
assert.equal(refreshStyle.borderRadius, 10)
assert.equal(refreshStyle.whiteSpace, 'nowrap')
assert.equal(refreshStyle.boxSizing, 'border-box')
assert.equal(pageFrame.maxWidth, 960)
const secondaryButtons = collect(pageTree, (node) => node.type === 'button' && node.props?.['data-dsh-polish-button'] === 'secondary')
assert.ok(secondaryButtons.length >= 1, 'secondary-кнопки в карточках')
for (const button of secondaryButtons) {
  assert.equal(button.props.style.height, 32, 'secondary — 32 px')
  assert.equal(button.props.style.borderRadius, 10)
  assert.equal(button.props.style.padding, '0 14px')
  assert.doesNotMatch(JSON.stringify(button.props.style), /#fff/, 'нет белого текста')
}
const pageSource = await readFile(new URL('../client.js', import.meta.url), 'utf8')
assert.match(pageSource, /minmax\(min\(100%, 280px\), 1fr\)/, 'адаптивная сетка')

// сводный режим: короткая карточка, чужая страница — null
const summaryWrapper = sectionRegistration.component({
  subject: { kind: 'bundle', pkg: { name: 'dsh-polish' } },
  view: 'summary',
})
assert.equal(typeof summaryWrapper.type, 'function')
const summary = renderTree(summaryWrapper.type({ ...summaryWrapper.props, children: null }))
assert.equal(summary.props?.['data-dsh-polish-card'], 'summary', 'сводка — отдельная карточка')
assert.equal(sectionRegistration.component({ subject: { kind: 'bundle', pkg: { name: 'dsh-inbox' } } }), null)

// словари ru/en описывают одинаковый набор ключей
const ruBundle = dict
const enBundle = registeredLocales.en
assert.deepEqual(Object.keys(ruBundle).sort(), Object.keys(enBundle).sort(), 'набор ключей ru и en совпадает')
for (const key of ['reload', 'healthTitle', 'journalTitle', 'updatesTitle', 'check', 'fix', 'checking']) {
  assert.equal(typeof enBundle[key], 'string', `en: ключ ${key}`)
  assert.equal(typeof ruBundle[key], 'string', `ru: ключ ${key}`)
}

console.log('polish smoke: OK')
console.log('  стили:', css.split('\n').length, 'строк | карточка:', inner.children.length, 'элементов')
console.log('  описание:', 'свёрнуто, шеврон, localStorage:', baseKey, '|', docKey)
console.log('  документ:', 'скрыт data-detail-document, без дублей, restore очищает разметку')
console.log('  страница:', 'maxWidth 960, шапка 🎨, чип, «Обновить», карточек:', cards.length, ', адаптив')
