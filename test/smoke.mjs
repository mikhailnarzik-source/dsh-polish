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

  querySelectorAll(selector) {
    const found = []
    walk(this, (node) => {
      if (node !== this && matches(node, selector)) found.push(node)
    })
    return found
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
  if (selector === 'nav') return node.tagName === 'NAV'
  if (selector === 'button') return node.tagName === 'BUTTON'
  if (selector === 'svg') return node.tagName === 'SVG'
  if (selector === 'nav button') return node.tagName === 'BUTTON' && hasAncestorTag(node, 'NAV')
  if (selector === '[data-dsh-panel-emoji]') return node.attrs['data-dsh-panel-emoji'] !== undefined
  if (selector === '[data-detail-document]') return node.attrs['data-detail-document'] !== undefined
  if (selector === '[data-dsh-polish-desc]') return node.attrs['data-dsh-polish-desc'] !== undefined
  if (selector === '[data-dsh-polish-doc]') return node.attrs['data-dsh-polish-doc'] !== undefined
  if (selector.includes('detailTitle')) return String(node.className).includes('detailTitle')
  if (selector.includes('detailDesc')) return String(node.className).includes('detailDesc')
  return false
}

function hasAncestorTag(node, tag) {
  let current = node?.parentElement
  while (current !== null && current !== undefined) {
    if (current.tagName === tag) return true
    current = current.parentElement
  }
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
  // Эффект выполняется сразу: тесты проверяют монтирование ShortcutPage без
  // настоящего React-планировщика.
  useEffect: (fn) => {
    const cleanup = fn()
    return typeof cleanup === 'function' ? cleanup : undefined
  },
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

/* --- Левая панель: строки с одноцветными SVG, как в реальном DSH ---------- */
// Хост рисует строку как button.panelRow[aria-label] > span.panelGlyph > svg.
const navElement = new FakeElement('nav')
bodyElement.appendChild(navElement)
const panelRows = []

function makePanelRow(label, options = {}) {
  const button = new FakeElement('button')
  button.setAttribute('type', 'button')
  button.setAttribute('aria-label', label)
  let glyph = null
  if (options.noGlyph !== true) {
    glyph = new FakeElement('span')
    glyph.className = 'wtg9ga_panelGlyph'
    glyph.setAttribute('aria-hidden', 'true')
    if (typeof options.emoji === 'string') {
      const emoji = new FakeElement('span')
      emoji.textContent = options.emoji
      glyph.appendChild(emoji)
    }
    if (options.emoji === undefined && options.svg !== false) glyph.appendChild(new FakeElement('svg'))
    button.appendChild(glyph)
  }
  navElement.appendChild(button)
  panelRows.push({ button, glyph, label })
  return button
}

// Карта меток ru/en: каждая кнопка должна получить свой эмодзи.
const PANEL_EMOJI_CASES = [
  ['Плагины', '🧩'],
  ['Plugins', '🧩'],
  ['Календарь', '📅'],
  ['Calendar', '📅'],
  ['Расходы', '💰'],
  ['Expenses', '💰'],
  ['Синхронизация сессий', '🔄'],
  ['Session sync', '🔄'],
  ['Задачи автоматизации', '⏰'],
  ['Automation tasks', '⏰'],
  ['Карточки', '🧩'],
  ['Cards', '🧩'],
  ['Сжатие диалога', '🗜️'],
  ['Dialog compaction', '🗜️'],
  ['Ревью изменений', '🔍'],
  ['Changes review', '🔍'],
  ['Уведомления', '🔔'],
  ['Notifications', '🔔'],
  ['Команда', '👥'],
  ['Team', '👥'],
  ['Сейф', '🔑'],
  ['Vault', '🔑'],
  ['Pyrus: мои задачи', '📋'],
  ['Pyrus: my tasks', '📋'],
  ['Входящие', '📥'],
  ['Inbox', '📥'],
  ['Оформление интерфейса', '🎨'],
  ['Appearance', '🎨'],
  ['Кит-помощник', '🐳'],
  ['Whale Companion', '🐳'],
  ['Запуск браузера', '🌐'],
  ['Browser', '🌐'],
]
const panelEmojiButtons = PANEL_EMOJI_CASES.map(([label]) => makePanelRow(label))
// Кнопки, которые трогать нельзя: чужая метка, уже эмодзи, нет глифа, нет svg.
const untouchedForeign = makePanelRow('Ещё')
const untouchedEmoji = makePanelRow('Карточки', { emoji: '🧩' })
const untouchedNoGlyph = makePanelRow('Плагины', { noGlyph: true })
const untouchedNoSvg = makePanelRow('Плагины', { svg: false })
// Метка с другим регистром и неразрывным пробелом — нормализуется и помечается.
const panelCaseButton = makePanelRow('  ПЛАГИНЫ  ')
const panelNbspButton = makePanelRow('Синхронизация\u00a0сессий')
// Текст внутри SVG (title) не должен мешать считать иконку одноцветной.
const panelSvgTitleButton = makePanelRow('Команда')
const panelSvgTitleSvg = panelSvgTitleButton.querySelectorAll('svg')[0]
const panelSvgTitleNode = new FakeElement('title')
panelSvgTitleNode.textContent = 'Команда'
panelSvgTitleSvg.appendChild(panelSvgTitleNode)

const registrations = []
const effects = []
const selections = []
const openBundleCalls = []
const pluginNavigation = {
  openList: () => {},
  openBundle: (packageName) => { openBundleCalls.push(packageName) },
}
// «Сервисы» хоста: в fallback-тесте pluginNavigation убираем.
const services = { pluginNavigation }
let boundNs = ''
let dict = {}
let registeredLocales = {}
const ctx = {
  effect: (fn) => { effects.push(fn) },
  get: (name) => services[name],
  layout: {
    selectPanel: (id) => { selections.push(id) },
  },
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
    inject: (name, register) => {
      const dispose = register()
      return () => {
        if (typeof dispose === 'function') dispose()
      }
    },
    register: (options, component) => {
      const record = { options, component }
      registrations.push(record)
      return () => {
        const index = registrations.indexOf(record)
        if (index >= 0) registrations.splice(index, 1)
      }
    },
  },
}

exported.apply(ctx)

assert.equal(exported.inject.includes('slots'), true)
assert.equal(boundNs, 'dshPolish')
assert.ok(registrations.length >= 1, 'есть регистрации слотов')
const sectionRegistration = registrations.find((item) => item.options.name === 'plugins.detail.section')
assert.ok(sectionRegistration !== undefined, 'секция страницы плагина зарегистрирована')
assert.equal(typeof registrations[0].component, 'function')
// По умолчанию все панели видны и закреплены: состояние не пишется до первого
// изменения, а панели регистрируются сразу.
const PANEL_VISIBILITY_KEY = 'dsh-polish:panel-visibility'
assert.equal(storage.has(PANEL_VISIBILITY_KEY), false, 'состояние по умолчанию не пишется в localStorage')

/* --- Меню «Ещё»: видимые-но-не-закреплённые панели ----------------------- */

const panelActionsRegistration = registrations.find((item) => item.options.name === 'sidebar.panellist.actions')
assert.ok(panelActionsRegistration !== undefined, 'слот sidebar.panellist.actions зарегистрирован')
assert.equal(panelActionsRegistration.options.id, 'dsh-polish-panellist-actions')
assert.equal(typeof panelActionsRegistration.component, 'function')

// По умолчанию все одиннадцать панелей закреплены: закреплять нечего.
const emptyMenu = panelActionsRegistration.component({
  entries: [],
  onPinnedChange() { throw new Error('закреплять нечего') },
  onDismiss() {},
})
assert.notEqual(emptyMenu, null, 'подсказка вместо пустого меню')
assert.equal(emptyMenu.props['data-dsh-polish-panellist-actions'], 'list')
assert.equal(emptyMenu.children[0].props['data-dsh-polish-panellist-title'], 'unpinned', 'заголовок списка')
assert.match(JSON.stringify(emptyMenu.children[0]), /Откреплённые панели/, 'подпись «Откреплённые панели»')
assert.match(JSON.stringify(emptyMenu), /Все панели уже в левом меню/, 'подсказка, когда закреплять нечего')
assert.equal(
  emptyMenu.children.some((node) => node?.props?.['data-dsh-polish-pin-all'] !== undefined),
  false,
  'кнопки «Закрепить все» нет, когда закреплять нечего',
)

// Хост передаёт откреплённые панели (в том числе чужие): рисуем их строки.
const pinnedCalls = []
let dismissCalls = 0
const menuTree = panelActionsRegistration.component({
  entries: [
    { id: 'plugin-cards', label: 'Карточки', pinned: false },
    { id: 'plugin-review', label: 'Ревью изменений', pinned: true },
    { id: 'calendar', label: 'Календарь', pinned: false },
  ],
  onOpen() {},
  onPinnedChange: (id, value) => { pinnedCalls.push([id, value]) },
  onDismiss: () => { dismissCalls += 1 },
})
assert.equal(menuTree.type, 'div', 'список в обёртке')
const unpinnedRows = menuTree.children.filter((node) => node?.props?.['data-dsh-polish-pinnable'] !== undefined)
assert.deepEqual(
  unpinnedRows.map((row) => row.props['data-dsh-polish-pinnable']),
  ['plugin-cards', 'calendar'],
  'в списке только откреплённые панели; закреплённая не дублируется',
)
const firstPin = unpinnedRows[0].children[1]
assert.equal(firstPin.type, 'button')
assert.equal(firstPin.props['data-dsh-polish-button'], 'pin', 'кнопка строки — pin')
assert.equal(firstPin.props.style.height, 32, 'кнопка строки 32 px')
assert.equal(firstPin.props.style.borderRadius, 10, 'радиус 10')
assert.equal(firstPin.props.style.whiteSpace, 'nowrap', 'ширина по тексту')
assert.match(JSON.stringify(firstPin.children), /📌/, 'иконка булавки')
assert.match(JSON.stringify(firstPin.children), /Закрепить/, 'подпись «Закрепить»')
assert.match(String(firstPin.props.title), /Закрепить «Карточки»/, 'подсказка с названием панели')
firstPin.props.onClick()
assert.deepEqual(pinnedCalls, [['plugin-cards', true]], 'onPinnedChange(id, true)')
assert.equal(dismissCalls, 1, 'меню закрывается после закрепления')

const pinAllButton = menuTree.children.find((node) => node?.props?.['data-dsh-polish-pin-all'] === 'button')
assert.ok(pinAllButton !== undefined, 'кнопка «Закрепить все панели» есть')
assert.equal(pinAllButton.type, 'button')
assert.equal(pinAllButton.props['data-dsh-polish-button'], 'primary', 'primary-кнопка')
assert.equal(pinAllButton.props.style.height, 36, 'высота 36')
assert.equal(pinAllButton.props.style.borderRadius, 10, 'радиус 10')
assert.equal(pinAllButton.props.style.padding, '0 14px', 'padding 0 14')
assert.equal(pinAllButton.props.style.whiteSpace, 'nowrap', 'ширина по тексту')
assert.match(JSON.stringify(pinAllButton.children), /Закрепить все панели \(2\)/, 'счётчик — число строк списка')
assert.doesNotMatch(JSON.stringify(pinAllButton.props.style), /#fff/, 'нет белого текста')
pinnedCalls.length = 0
dismissCalls = 0
pinAllButton.props.onClick()
assert.deepEqual(
  pinnedCalls,
  [['plugin-cards', true], ['calendar', true]],
  'закрепляет каждую строку списка',
)
assert.equal(dismissCalls, 1, 'меню закрывается один раз')

/* --- 11 плагинов-панелей: main + sidebar.panellist с одинаковыми ключами --- */

const SHORTCUT_IDS = [
  'cards', 'compact', 'review', 'notify', 'team', 'vault', 'pyrus', 'inbox', 'polish', 'whale', 'browser',
]
const SHORTCUT_EMOJI = {
  cards: '🧩',
  compact: '🗜️',
  review: '📝',
  notify: '🔔',
  team: '👥',
  vault: '🔑',
  pyrus: '📋',
  inbox: '📥',
  polish: '🎨',
  whale: '🐳',
  browser: '🌐',
}
const expectedIds = SHORTCUT_IDS.map((id) => `plugin-${id}`)
const mainRegs = registrations.filter((item) => item.options.name === 'main')
const sidebarRegs = registrations.filter((item) => item.options.name === 'sidebar.panellist')
assert.equal(mainRegs.length, 11, '11 main-панелей')
assert.equal(sidebarRegs.length, 11, '11 строк левой панели')
assert.deepEqual(mainRegs.map((item) => item.options.key), expectedIds, 'ключи main-панелей plugin-<id>')
assert.deepEqual(sidebarRegs.map((item) => item.options.id), expectedIds, 'id строк plugin-<id>')
assert.deepEqual(
  mainRegs.map((item) => item.options.key),
  sidebarRegs.map((item) => item.options.id),
  'ключ main-панели и id строки совпадают',
)
assert.equal(new Set(expectedIds).size, 11, 'id уникальны')
for (const [index, registration] of sidebarRegs.entries()) {
  assert.equal(typeof registration.options.label, 'function', 'подпись строки — функция')
  assert.equal(registration.options.locale, 'dshPolish', 'строка в словаре плагина')
  assert.equal(registration.options.order, 20 + index, 'порядок строк 20+i')
  assert.equal(typeof registration.component, 'function', 'иконка строки — компонент')
  const icon = registration.component({ size: 16, active: false })
  assert.equal(icon.type, 'span', 'иконка — span с эмодзи')
  assert.equal(icon.props['data-dsh-polish-icon'], SHORTCUT_IDS[index])
  assert.equal(icon.props.style.width, 16)
  assert.equal(icon.children[0], SHORTCUT_EMOJI[SHORTCUT_IDS[index]], 'эмодзи плагина')
  assert.equal(registration.options.label(), dict[`shortcut.${SHORTCUT_IDS[index]}.title`], 'подпись из словаря')
}

/* --- ShortcutPage: сразу открывает настоящие настройки плагина ----------- */

const SHORTCUT_PACKAGES = {
  cards: 'dsh-cards',
  compact: 'dsh-compact',
  review: 'dsh-review',
  notify: 'dsh-notify',
  team: 'dsh-team',
  vault: 'dsh-vault',
  pyrus: 'dsh-pyrus',
  inbox: 'dsh-inbox',
  polish: 'dsh-polish',
  whale: 'dsh-plugin-whale-pet',
  browser: 'dsh-browser-launcher',
}

openBundleCalls.length = 0
for (const [index, id] of SHORTCUT_IDS.entries()) {
  const pageTreeOne = renderTree(mainRegs[index].component({}))
  assert.equal(pageTreeOne.props?.['data-dsh-polish-page'], 'page', `${id}: страница помечена data-атрибутом`)
  assert.equal(pageTreeOne.props?.['data-dsh-polish-shortcut'], id, `${id}: id плагина в разметке`)
  assert.equal(pageTreeOne.props?.['data-dsh-polish-opening'], id, `${id}: страница в состоянии «открываю настройки»`)
  assert.equal(pageTreeOne.props?.style?.maxWidth, 960, `${id}: центрированная страница 960`)
  const pageJsonOne = JSON.stringify(pageTreeOne)
  assert.match(pageJsonOne, new RegExp(SHORTCUT_EMOJI[id].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `${id}: эмодзи в шапке`)
  assert.match(pageJsonOne, new RegExp(dict[`shortcut.${id}.title`]), `${id}: название плагина`)
  assert.match(pageJsonOne, /Открываю настройки плагина/, `${id}: подпись «Открываю настройки плагина…»`)
  assert.equal(
    collect(pageTreeOne, (node) => node.props?.['data-dsh-polish-open-settings'] !== undefined).length,
    0,
    `${id}: кнопки-заглушки нет, когда сервис есть`,
  )
}
assert.equal(openBundleCalls.length, SHORTCUT_IDS.length, 'openBundle вызван один раз на страницу')
assert.deepEqual(
  openBundleCalls,
  SHORTCUT_IDS.map((id) => SHORTCUT_PACKAGES[id]),
  'openBundle получает packageName каждого плагина',
)
assert.deepEqual(selections, [], 'страница не трогает layout, когда сервис доступен')

// Fallback: сервиса pluginNavigation нет — остаётся страница с кнопкой.
services.pluginNavigation = undefined
openBundleCalls.length = 0
const fallbackTree = renderTree(mainRegs[0].component({}))
assert.equal(fallbackTree.props?.['data-dsh-polish-opening'], undefined, 'без сервиса нет «открываю настройки»')
assert.equal(openBundleCalls.length, 0, 'без сервиса openBundle не вызывается')
const fallbackJson = JSON.stringify(fallbackTree)
assert.match(fallbackJson, /О плагине/, 'карточка «О плагине» на месте')
assert.match(fallbackJson, /меню «Ещё»/, 'подсказка про меню «Ещё» на месте')
const openSettingsButton = collect(fallbackTree, (node) => node.props?.['data-dsh-polish-open-settings'] === 'cards')[0]
assert.ok(openSettingsButton !== undefined, 'кнопка «Открыть настройки плагина» в fallback')
assert.equal(openSettingsButton.type, 'button')
assert.equal(openSettingsButton.props.style.height, 36, 'primary 36 px')
assert.equal(openSettingsButton.props.style.padding, '0 14px')
assert.match(JSON.stringify(openSettingsButton.children), /Открыть настройки плагина/)
assert.doesNotMatch(JSON.stringify(openSettingsButton.props.style), /#fff/, 'нет белого текста')
selections.length = 0
openSettingsButton.props.onClick()
assert.deepEqual(selections, ['plugins'], 'selectPanel("plugins") из main-панели в fallback')
services.pluginNavigation = pluginNavigation

const cleanups = effects.map((fn) => fn())

const styleElement = headElement.firstChild
assert.ok(styleElement !== null, 'слой стилей добавлен')
const css = styleElement.textContent
assert.match(css, /button:hover/)
assert.match(css, /focus-visible/)
assert.match(css, /color-scheme: inherit/)
assert.match(css, /\[data-dsh-polish-button='pin'\]:hover/, 'подсветка кнопок «Закрепить» в меню «Ещё»')
assert.match(css, /\.dsh-polish-desc-bar/)
assert.match(css, /\.dsh-polish-desc-bar\.is-open \.dsh-polish-desc-chevron/)
assert.match(css, /rotate\(180deg\)/)
assert.match(css, /\.dsh-polish-desc-body \{\s*display: none/)
assert.match(css, /\[class\*="detailDesc"\]\.is-open > \.dsh-polish-desc-body/)
assert.match(css, /\[data-detail-document\]\.dsh-polish-doc-hidden/)
assert.match(css, /display: none !important/)

// Цветные эмодзи-иконки левой панели: скрыть svg, показать ::before из атрибута.
assert.match(css, /nav button\[data-dsh-panel-emoji\] \[class\*="panelGlyph"\] svg/, 'правило скрывает svg у помеченной панели')
assert.match(css, /content: attr\(data-dsh-panel-emoji\)/, '::before берёт эмодзи из data-атрибута')
assert.match(
  css,
  /font-family: "Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif/,
  'цветной эмодзи-шрифт',
)
assert.match(css, /font-size: 17px/, 'эмодзи 17 px в раскрытой панели')
assert.match(css, /\[class\*="collapsed"\] nav button\[data-dsh-panel-emoji\]/, 'правило для свёрнутой панели')
assert.match(css, /font-size: 18px/, 'эмодзи 18 px в свёрнутой панели')

/* --- Глобальное выравнивание длинных абзацев ----------------------------- */

const justifyMatch = css.match(/:is\([^{}]*\):not\([^{}]*\)\s*\{[^}]*\}/)
assert.ok(justifyMatch !== null, 'правило выравнивания по ширине добавлено')
const justifyRule = justifyMatch[0]
const justifySelector = justifyRule.slice(0, justifyRule.indexOf('{'))
assert.match(justifySelector, /\[class\*="message"\] p/, 'абзацы чата')
assert.match(justifySelector, /\[class\*="markdown"\] p/, 'markdown-абзацы')
assert.match(justifySelector, /\[class\*="detailDesc"\] p/, 'описание плагина')
assert.match(justifySelector, /\[class\*="DETAIL"\] p/, 'подробное описание')
assert.match(justifySelector, /\[data-detail-document\] p/, 'документ плагина')
assert.match(justifyRule, /text-align:\s*justify/, 'text-align: justify')
assert.match(justifyRule, /hyphens:\s*auto/, 'hyphens: auto')
assert.match(justifyRule, /text-justify:\s*inter-word/, 'text-justify: inter-word')
for (const exclusion of ['pre', 'code', 'table', 'td', 'th', 'li']) {
  assert.match(justifySelector, new RegExp(`:not\\(${exclusion} p\\)`), `исключение ${exclusion}`)
}
// Правило нацелено только на абзацы: теги pre/code/table/li не селекторы.
assert.doesNotMatch(justifySelector, /(^|,)\s*(pre|code|table|ul|ol|li|td|th)\s*(,|$)/, 'код, таблицы и списки не таргетируются')

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

/* --- Цветные эмодзи во всей левой панели -------------------------------- */

const PANEL_EMOJI_ATTR = 'data-dsh-panel-emoji'
assert.equal(panelEmojiButtons.length, PANEL_EMOJI_CASES.length)
for (const [index, [label, emoji]] of PANEL_EMOJI_CASES.entries()) {
  const row = panelRows[index]
  assert.equal(row.button.getAttribute('aria-label'), label, `${label}: aria-label не тронут`)
  assert.equal(row.button.getAttribute(PANEL_EMOJI_ATTR), emoji, `${label}: эмодзи на кнопке`)
  assert.equal(row.glyph.getAttribute(PANEL_EMOJI_ATTR), emoji, `${label}: атрибут для ::before на глифе`)
  assert.ok(
    row.glyph.childNodes.some((node) => node.tagName === 'SVG'),
    `${label}: svg остаётся в DOM, его скрывает CSS`,
  )
}
assert.equal(panelCaseButton.getAttribute(PANEL_EMOJI_ATTR), '🧩', 'регистр и пробелы нормализуются')
assert.equal(panelNbspButton.getAttribute(PANEL_EMOJI_ATTR), '🔄', 'неразрывный пробел нормализуется')
assert.equal(panelSvgTitleButton.getAttribute(PANEL_EMOJI_ATTR), '👥', 'title внутри svg не мешает замене')
assert.equal(untouchedForeign.getAttribute(PANEL_EMOJI_ATTR), null, 'метка не из карты — не трогаем')
assert.equal(untouchedEmoji.getAttribute(PANEL_EMOJI_ATTR), null, 'внутри уже эмодзи-компонент — не трогаем')
assert.equal(untouchedNoGlyph.getAttribute(PANEL_EMOJI_ATTR), null, 'нет span.panelGlyph — не трогаем')
assert.equal(untouchedNoSvg.getAttribute(PANEL_EMOJI_ATTR), null, 'в глифе нет svg — не трогаем')

// Observer следит именно за nav, а не за всем документом.
const panelObserver = observers.find((item) =>
  item.targets.some((entry) => entry.target === navElement),
)
assert.ok(panelObserver !== undefined, 'MutationObserver подключён к левой панели')
assert.ok(
  panelObserver.targets.some(
    (entry) =>
      entry.options?.childList === true &&
      entry.options?.subtree === true &&
      entry.options?.attributeFilter?.includes('aria-label'),
  ),
  'observer видит перерисовки и смену aria-label',
)

// Перерисовка любой панели: новая кнопка помечается по колбэку observer.
const addedButton = makePanelRow('Календарь')
panelObserver.callback()
assert.equal(addedButton.getAttribute(PANEL_EMOJI_ATTR), '📅', 'новая кнопка после перерисовки')

// Смена языка: эмодзи остаётся, а чужая метка снимает атрибут.
const pluginsRow = panelRows[0]
pluginsRow.button.setAttribute('aria-label', 'Plugins')
panelObserver.callback()
assert.equal(pluginsRow.button.getAttribute(PANEL_EMOJI_ATTR), '🧩', 'en-метка после смены языка')
pluginsRow.button.setAttribute('aria-label', 'Неизвестная панель')
panelObserver.callback()
assert.equal(pluginsRow.button.getAttribute(PANEL_EMOJI_ATTR), null, 'неизвестная метка снимает атрибут')
assert.equal(pluginsRow.glyph.getAttribute(PANEL_EMOJI_ATTR), null, 'атрибут глифа тоже снят')
pluginsRow.button.setAttribute('aria-label', 'Плагины')
panelObserver.callback()
assert.equal(pluginsRow.button.getAttribute(PANEL_EMOJI_ATTR), '🧩', 'возврат ru-метки')

// React пересоздал svg-глиф: атрибут для ::before ставится на новый узел.
const expensesRow = panelRows[4]
const newGlyph = new FakeElement('span')
newGlyph.className = 'wtg9ga_panelGlyph'
newGlyph.setAttribute('aria-hidden', 'true')
newGlyph.appendChild(new FakeElement('svg'))
expensesRow.button.removeChild(expensesRow.glyph)
expensesRow.button.appendChild(newGlyph)
expensesRow.glyph = newGlyph
panelObserver.callback()
assert.equal(newGlyph.getAttribute(PANEL_EMOJI_ATTR), '💰', 'новый глиф получает эмодзи-атрибут')
assert.equal(newGlyph.childNodes.length, 1, 'svg не удаляется из DOM')

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

/* --- Выключение оформления снимает эмодзи-иконки ------------------------ */

const panelEmojiCleanup = cleanups[3]
assert.equal(typeof panelEmojiCleanup, 'function', 'у эмодзи-эффекта есть cleanup')
panelEmojiCleanup()
assert.equal(panelObserver.active, false, 'MutationObserver левой панели отключён')
for (const row of panelRows) {
  assert.equal(row.button.getAttribute(PANEL_EMOJI_ATTR), null, 'атрибут кнопки снят')
  assert.equal(typeof row.button.getAttribute('aria-label'), 'string', 'aria-label не тронут')
}
for (const row of panelRows) {
  if (row.glyph !== null) assert.equal(row.glyph.getAttribute(PANEL_EMOJI_ATTR), null, 'атрибут глифа снят')
}

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
assert.ok(cards.length >= 5, `карточки-секции отрисованы (${cards.length})`)
assert.ok(cards.every((card) => card.props?.style?.borderRadius === 14), 'у карточек радиус 14')
assert.ok(cards.every((card) => card.props?.style?.background === 'var(--dsw-alias-bg-layer-1)'), 'фон карточек — токен слоя')

// Карточка «Панели в левом меню»: список 11 плагинов с переключателем.
const panelsCards = cards.filter((card) => card.props?.['data-dsh-polish-card'] === 'panels')
assert.equal(panelsCards.length, 1, 'блок «Панели в левом меню» на странице')
const panelsCardJson = JSON.stringify(panelsCards[0])
assert.match(panelsCardJson, /Панели в левом меню/, 'заголовок блока')
assert.match(panelsCardJson, /Открепили панель\? Она осталась в меню «Ещё»/, 'подсказка про меню «Ещё»')
assert.match(panelsCardJson, /Показывать в левом меню/, 'подпись переключателя строки')
assert.match(panelsCardJson, /включено: 11 из 11/, 'счётчик включённых панелей')
assert.match(panelsCardJson, /Выключите переключатель/, 'подсказка про выключение')
const settingsPanelRows = collect(pageTree, (node) => node.props?.['data-dsh-polish-panel-row'] !== undefined)
assert.equal(settingsPanelRows.length, 11, 'в карточке 11 строк плагинов')
assert.deepEqual(
  settingsPanelRows.map((row) => row.props['data-dsh-polish-panel-row']),
  SHORTCUT_IDS,
  'порядок строк — порядок панелей',
)
const panelToggles = collect(
  pageTree,
  (node) => node.type === 'input' && node.props?.['data-dsh-polish-panel-toggle'] !== undefined,
)
assert.equal(panelToggles.length, 11, 'у каждой строки свой переключатель')
for (const toggle of panelToggles) {
  assert.equal(toggle.props.type, 'checkbox', 'переключатель — флажок')
  assert.equal(toggle.props.checked, true, 'по умолчанию панель включена')
  assert.match(String(toggle.props['aria-label']), /Показывать в левом меню/, 'подпись доступности')
}
const switchInput = collect(
  pageTree,
  (node) =>
    node.type === 'input' &&
    node.props?.type === 'checkbox' &&
    node.props?.['data-dsh-polish-panel-toggle'] === undefined,
)
assert.equal(switchInput.length, 1, 'переключатель оформления на месте')

/* --- Динамическая видимость панелей и localStorage ----------------------- */

const toggleById = new Map(panelToggles.map((node) => [node.props['data-dsh-polish-panel-toggle'], node]))
const countPanelRegs = (panelId) =>
  registrations.filter(
    (item) =>
      (item.options.name === 'main' && item.options.key === panelId) ||
      (item.options.name === 'sidebar.panellist' && item.options.id === panelId),
  ).length
const readPanelStorage = () => JSON.parse(storage.get(PANEL_VISIBILITY_KEY))
assert.equal(countPanelRegs('plugin-cards'), 2, 'старт: main + строка в левой панели')

// Выключение — регистрации снимаются, состояние уходит в localStorage.
toggleById.get('cards').props.onChange({ target: { checked: false } })
assert.equal(countPanelRegs('plugin-cards'), 0, 'выключение снимает обе регистрации')
let saved = readPanelStorage()
assert.equal(saved.visible.includes('cards'), false, 'выключенная панель не видна')
assert.equal(saved.pinned.includes('cards'), false, 'выключенная панель не закреплена')
assert.deepEqual(saved.visible.length, 10, 'остальные панели остались')

// Включение возвращает видимость, но не рельс: панель ждёт в «Ещё».
toggleById.get('cards').props.onChange({ target: { checked: true } })
assert.equal(countPanelRegs('plugin-cards'), 0, 'включение само панель не регистрирует')
saved = readPanelStorage()
assert.equal(saved.visible.includes('cards'), true, 'включённая панель видна в настройках')
assert.equal(saved.pinned.includes('cards'), false, 'включённая панель попадает в «Ещё», не в рельс')

// Меню «Ещё» показывает видимую-но-не-закреплённую панель.
pinnedCalls.length = 0
dismissCalls = 0
let visibleMenu = panelActionsRegistration.component({
  entries: [],
  onPinnedChange: (id, value) => { pinnedCalls.push([id, value]) },
  onDismiss: () => { dismissCalls += 1 },
})
let menuRows = visibleMenu.children.filter((node) => node?.props?.['data-dsh-polish-pinnable'] !== undefined)
assert.deepEqual(
  menuRows.map((row) => row.props['data-dsh-polish-pinnable']),
  ['plugin-cards'],
  'в «Ещё» только видимая-но-не-закреплённая панель',
)
menuRows[0].children[1].props.onClick()
assert.equal(countPanelRegs('plugin-cards'), 2, '«Закрепить» регистрирует main + строку')
assert.deepEqual(pinnedCalls, [['plugin-cards', true]], 'onPinnedChange(id, true) для закрепления')
assert.equal(dismissCalls, 1, 'меню закрылось')
assert.equal(readPanelStorage().pinned.includes('cards'), true, 'закрепление сохранено')

// «Закрепить все панели (N)»: N — число видимых-но-не-закреплённых.
for (const id of ['review', 'vault']) {
  toggleById.get(id).props.onChange({ target: { checked: false } })
  toggleById.get(id).props.onChange({ target: { checked: true } })
}
pinnedCalls.length = 0
dismissCalls = 0
visibleMenu = panelActionsRegistration.component({
  entries: [],
  onPinnedChange: (id, value) => { pinnedCalls.push([id, value]) },
  onDismiss: () => { dismissCalls += 1 },
})
menuRows = visibleMenu.children.filter((node) => node?.props?.['data-dsh-polish-pinnable'] !== undefined)
assert.deepEqual(
  menuRows.map((row) => row.props['data-dsh-polish-pinnable']),
  ['plugin-review', 'plugin-vault'],
  'в списке обе видимые-но-не-закреплённые панели',
)
const pinAllButtonDynamic = visibleMenu.children.find((node) => node?.props?.['data-dsh-polish-pin-all'] === 'button')
assert.match(
  JSON.stringify(pinAllButtonDynamic.children),
  /Закрепить все панели \(2\)/,
  'счётчик N — число видимых-но-не-закреплённых',
)
pinAllButtonDynamic.props.onClick()
assert.deepEqual(
  pinnedCalls,
  [['plugin-review', true], ['plugin-vault', true]],
  '«все» закрепляет каждую строку',
)
assert.equal(countPanelRegs('plugin-review'), 2, 'review снова в рельсе')
assert.equal(countPanelRegs('plugin-vault'), 2, 'vault снова в рельсе')
assert.equal(dismissCalls, 1, 'меню закрылось один раз')

// Та же панель пришла и в entries — строки в меню не дублируются.
toggleById.get('team').props.onChange({ target: { checked: false } })
toggleById.get('team').props.onChange({ target: { checked: true } })
visibleMenu = panelActionsRegistration.component({
  entries: [
    { id: 'plugin-team', label: 'Команда', pinned: false },
    { id: 'calendar', label: 'Календарь', pinned: false },
  ],
  onPinnedChange() {},
  onDismiss() {},
})
menuRows = visibleMenu.children.filter((node) => node?.props?.['data-dsh-polish-pinnable'] !== undefined)
assert.deepEqual(
  menuRows.map((row) => row.props['data-dsh-polish-pinnable']),
  ['plugin-team', 'calendar'],
  'наша строка не дублируется, чужая панель хоста добавлена',
)
assert.equal(
  menuRows.filter((row) => row.props['data-dsh-polish-pinnable'] === 'plugin-team').length,
  1,
  'ровно одна строка на панель',
)

// Всё закреплено — подсказка вместо списка.
menuRows[0].children[1].props.onClick()
pinnedCalls.length = 0
visibleMenu = panelActionsRegistration.component({ entries: [], onPinnedChange() {}, onDismiss() {} })
menuRows = visibleMenu.children.filter((node) => node?.props?.['data-dsh-polish-pinnable'] !== undefined)
assert.equal(menuRows.length, 0, 'закреплять нечего')
assert.match(JSON.stringify(visibleMenu), /Все панели уже в левом меню/)
assert.equal(
  registrations.filter((item) => item.options.name === 'main').length,
  11,
  'все 11 main-панелей снова зарегистрированы',
)
assert.equal(
  registrations.filter((item) => item.options.name === 'sidebar.panellist' && item.options.id?.startsWith('plugin-')).length,
  11,
  'все 11 строк левой панели снова зарегистрированы',
)
assert.equal(readPanelStorage().visible.length, 11, 'все панели снова видны')
assert.equal(readPanelStorage().pinned.length, 11, 'все панели снова закреплены')

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
for (const key of [
  'reload', 'healthTitle', 'journalTitle', 'updatesTitle', 'check', 'fix', 'checking',
  'panelsTitle', 'panelsHint', 'panelsPinAll', 'panelsPinTitle',
  'panelsUnpinnedTitle', 'panelsUnpinnedHint', 'panelsPinOne', 'panelsPinOneTitle', 'panelsAllPinned',
  'panelsShowLabel', 'panelsPinned', 'panelsInMore', 'panelsVisibleCount', 'panelsVisibilityHint',
  'shortcutHeading', 'shortcutChip', 'shortcutAbout', 'shortcutHint', 'shortcutSettings',
  'shortcutSettingsFailed', 'shortcutSettingsHint', 'shortcutOpening', 'shortcutOpeningHint',
]) {
  assert.equal(typeof enBundle[key], 'string', `en: ключ ${key}`)
  assert.equal(typeof ruBundle[key], 'string', `ru: ключ ${key}`)
}
for (const id of SHORTCUT_IDS) {
  assert.equal(typeof ruBundle[`shortcut.${id}.title`], 'string', `ru: название ${id}`)
  assert.equal(typeof ruBundle[`shortcut.${id}.desc`], 'string', `ru: описание ${id}`)
  assert.equal(typeof enBundle[`shortcut.${id}.title`], 'string', `en: название ${id}`)
  assert.equal(typeof enBundle[`shortcut.${id}.desc`], 'string', `en: описание ${id}`)
}
assert.match(ruBundle.panelsHint, /меню «Ещё»/, 'ru-подсказка упоминает меню «Ещё»')
assert.match(ruBundle.panelsHint, /любую панель/, 'ru-подсказка: закрепить можно любую панель')
assert.match(enBundle.panelsHint, /Any panel/, 'en-подсказка: закрепить можно любую панель')
assert.match(ruBundle.panelsPinAll, /\{count\}/, 'ru-кнопка подставляет количество')
assert.match(ruBundle.shortcutHint, /кнопкой-булавкой/, 'ru-подсказка про булавку')
assert.match(ruBundle.shortcutHint, /меню «Ещё»/, 'ru-подсказка про меню «Ещё»')
assert.match(ruBundle.panelsPinOneTitle, /\{name\}/, 'подсказка булавки подставляет название')
assert.match(ruBundle.shortcutOpening, /Открываю настройки плагина/, 'ru: «Открываю настройки плагина…»')
assert.match(enBundle.shortcutOpening, /Opening plugin settings/, 'en: «Opening plugin settings…»')
assert.match(ruBundle.panelsVisibilityHint, /меню «Ещё»/, 'ru: подсказка про выключение и «Ещё»')
assert.match(ruBundle.panelsShowLabel, /Показывать в левом меню/, 'ru: подпись переключателя')
assert.match(enBundle.panelsShowLabel, /Show in the left sidebar/, 'en: подпись переключателя')
assert.match(ruBundle.panelsVisibleCount, /\{count\}.*\{total\}/, 'ru: счётчик включённых')
assert.match(enBundle.panelsVisibleCount, /\{count\}.*\{total\}/, 'en: счётчик включённых')

/* --- Восстановление состояния при загрузке ------------------------------- */

// Кладём сохранённое состояние и загружаем плагин заново: регистрируются
// только видимые и закреплённые панели, «карточки» выключены.
storage.set(
  PANEL_VISIBILITY_KEY,
  JSON.stringify({
    visible: SHORTCUT_IDS.filter((id) => id !== 'cards'),
    pinned: SHORTCUT_IDS.filter((id) => id !== 'cards'),
  }),
)
let reloaded
globalThis.window = { __ModuleLoader__: { load: (entry) => { reloaded = entry } } }
new Function(source)()
const exportedAgain = reloaded.factory((id) => modules[id])
const reloadRegistrations = []
const reloadCtx = {
  ...ctx,
  slots: {
    inject: (name, register) => {
      const dispose = register()
      return () => {
        if (typeof dispose === 'function') dispose()
      }
    },
    register: (options, component) => {
      const record = { options, component }
      reloadRegistrations.push(record)
      return () => {
        const index = reloadRegistrations.indexOf(record)
        if (index >= 0) reloadRegistrations.splice(index, 1)
      }
    },
  },
}
exportedAgain.apply(reloadCtx)
const reloadMain = reloadRegistrations.filter((item) => item.options.name === 'main')
const reloadSidebar = reloadRegistrations.filter((item) => item.options.name === 'sidebar.panellist')
assert.equal(reloadMain.length, 10, 'при загрузке регистрируются только включённые и закреплённые')
assert.equal(reloadSidebar.length, 10, 'строк левой панели тоже 10')
assert.equal(
  reloadMain.some((item) => item.options.key === 'plugin-cards'),
  false,
  'выключенная панель не регистрируется после загрузки',
)
assert.equal(
  reloadSidebar.some((item) => item.options.id === 'plugin-cards'),
  false,
  'строки выключенной панели нет в левой панели',
)
assert.equal(reloadMain.find((item) => item.options.key === 'plugin-polish') !== undefined, true, 'включённые на месте')

console.log('polish smoke: OK')
console.log('  стили:', css.split('\n').length, 'строк | карточка:', inner.children.length, 'элементов')
console.log('  описание:', 'свёрнуто, шеврон, localStorage:', baseKey, '|', docKey)
console.log('  документ:', 'скрыт data-detail-document, без дублей, restore очищает разметку')
console.log('  страница:', 'maxWidth 960, шапка 🎨, чип, «Обновить», карточек:', cards.length, ', адаптив')
console.log('  выравнивание:', 'text-align justify + hyphens auto; код, таблицы и списки исключены')
console.log(
  '  панели-ярлыки:',
  'openBundle при монтировании (11 packageName), fallback с кнопкой, 11 main + 11 sidebar.panellist',
)
console.log(
  '  видимость:',
  'localStorage dsh-polish:panel-visibility, динамические регистрации, «Ещё», «Закрепить все панели (N)», без дублей',
)
console.log('  эмодзи-иконки:', PANEL_EMOJI_CASES.length, 'меток ru/en, data-dsh-panel-emoji на nav, observer и cleanup')
