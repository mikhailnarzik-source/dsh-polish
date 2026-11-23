import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'

const source = await readFile(new URL('../client.js', import.meta.url), 'utf8')

// Окно с событиями: плагин шлёт CustomEvent 'dsh-polish:panels-changed'.
const windowEvents = []
const windowListeners = new Map()
class FakeCustomEvent {
  constructor(type, options) {
    this.type = type
    this.detail = options?.detail
  }
}

function makeWindow(assign) {
  return {
    __ModuleLoader__: { load: assign },
    CustomEvent: FakeCustomEvent,
    dispatchEvent(event) {
      windowEvents.push(event)
      for (const handler of windowListeners.get(event.type) ?? []) handler(event)
      return true
    },
    addEventListener(type, handler) {
      if (!windowListeners.has(type)) windowListeners.set(type, new Set())
      windowListeners.get(type).add(handler)
    },
    removeEventListener(type, handler) {
      windowListeners.get(type)?.delete(handler)
    },
    location: { reload() {} },
  }
}

let loaded
globalThis.window = makeWindow((entry) => { loaded = entry })

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

/**
 * Слот-леджер в духе DSH: плагины регистрируют записи, хост отдаёт их через
 * `entriesOfSlot` и будит подписчиков через `subscribe`. Тест кладёт в тот же
 * слот панели «чужих» плагинов, чтобы карточка «Панели в левом меню» строила
 * список из регистраций, а не из захардкоженного массива.
 */
function createSlotsMock(registry) {
  const ledger = new Map()
  const slotRecord = (name) => {
    if (typeof name !== 'string' || name === '') return { entries: [], listeners: new Set() }
    if (!ledger.has(name)) ledger.set(name, { entries: [], listeners: new Set() })
    return ledger.get(name)
  }
  const notify = (name) => {
    for (const listener of [...slotRecord(name).listeners]) listener()
  }
  const addEntry = (name, entry, notifyListeners = true) => {
    slotRecord(name).entries.push(entry)
    if (notifyListeners) notify(name)
    return entry
  }
  const removeEntry = (name, entry) => {
    const record = slotRecord(name)
    const index = record.entries.indexOf(entry)
    if (index < 0) return false
    record.entries.splice(index, 1)
    notify(name)
    return true
  }
  const slots = {
    inject: (name, register) => {
      const dispose = register()
      return () => {
        if (typeof dispose === 'function') dispose()
      }
    },
    register: (options, component) => {
      // Хост хранит копию options (ссылки на функции сохраняются) — как в DSH.
      const erased = { ...(options ?? {}) }
      const record = { options: erased, component }
      registry.push(record)
      const entry = { options: erased, component }
      addEntry(options?.name, entry)
      return () => {
        const index = registry.indexOf(record)
        if (index >= 0) registry.splice(index, 1)
        removeEntry(options?.name, entry)
      }
    },
    // Хост отдаёт записи без дедупликации — «без дублей» проверяем на стороне
    // плагина. `entries` — как у хоста: все записи слота как есть.
    entries: (name) => slotRecord(name).entries,
    entriesOfSlot: (name) => slotRecord(name).entries,
    subscribe: (name, listener) => {
      const record = slotRecord(name)
      record.listeners.add(listener)
      return () => {
        record.listeners.delete(listener)
      }
    },
  }
  // Регистрация панели «другого» плагина: снаружи выглядит как его
  // собственная регистрация в `sidebar.panellist`; main-панель (`main`,
  // key `plugin-<id>`) плагин регистрирует всегда, даже когда строка снята.
  slots.addHostPanel = (panelId, label, order, options = {}) => {
    const sidebarEntry = addEntry(
      'sidebar.panellist',
      {
        options: { name: 'sidebar.panellist', id: panelId, order, label },
        component: () => null,
        host: true,
      },
      options.silent !== true,
    )
    const mainEntry = slots.addHostMain(panelId)
    return { sidebarEntry, mainEntry }
  }
  slots.removeHostPanel = (handle) => {
    removeEntry('sidebar.panellist', handle.sidebarEntry)
    removeEntry('main', handle.mainEntry)
  }
  // Плагин снял строку левой панели, но сам установлен (main остаётся).
  slots.removeHostSidebar = (handle) => removeEntry('sidebar.panellist', handle.sidebarEntry)
  // Только main-панель: плагин зарегистрирован, а строки в левой панели нет.
  slots.addHostMain = (panelId) =>
    addEntry('main', { options: { name: 'main', key: panelId }, component: () => null, host: true }, false)
  slots.removeHostMain = (entry) => removeEntry('main', entry)
  // Плагин сам зарегистрировал строку левой панели (в обход лимитов).
  slots.addHostSidebar = (panelId, label, order) => ({
    sidebarEntry: addEntry('sidebar.panellist', {
      options: { name: 'sidebar.panellist', id: panelId, order, label },
      component: () => null,
      host: true,
    }),
  })
  return slots
}

const registrations = []
const effects = []
let boundNs = ''
let dict = {}
let registeredLocales = {}
const ctx = {
  // Эффект выполняется сразу (как в Cordis), а в `effects` остаётся функция,
  // возвращающая cleanup: ниже `cleanups = effects.map(fn => fn())` снимает слои.
  effect: (fn) => {
    const cleanup = fn()
    effects.push(() => (typeof cleanup === 'function' ? cleanup : () => {}))
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
  slots: createSlotsMock(registrations),
}

// Одиннадцать панелей, которые регистрируют сами плагины (id и префикс
// ключа/строки `plugin-<id>`). dsh-polish из них регистрирует только свою
// (`polish`), остальные десять — «чужие» плагины: тест кладёт их регистрации
// прямо в слот, как это сделал бы сам плагин.
const SHORTCUT_IDS = [
  'cards', 'compact', 'review', 'notify', 'team', 'vault', 'pyrus', 'inbox', 'polish', 'whale', 'browser',
]
const FOREIGN_PANEL_IDS = SHORTCUT_IDS.filter((id) => id !== 'polish')
// Порядок панелей в слоте — как у настоящих плагинов (`order` регистрации).
const PANEL_ORDERS = {
  cards: 20, compact: 21, review: 22, notify: 23, team: 24,
  vault: 25, pyrus: 26, inbox: 27, polish: 28, whale: 29, browser: 30,
}
for (const id of FOREIGN_PANEL_IDS) {
  ctx.slots.addHostPanel('plugin-' + id, id, PANEL_ORDERS[id])
}

exported.apply(ctx)

assert.deepEqual(exported.inject, ['slots', 'locale'], 'dsh-polish больше не зависит от layout')
assert.equal(boundNs, 'dshPolish')
assert.ok(registrations.length >= 1, 'есть регистрации слотов')
const sectionRegistration = registrations.find((item) => item.options.name === 'plugins.detail.section')
assert.ok(sectionRegistration !== undefined, 'секция страницы плагина зарегистрирована')
assert.equal(typeof registrations[0].component, 'function')

// Своя панель — единственная: main key 'plugin-polish' и строка sidebar.panellist
// id 'plugin-polish' (по умолчанию polish закреплён). Чужих панелей нет.
const ownMainRegs = registrations.filter((item) => item.options.name === 'main')
assert.equal(ownMainRegs.length, 1, 'зарегистрирована ровно одна main-панель — своя')
assert.equal(ownMainRegs[0].options.key, 'plugin-polish', "key своей main-панели — 'plugin-polish'")
assert.equal(typeof ownMainRegs[0].component, 'function', 'main-панель — компонент')
const ownSidebarRegs = registrations.filter((item) => item.options.name === 'sidebar.panellist')
assert.equal(ownSidebarRegs.length, 1, 'строка левой панели одна — своя (по умолчанию закреплена)')
assert.equal(ownSidebarRegs[0].options.id, 'plugin-polish', "id своей строки — 'plugin-polish'")
assert.equal(ownSidebarRegs[0].options.order, 28, 'порядок своей строки — 28')
assert.equal(ownSidebarRegs[0].options.locale, 'dshPolish', 'подпись из словаря плагина')
assert.equal(ownSidebarRegs[0].options.label(), dict['shortcut.polish.title'], 'подпись «Оформление интерфейса»')
const ownIcon = ownSidebarRegs[0].component({ size: 16, active: false })
assert.equal(ownIcon.type, 'span', 'иконка строки — span')
assert.equal(ownIcon.props['data-dsh-polish-icon'], 'polish')
assert.equal(ownIcon.props.style.width, 16)
assert.equal(ownIcon.children[0], '🎨', 'иконка своей строки — 🎨')
assert.equal(
  registrations.some((item) =>
    FOREIGN_PANEL_IDS.some((id) => item.options.key === `plugin-${id}` || item.options.id === `plugin-${id}`),
  ),
  false,
  'нет регистраций для 10 чужих id plugin-<id>',
)
assert.equal((source.match(/name:\s*'main'/g) ?? []).length, 1, 'в исходнике только своя регистрация main')
assert.equal(
  (source.match(/name:\s*'sidebar\.panellist'/g) ?? []).length,
  1,
  'в исходнике только своя регистрация sidebar.panellist',
)
assert.doesNotMatch(source, /openBundle|createShortcutPage|registerShortcutPanel/, 'нет автонавигации openBundle и панелей-ярлыков')

// Страница своей main-панели: настройки «Оформления» без служебных блоков
// плагин-менеджера (описание, источник, версия).
const ownPanelTree = renderTree(ownMainRegs[0].component({}))
assert.equal(ownPanelTree.props?.['data-dsh-polish-page'], 'page', 'своя панель отмечена data-dsh-polish-page')
const ownPanelJson = JSON.stringify(ownPanelTree)
assert.match(ownPanelJson, /Оформление интерфейса/, 'заголовок своей панели')
assert.match(ownPanelJson, /🎨/, 'эмодзи в шапке своей панели')
assert.match(ownPanelJson, /"data-dsh-polish-card":"panels"/, 'карточка «Панели в левом меню» на своей панели')
for (const foreignBlock of ['data-detail-document', 'detailDesc', 'Источник', 'Версия пакета', 'Подробное описание']) {
  assert.equal(ownPanelJson.includes(foreignBlock), false, `на своей панели нет блока «${foreignBlock}»`)
}
assert.doesNotMatch(ownPanelJson, /data-plugin-(config|manager)|pluginManager/i, 'нет разметки плагин-менеджера')

// По умолчанию все панели видны и закреплены: состояние не пишется до первого
// изменения.
const PANEL_VISIBILITY_KEY = 'dsh-polish:panel-visibility'
assert.equal(storage.has(PANEL_VISIBILITY_KEY), false, 'состояние по умолчанию не пишется в localStorage')
assert.equal(windowEvents.length, 0, 'при загрузке событие панелей не отправляется')

const panelsEvents = () => windowEvents.filter((event) => event.type === 'dsh-polish:panels-changed')
const lastPanelsEvent = () => panelsEvents().at(-1)
const readPanelStorage = () => JSON.parse(storage.get(PANEL_VISIBILITY_KEY))

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

// Чужие откреплённые панели хоста: рисуем их строки и закрепляем через
// onPinnedChange. Наши панели по умолчанию закреплены, поэтому их здесь нет.
const pinnedCalls = []
let dismissCalls = 0
const menuTree = panelActionsRegistration.component({
  entries: [
    { id: 'calendar', label: 'Календарь', pinned: false },
    { id: 'expenses', label: 'Расходы', pinned: true },
  ],
  onOpen() {},
  onPinnedChange: (id, value) => { pinnedCalls.push([id, value]) },
  onDismiss: () => { dismissCalls += 1 },
})
assert.equal(menuTree.type, 'div', 'список в обёртке')
const unpinnedRows = menuTree.children.filter((node) => node?.props?.['data-dsh-polish-pinnable'] !== undefined)
assert.deepEqual(
  unpinnedRows.map((row) => row.props['data-dsh-polish-pinnable']),
  ['calendar'],
  'в списке только откреплённые чужие панели; закреплённая не дублируется',
)
assert.equal(menuTree.children.some((node) => node?.props?.['data-dsh-polish-pinnable'] === 'plugin-cards'), false, 'по умолчанию наших строк в «Ещё» нет')
const firstPin = unpinnedRows[0].children[1]
assert.equal(firstPin.type, 'button')
assert.equal(firstPin.props['data-dsh-polish-button'], 'pin', 'кнопка строки — pin')
assert.equal(firstPin.props.style.height, 32, 'кнопка строки 32 px')
assert.equal(firstPin.props.style.borderRadius, 10, 'радиус 10')
assert.equal(firstPin.props.style.whiteSpace, 'nowrap', 'ширина по тексту')
assert.match(JSON.stringify(firstPin.children), /📌/, 'иконка булавки')
assert.match(JSON.stringify(firstPin.children), /Закрепить/, 'подпись «Закрепить»')
assert.match(String(firstPin.props.title), /Закрепить «Календарь»/, 'подсказка с названием панели')
firstPin.props.onClick()
assert.deepEqual(pinnedCalls, [['calendar', true]], 'чужую панель закрепляем через onPinnedChange(id, true)')
assert.equal(dismissCalls, 1, 'меню закрывается после закрепления')
assert.equal(storage.has(PANEL_VISIBILITY_KEY), false, 'чужая панель не трогает наш localStorage')

const pinAllButton = menuTree.children.find((node) => node?.props?.['data-dsh-polish-pin-all'] === 'button')
assert.ok(pinAllButton !== undefined, 'кнопка «Закрепить все панели» есть')
assert.equal(pinAllButton.type, 'button')
assert.equal(pinAllButton.props['data-dsh-polish-button'], 'primary', 'primary-кнопка')
assert.equal(pinAllButton.props.style.height, 36, 'высота 36')
assert.equal(pinAllButton.props.style.borderRadius, 10, 'радиус 10')
assert.equal(pinAllButton.props.style.padding, '0 14px', 'padding 0 14')
assert.equal(pinAllButton.props.style.whiteSpace, 'nowrap', 'ширина по тексту')
assert.match(JSON.stringify(pinAllButton.children), /Закрепить все панели \(1\)/, 'счётчик — число строк списка')
assert.doesNotMatch(JSON.stringify(pinAllButton.props.style), /#fff/, 'нет белого текста')
pinnedCalls.length = 0
dismissCalls = 0
pinAllButton.props.onClick()
assert.deepEqual(pinnedCalls, [['calendar', true]], '«все» закрепляет чужие строки')
assert.equal(dismissCalls, 1, 'меню закрывается один раз')
assert.equal(storage.has(PANEL_VISIBILITY_KEY), false, 'закрепление чужих панелей не пишет наше состояние')

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

/* --- Наведение и фокус для всех интерактивных элементов ------------------ */

const HOVER_START = '/* --- Наведение и фокус: все интерактивные элементы'
const HOVER_END = '/* --- Конец слоя hover/focus'
const hoverStart = css.indexOf(HOVER_START)
assert.ok(hoverStart >= 0, 'слой hover/focus добавлен в CSS')
const hoverEnd = css.indexOf(HOVER_END, hoverStart)
assert.ok(hoverEnd > hoverStart, 'у слоя hover/focus есть закрывающий маркер')
const hoverCss = css.slice(hoverStart, hoverEnd)

// Правила разбираем по блокам: так тест не зависит от переносов строк.
const hoverRules = hoverCss.split('}').map((part) => `${part}}`)
const ruleOf = (predicate, label) => {
  const rule = hoverRules.find(predicate)
  assert.ok(rule !== undefined, label)
  return rule
}
const selectorOf = (rule) => rule.slice(0, rule.indexOf('{'))

// Hover: мягкий фон бренда у кнопок, списков, вкладок, ссылок и строк.
const hoverBackground = ruleOf(
  (rule) => rule.includes(':hover') && rule.includes('background-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, transparent)'),
  'общее правило hover с мягким фоном бренда',
)
const hoverBackgroundSelector = selectorOf(hoverBackground)
for (const marker of [
  'button:not(:disabled)',
  'select:not(:disabled)',
  'a[href]',
  "[role='option']",
  "[role='menuitem']",
  "[role='tab']",
  "[role='button']",
  "[class*='switch']",
  'label:has(',
  "[class*='row']",
  "[class*='item']",
  "[class*='card']",
  '[data-dsh-polish-row]',
  '[data-dsh-polish-panel-row]',
]) {
  assert.ok(hoverBackgroundSelector.includes(marker), `hover: есть ${marker}`)
}
assert.ok(
  hoverBackgroundSelector.includes(':not([data-dsh-polish-button])'),
  'наши кнопки не перекрываются общим hover',
)

// Поля, select и textarea: тонкая рамка брендом 45 %.
const fieldHover = ruleOf(
  (rule) => rule.includes(':hover') && rule.includes('border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent)'),
  'hover полей: рамка брендом 45%',
)
const fieldSelector = selectorOf(fieldHover)
for (const marker of [
  "input:not(:disabled):not([type='checkbox']):not([type='radio'])",
  'textarea:not(:disabled)',
  'select:not(:disabled)',
]) {
  assert.ok(fieldSelector.includes(marker), `hover поля: есть ${marker}`)
}

// Чекбоксы, радио и переключатели: акцент и усиленная рамка.
const checkHover = ruleOf(
  (rule) => rule.includes(':hover') && rule.includes('accent-color: var(--dsw-alias-brand-primary)'),
  'hover чекбоксов и переключателей: accent-color',
)
const checkSelector = selectorOf(checkHover)
assert.ok(checkSelector.includes("input[type='checkbox']"), 'hover: чекбокс')
assert.ok(checkSelector.includes("input[type='radio']"), 'hover: радио')
assert.ok(checkSelector.includes("[class*='switch']"), 'hover: переключатель')
assert.match(checkHover, /border-color: color-mix/, 'у переключателей усиливается рамка')

// Вкладки: выбранная получает акцент бренда.
const selectedTab = hoverRules.find(
  (rule) => rule.includes("[role='tab'][aria-selected='true']") && !rule.includes(':hover'),
)
assert.ok(selectedTab !== undefined, 'акцент выбранной вкладки (aria-selected)')
assert.match(selectedTab, /color: var\(--dsw-alias-brand-primary\)/, 'выбранная вкладка — цвет бренда')

// Кликабельные карточки: лёгкая тень, размеры не меняются.
assert.match(hoverCss, /box-shadow: 0 2px 10px/, 'hover карточки — мягкая тень')

// Переход 120 мс.
assert.match(
  hoverCss,
  /transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease, box-shadow 120ms ease/,
  'transition 120 мс у интерактивных элементов',
)

// Focus-visible: обводка 2 px цветом бренда и отступ 2 px.
assert.match(css, /outline: 2px solid var\(--dsw-alias-brand-primary\)/, 'фокус — обводка 2 px цветом бренда')
assert.match(css, /outline-offset: 2px/, 'фокус — отступ обводки 2 px')
assert.match(
  css,
  /button:focus-visible,\s*\[role='button'\]:focus-visible,\s*a:focus-visible,\s*input:focus-visible,\s*select:focus-visible,\s*textarea:focus-visible\s*\{/,
  'фокус для кнопок, ссылок и полей',
)
const focusExtra = ruleOf(
  (rule) => rule.includes(':focus-visible') && rule.includes("[role='option']") && rule.includes('outline: 2px solid var(--dsw-alias-brand-primary)'),
  'focus-visible для списков, вкладок, строк и карточек',
)
const focusExtraSelector = selectorOf(focusExtra)
for (const marker of [
  "[role='menuitem']",
  "[role='tab']",
  'label:has(',
  "[class*='switch']",
  '[data-dsh-polish-row]',
  "[class*='row']",
  "[class*='card']",
]) {
  assert.ok(focusExtraSelector.includes(marker), `focus: есть ${marker}`)
}
assert.doesNotMatch(focusExtra, /border-radius:/, 'радиус при фокусе не переопределяется')

// Исключения: disabled/aria-disabled и код pre/code.
assert.match(hoverCss, /:is\(:disabled, \[aria-disabled='true'\]\) \{/, 'disabled не получает подсветку')
assert.match(hoverCss, /:where\(pre, code\) :is\(/, 'содержимое pre/code исключено')
assert.match(hoverCss, /background-color: transparent/, 'исключения снимают фон')
assert.match(hoverCss, /outline: none/, 'исключения снимают обводку')
assert.match(
  hoverCss,
  /:where\(pre, code\) :is\([^)]*\):focus-visible \{/,
  'у кода фокус без обводки',
)

// Размеры, радиусы, отступы и шрифты не трогаем: слой только про цвет.
assert.doesNotMatch(
  hoverCss,
  /(^|[;{\s])(border-radius|height|min-height|max-height|width|min-width|max-width|padding|margin|font-size|transform)\s*:/,
  'слой не меняет размеры, радиусы, отступы и шрифты',
)

/* --- Глобальное выравнивание длинных абзацев ----------------------------- */

const justifyMatch = css.match(/:is\(\s*\[class\*="message"\] p[\s\S]*?\):not\([^{}]*\)\s*\{[^}]*\}/)
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
const chipStyle = chips[0].props?.style ?? {}
assert.equal(chipStyle.display, 'inline-flex', 'чип собран на inline-flex')
assert.equal(chipStyle.borderRadius, 10, 'чип — не пилюля, а кнопка: radius 10')
assert.equal(chipStyle.height, 32, 'чип в шапке: height 32')
assert.equal(chipStyle.padding, '0 12px', 'padding чипа 0 12')
assert.match(String(chipStyle.border ?? ''), /^1px solid /, 'у чипа рамка 1px')
assert.equal(chipStyle.fontWeight, 600, 'шрифт чипа 600')
assert.equal(chipStyle.fontSize, 12.5, 'шрифт чипа 12.5')
assert.equal(chipStyle.gap, 6, 'gap чипа 6')
const chipDots = collect(chips[0], (node) => node.props?.style?.width === 6 && node.props?.style?.height === 6)
assert.equal(chipDots.length, 1, 'точка-индикатор 6px у чипа')
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

/* --- Строка панели: контейнер, наведение и клик по всей строке ------------ */

const cardsRow = settingsPanelRows.find((row) => row.props['data-dsh-polish-panel-row'] === 'cards')
assert.ok(cardsRow !== undefined, 'строка «Карточки» на странице')
assert.equal(typeof cardsRow.props.onClick, 'function', 'у строки есть обработчик клика')
assert.equal(cardsRow.props.style.padding, '8px 10px', 'у строки поля 8×10 px')
assert.equal(cardsRow.props.style.borderRadius, 10, 'у строки радиус 10 px')
assert.equal(cardsRow.props.style.cursor, 'pointer', 'курсор-указатель на всей строке')
assert.equal(cardsRow.props.style.flexWrap, 'wrap', 'строка переносится на узком экране')
const cardsName = cardsRow.children.find(
  (node) => node?.props?.['data-dsh-polish-panel-name'] === 'cards',
)
assert.ok(cardsName !== undefined, 'название панели помечено data-атрибутом для подсветки')
assert.equal(cardsName.props.title, 'Карточки', 'подсказка с названием сохранена')
assert.match(JSON.stringify(cardsRow), /В левом меню/, 'чип строки на месте')

// Клик по строке (не по флажку) переключает панель — как и флажок.
windowEvents.length = 0
cardsRow.props.onClick({ target: { tagName: 'SPAN', parentElement: null } })
let rowClickedStorage = readPanelStorage()
assert.equal(rowClickedStorage.visible.includes('cards'), false, 'клик по строке выключил панель')
assert.equal(rowClickedStorage.pinned.includes('cards'), false, 'выключенная панель ушла и из закреплённых')
assert.equal(panelsEvents().length, 1, 'клик по строке отправил одно событие')
const afterRowClickPage = settingsPageFrom(registrations)
const afterRowClickToggles = collect(
  afterRowClickPage,
  (node) => node.type === 'input' && node.props?.['data-dsh-polish-panel-toggle'] !== undefined,
)
assert.equal(
  afterRowClickToggles.find((toggle) => toggle.props['data-dsh-polish-panel-toggle'] === 'cards').props.checked,
  false,
  'после клика флажок строки снят',
)

// Клик по флажку и его подписи обрабатывает сам флажок: строку не трогаем,
// иначе панель переключилась бы дважды.
const clickRowAgain = collect(
  afterRowClickPage,
  (node) => node.props?.['data-dsh-polish-panel-row'] !== undefined,
).find((row) => row.props['data-dsh-polish-panel-row'] === 'cards')
const clickGuardEvents = panelsEvents().length
const guardLabel = new FakeElement('label')
const guardCaption = new FakeElement('span')
guardLabel.appendChild(guardCaption)
clickRowAgain.props.onClick({ target: guardCaption })
assert.equal(readPanelStorage().visible.includes('cards'), false, 'клик по подписи флажка не переключает строку')
assert.equal(panelsEvents().length, clickGuardEvents, 'клик по подписи флажка не шлёт событие')

// Возврат к исходному состоянию: все панели видны и закреплены.
windowEvents.length = 0
clickRowAgain.props.onClick({ target: { tagName: 'DIV', parentElement: null } })
assert.equal(readPanelStorage().visible.includes('cards'), true, 'повторный клик по строке вернул панель')
storage.set(PANEL_VISIBILITY_KEY, JSON.stringify({ visible: SHORTCUT_IDS, pinned: SHORTCUT_IDS }))


/* --- Переключатель: visible/pinned, localStorage и событие ---------------- */

const toggleById = new Map(panelToggles.map((node) => [node.props['data-dsh-polish-panel-toggle'], node]))
assert.equal(panelToggles.length, SHORTCUT_IDS.length, 'у каждой из 11 панелей свой переключатель')
const registrationsBefore = registrations.length

// Слушатель на window получает detail события.
const received = []
const panelsListener = (event) => received.push(event.detail)
window.addEventListener('dsh-polish:panels-changed', panelsListener)

// Выключение: id уходит и из visible, и из pinned; одно событие с detail.
windowEvents.length = 0
toggleById.get('cards').props.onChange({ target: { checked: false } })
let saved = readPanelStorage()
assert.equal(saved.visible.includes('cards'), false, 'выключенная панель не видна')
assert.equal(saved.pinned.includes('cards'), false, 'выключенная панель не закреплена')
assert.equal(saved.visible.length, 10, 'остальные панели остались')
assert.equal(panelsEvents().length, 1, 'изменение отправляет одно событие')
let panelsEvent = lastPanelsEvent()
assert.equal(panelsEvent.type, 'dsh-polish:panels-changed', 'имя события')
assert.equal(panelsEvent instanceof FakeCustomEvent, true, 'событие создано через window.CustomEvent')
assert.deepEqual(panelsEvent.detail.visible, saved.visible, 'detail.visible совпадает с localStorage')
assert.deepEqual(panelsEvent.detail.pinned, saved.pinned, 'detail.pinned совпадает с localStorage')
assert.equal(panelsEvent.detail.visible.includes('cards'), false, 'в detail выключенного id нет')
assert.equal(received.length, 1, 'слушатель window получил событие')
assert.deepEqual(received[0].visible, saved.visible, 'слушатель видит visible события')
assert.deepEqual(received[0].pinned, saved.pinned, 'слушатель видит pinned события')
assert.ok(Array.isArray(saved.known), 'состояние помнит известные id в known')
assert.equal(saved.known.includes('cards'), true, 'выключенная панель осталась в known')
assert.equal(
  registrations.filter((item) => item.options.name === 'main').length,
  1,
  'своя main-панель остаётся единственной',
)
assert.equal(registrations.length, registrationsBefore, 'переключатель не создаёт новых регистраций слотов')

// Включение: id попадает только в visible — плагин уходит в «Ещё», не в рельс.
windowEvents.length = 0
toggleById.get('cards').props.onChange({ target: { checked: true } })
saved = readPanelStorage()
assert.equal(saved.visible.includes('cards'), true, 'включённая панель видна в настройках')
assert.equal(saved.pinned.includes('cards'), false, 'включённая панель попадает в «Ещё», не в рельс')
assert.equal(panelsEvents().length, 1, 'включение тоже отправляет событие')
assert.deepEqual(lastPanelsEvent().detail.visible, saved.visible, 'detail — снимок нового состояния')
assert.deepEqual(lastPanelsEvent().detail.pinned, saved.pinned, 'detail — снимок нового состояния')
window.removeEventListener('dsh-polish:panels-changed', panelsListener)

// Меню «Ещё» показывает нашу видимую-но-не-закреплённую панель.
pinnedCalls.length = 0
dismissCalls = 0
windowEvents.length = 0
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
assert.match(JSON.stringify(menuRows[0]), /Карточки/, 'название панели из словаря')
menuRows[0].children[1].props.onClick()
assert.deepEqual(pinnedCalls, [], 'нашу панель не отправляем в onPinnedChange')
assert.equal(dismissCalls, 1, 'меню закрылось после закрепления')
assert.equal(readPanelStorage().pinned.includes('cards'), true, 'закрепление сохранено в localStorage')
assert.equal(panelsEvents().length, 1, '«Закрепить» отправило одно событие')
assert.equal(lastPanelsEvent().detail.pinned.includes('cards'), true, 'в событии панель закреплена')

// «Закрепить все панели (N)»: N — число видимых-но-не-закреплённых,
// все они уходят в pinned одним изменением и одним событием.
for (const id of ['review', 'vault']) {
  toggleById.get(id).props.onChange({ target: { checked: false } })
  toggleById.get(id).props.onChange({ target: { checked: true } })
}
assert.equal(readPanelStorage().pinned.includes('review'), false, 'review ждёт в «Ещё»')
windowEvents.length = 0
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
assert.deepEqual(pinnedCalls, [], 'наши панели не идут в onPinnedChange')
assert.equal(panelsEvents().length, 1, '«Закрепить все» — одно событие на всю пачку')
assert.equal(lastPanelsEvent().detail.pinned.includes('review'), true, 'review закреплён')
assert.equal(lastPanelsEvent().detail.pinned.includes('vault'), true, 'vault закреплён')
assert.equal(readPanelStorage().pinned.length, 11, 'все панели закреплены')
assert.equal(dismissCalls, 1, 'меню закрылось один раз')

// Та же панель пришла и в entries — строки в меню не дублируются.
toggleById.get('team').props.onChange({ target: { checked: false } })
toggleById.get('team').props.onChange({ target: { checked: true } })
pinnedCalls.length = 0
windowEvents.length = 0
visibleMenu = panelActionsRegistration.component({
  entries: [
    { id: 'plugin-team', label: 'Команда', pinned: false },
    { id: 'calendar', label: 'Календарь', pinned: false },
  ],
  onPinnedChange: (id, value) => { pinnedCalls.push([id, value]) },
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
// Строка из entries с нашим id закрепляется через наше состояние, без onPinnedChange.
menuRows[0].children[1].props.onClick()
assert.deepEqual(pinnedCalls, [], 'строка с нашим id не уходит в onPinnedChange')
assert.equal(readPanelStorage().pinned.includes('team'), true, 'строка из entries закреплена в нашем состоянии')
assert.equal(panelsEvents().length, 1, 'закрепление строки из entries отправило событие')
// Чужая строка — только onPinnedChange, наше состояние не меняется.
const eventsBeforeForeign = panelsEvents().length
const foreignRow = menuRows.find((row) => row.props['data-dsh-polish-pinnable'] === 'calendar')
foreignRow.children[1].props.onClick()
assert.deepEqual(pinnedCalls, [['calendar', true]], 'чужую строку закрепляем через onPinnedChange')
assert.equal(readPanelStorage().pinned.includes('team'), true, 'наше состояние не сброшено')
assert.equal(panelsEvents().length, eventsBeforeForeign, 'чужая строка не отправляет наше событие')

// Всё закреплено — подсказка вместо списка.
pinnedCalls.length = 0
windowEvents.length = 0
visibleMenu = panelActionsRegistration.component({ entries: [], onPinnedChange() {}, onDismiss() {} })
menuRows = visibleMenu.children.filter((node) => node?.props?.['data-dsh-polish-pinnable'] !== undefined)
assert.equal(menuRows.length, 0, 'закреплять нечего')
assert.match(JSON.stringify(visibleMenu), /Все панели уже в левом меню/)
assert.equal(
  registrations.filter((item) => item.options.name === 'main').length,
  1,
  'dsh-polish держит только свою main-панель и после изменений',
)
assert.equal(registrations.filter((item) => item.options.name === 'main')[0].options.key, 'plugin-polish')
assert.equal(readPanelStorage().visible.length, 11, 'все панели снова видны')
assert.equal(readPanelStorage().pinned.length, 11, 'все панели снова закреплены')

/* --- Своя панель: main всегда, строка по pinned, реакция на событие ------- */

const ownMainRegistered = () => registrations.some((item) => item.options.name === 'main' && item.options.key === 'plugin-polish')
const ownSidebarRegistered = () =>
  registrations.some((item) => item.options.name === 'sidebar.panellist' && item.options.id === 'plugin-polish')
assert.equal(ownMainRegistered(), true, 'main-панель plugin-polish зарегистрирована')
assert.equal(ownSidebarRegistered(), true, 'по умолчанию строка своей панели закреплена')

// Выключение в настройках: id уходит из visible и pinned — строка снимается,
// main остаётся.
windowEvents.length = 0
toggleById.get('polish').props.onChange({ target: { checked: false } })
assert.equal(ownSidebarRegistered(), false, 'выключение снимает свою строку')
assert.equal(ownMainRegistered(), true, 'main-панель остаётся зарегистрированной')
assert.equal(panelsEvents().length, 1, 'выключение отправило событие')

// Включение без закрепления: видна в настройках, но в левой панели нет.
toggleById.get('polish').props.onChange({ target: { checked: true } })
assert.equal(ownSidebarRegistered(), false, 'включение без закрепления строку не возвращает')
assert.equal(readPanelStorage().pinned.includes('polish'), false)

// Закрепление из «Ещё» возвращает строку одним событием.
windowEvents.length = 0
const ownMenu = panelActionsRegistration.component({ entries: [], onDismiss() {} })
const ownRow = ownMenu.children.find((node) => node?.props?.['data-dsh-polish-pinnable'] === 'plugin-polish')
assert.ok(ownRow !== undefined, 'своя панель ждёт в меню «Ещё»')
assert.match(JSON.stringify(ownRow), /Оформление интерфейса/, 'название своей панели в «Ещё»')
ownRow.children[1].props.onClick()
assert.equal(ownSidebarRegistered(), true, 'закрепление вернуло свою строку')
assert.equal(panelsEvents().length, 1, 'закрепление отправило одно событие')

// Событие dsh-polish:panels-changed: строка перечитывает localStorage и
// снимается, если polish больше не закреплён.
storage.set(
  PANEL_VISIBILITY_KEY,
  JSON.stringify({ visible: SHORTCUT_IDS, pinned: SHORTCUT_IDS.filter((id) => id !== 'polish') }),
)
windowEvents.length = 0
window.dispatchEvent(new FakeCustomEvent('dsh-polish:panels-changed'))
assert.equal(ownSidebarRegistered(), false, 'событие снимает строку незакреплённой панели')
assert.equal(ownMainRegistered(), true, 'событие не трогает main-панель')
assert.equal(panelsEvents().length, 1, 'событие обработано (само событие записано слушателем окна)')

// storage-событие (изменение из другой вкладки) возвращает строку.
storage.set(PANEL_VISIBILITY_KEY, JSON.stringify({ visible: SHORTCUT_IDS, pinned: SHORTCUT_IDS }))
window.dispatchEvent({ type: 'storage', key: PANEL_VISIBILITY_KEY })
assert.equal(ownSidebarRegistered(), true, 'storage-событие возвращает строку закреплённой панели')
assert.equal(readPanelStorage().pinned.length, 11, 'состояние перечитано из localStorage')

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

// Строка панели: фон при наведении и фокусе внутри, плавный переход, чип и адаптив.
assert.match(
  pageCss,
  /\[data-dsh-polish-panel-row\]\{transition:background-color 120ms/,
  'переход фона строки — 120 ms',
)
assert.match(pageCss, /\[data-dsh-polish-panel-row\]:hover,/, 'подсветка строки при наведении')
assert.match(
  pageCss,
  /\[data-dsh-polish-panel-row\]:focus-within\{/,
  'подсветка строки при фокусе внутри (доступность)',
)
assert.match(
  pageCss,
  /:hover,?\[data-dsh-polish-panel-row\]:focus-within\{background:var\(--dsw-alias-interactive-bg-hover\)/,
  'фон при наведении — токен interactive-bg-hover',
)
assert.match(
  pageCss,
  /background:color-mix\(in srgb, var\(--dsw-alias-brand-primary\) 8%, transparent\)/,
  'фон при наведении — brand 8 %, если токен не задан',
)
assert.match(
  pageCss,
  /:hover \[data-dsh-polish-panel-name\],\[data-dsh-polish-panel-row\]:focus-within \[data-dsh-polish-panel-name\]\{font-weight:600/,
  'название усиливается при наведении и фокусе',
)
assert.match(
  pageCss,
  /\[data-dsh-polish-panel-row\]:hover \[data-dsh-polish-chip="status"\][^}]*border-color:color-mix\(in srgb, var\(--dsw-alias-brand-primary\) 35%/,
  'рамка чипа усиливается brand 35 %',
)
assert.match(
  pageCss,
  /\[data-dsh-polish-panel-row\] \[data-dsh-polish-chip="status"\]\{transition:border-color 120ms/,
  'переход рамки чипа — 120 ms',
)
assert.match(
  pageCss,
  /\[data-dsh-polish-panel-row\] \[data-dsh-polish-chip="status"\]\{flex:1 1 100% !important;justify-content:center\}/,
  'на 640 px чип строки переносится на свою строку',
)
assert.match(
  pageCss,
  /\[data-dsh-polish-panel-row\]\{padding:8px !important;gap:6px !important\}/,
  'на 640 px поля и отступ строки уменьшаются',
)


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
  'panelsTitle', 'panelsHint', 'panelsEmpty', 'panelsPinAll', 'panelsPinTitle',
  'panelsUnpinnedTitle', 'panelsUnpinnedHint', 'panelsPinOne', 'panelsPinOneTitle', 'panelsAllPinned',
  'panelsShowLabel', 'panelsPinned', 'panelsInMore', 'panelsVisibleCount', 'panelsVisibilityHint',
  'shortcutHint',
]) {
  assert.equal(typeof enBundle[key], 'string', `en: ключ ${key}`)
  assert.equal(typeof ruBundle[key], 'string', `ru: ключ ${key}`)
}
for (const id of SHORTCUT_IDS) {
  assert.equal(typeof ruBundle[`shortcut.${id}.title`], 'string', `ru: название ${id}`)
  assert.equal(typeof enBundle[`shortcut.${id}.title`], 'string', `en: название ${id}`)
}
// Страница-ярлык и её тексты удалены: dsh-polish не рисует панели.
for (const removed of ['shortcutOpening', 'shortcutAbout', 'shortcutSettings', 'shortcutHeading']) {
  assert.equal(Object.hasOwn(ruBundle, removed), false, `ru: ключ ${removed} удалён`)
  assert.equal(Object.hasOwn(enBundle, removed), false, `en: ключ ${removed} удалён`)
}
assert.equal(Object.hasOwn(ruBundle, 'shortcut.cards.desc'), false, 'описания страницы-ярлыка удалены')
assert.match(ruBundle.panelsHint, /меню «Ещё»/, 'ru-подсказка упоминает меню «Ещё»')
assert.match(ruBundle.panelsHint, /любую панель/, 'ru-подсказка: закрепить можно любую панель')
assert.match(enBundle.panelsHint, /Any panel/, 'en-подсказка: закрепить можно любую панель')
assert.match(ruBundle.panelsPinAll, /\{count\}/, 'ru-кнопка подставляет количество')
assert.match(ruBundle.shortcutHint, /меню «Ещё»/, 'ru-подсказка про меню «Ещё»')
assert.match(ruBundle.shortcutHint, /Закрепить/, 'ru-подсказка про кнопку «Закрепить»')
assert.match(ruBundle.panelsPinOneTitle, /\{name\}/, 'подсказка булавки подставляет название')
assert.match(ruBundle.panelsVisibilityHint, /меню «Ещё»/, 'ru: подсказка про выключение и «Ещё»')
assert.match(ruBundle.panelsShowLabel, /Показывать в левом меню/, 'ru: подпись переключателя')
assert.match(enBundle.panelsShowLabel, /Show in the left sidebar/, 'en: подпись переключателя')
assert.match(ruBundle.panelsVisibleCount, /\{count\}.*\{total\}/, 'ru: счётчик включённых')
assert.match(enBundle.panelsVisibleCount, /\{count\}.*\{total\}/, 'en: счётчик включённых')

/* --- Восстановление состояния при загрузке ------------------------------- */

// Сохранённое состояние: «карточки» выключены. Перезагружаем плагин: он читает
// localStorage, регистрирует свою main-панель и (если polish закреплён) строку,
// и не шлёт событие до первого изменения.
storage.set(
  PANEL_VISIBILITY_KEY,
  JSON.stringify({
    visible: SHORTCUT_IDS.filter((id) => id !== 'cards'),
    pinned: SHORTCUT_IDS.filter((id) => id !== 'cards'),
  }),
)
const savedBeforeReload = storage.get(PANEL_VISIBILITY_KEY)
windowEvents.length = 0
let reloaded
globalThis.window = makeWindow((entry) => { reloaded = entry })
new Function(source)()
const exportedAgain = reloaded.factory((id) => modules[id])
const reloadRegistrations = []
const reloadSlots = createSlotsMock(reloadRegistrations)
for (const id of FOREIGN_PANEL_IDS) {
  reloadSlots.addHostPanel('plugin-' + id, id, PANEL_ORDERS[id])
}
const reloadCtx = {
  ...ctx,
  effect: () => {},
  slots: reloadSlots,
}
exportedAgain.apply(reloadCtx)
const reloadMain = reloadRegistrations.filter((item) => item.options.name === 'main')
const reloadSidebar = reloadRegistrations.filter((item) => item.options.name === 'sidebar.panellist')
assert.equal(reloadMain.length, 1, 'при загрузке регистрируется только своя main-панель')
assert.equal(reloadMain[0].options.key, 'plugin-polish', 'key своей main-панели после перезагрузки')
assert.equal(reloadSidebar.length, 1, 'polish закреплён — своя строка зарегистрирована')
assert.equal(reloadSidebar[0].options.id, 'plugin-polish')
assert.equal(
  reloadRegistrations.some((item) =>
    FOREIGN_PANEL_IDS.some((id) => item.options.key === `plugin-${id}` || item.options.id === `plugin-${id}`),
  ),
  false,
  'после перезагрузки нет регистраций для 10 чужих id',
)
assert.equal(windowEvents.length, 0, 'при загрузке событие панелей не отправляется')
assert.equal(storage.get(PANEL_VISIBILITY_KEY), savedBeforeReload, 'сохранённое состояние не перезаписано при загрузке')

// Карточка настроек после перезагрузки: выключенная панель не отмечена.
const reloadSection = reloadRegistrations.find((item) => item.options.name === 'plugins.detail.section')
const reloadWrapper = reloadSection.component({ subject: { kind: 'bundle', pkg: { name: 'dsh-polish' } }, children: null })
const reloadInner = reloadWrapper.type({ ...reloadWrapper.props, children: null })
const reloadPage = renderTree(reloadInner)
const reloadToggles = collect(
  reloadPage,
  (node) => node.type === 'input' && node.props?.['data-dsh-polish-panel-toggle'] !== undefined,
)
assert.equal(reloadToggles.length, 11, 'в карточке по-прежнему 11 переключателей')
assert.equal(
  reloadToggles.filter((toggle) => toggle.props.checked === true).length,
  10,
  'после перезагрузки отмечены только включённые панели',
)
assert.equal(
  reloadToggles.find((toggle) => toggle.props['data-dsh-polish-panel-toggle'] === 'cards').props.checked,
  false,
  'выключенная панель не отмечена',
)

// Без сохранённого ключа — дефолт: все 11 видимы и закреплены (проверено выше).

/* --- Авто-список панелей из слота sidebar.panellist ---------------------- */

/** Страница настроек для конкретной загрузки плагина. */
function settingsPageFrom(loadRegistrations) {
  const section = loadRegistrations.find((item) => item.options.name === 'plugins.detail.section')
  assert.ok(section !== undefined, 'секция страницы зарегистрирована')
  const wrapper = section.component({ subject: { kind: 'bundle', pkg: { name: 'dsh-polish' } }, children: null })
  const inner = wrapper.type({ ...wrapper.props, children: null })
  return renderTree(inner)
}

const rowsOf = (page) => collect(page, (node) => node.props?.['data-dsh-polish-panel-row'] !== undefined)
const togglesOf = (page) =>
  collect(page, (node) => node.type === 'input' && node.props?.['data-dsh-polish-panel-toggle'] !== undefined)
const rowIdsOf = (page) => rowsOf(page).map((row) => row.props['data-dsh-polish-panel-row'])

/** Загрузить client.js заново: панели «чужих» плагинов лежат в слоте. */
function loadPolishPlugin(hostPanels, savedValue, options = {}) {
  if (savedValue === undefined) storage.delete(PANEL_VISIBILITY_KEY)
  else storage.set(PANEL_VISIBILITY_KEY, JSON.stringify(savedValue))
  const loadRegistrations = []
  let loadedModule
  globalThis.window = makeWindow((entry) => { loadedModule = entry })
  new Function(source)()
  const api = loadedModule.factory((id) => modules[id])
  const cleanups = []
  const slots = createSlotsMock(loadRegistrations)
  const hostEntries = hostPanels.map((panel) => slots.addHostPanel(panel.id, panel.label, panel.order))
  // Только main-панели: плагин зарегистрирован, а строку в левой панели забыл.
  const mainEntries = (options.mains ?? []).map((panelId) => slots.addHostMain(panelId))
  const context = {
    // В отличие от загрузки в начале теста, эффекты подписываются сразу:
    // проверяем реакцию на уже после загрузки добавленные панели.
    effect: (fn) => {
      const cleanup = fn()
      if (typeof cleanup === 'function') cleanups.push(cleanup)
    },
    locale: {
      bind: ctx.locale.bind,
      register: ctx.locale.register,
      subscribe: () => () => {},
    },
    slots,
  }
  api.apply(context)
  return {
    api,
    slots,
    hostEntries,
    mainEntries,
    registrations: loadRegistrations,
    cleanups,
    page: () => settingsPageFrom(loadRegistrations),
  }
}

// Список строится из entriesOfSlot: известные id (cards, compact), новая
// панель с подписью-thunk (widget) и ещё одна новая (zeta). Порядок — по
// order, своя панель polish (order 28) стоит между ними.
const auto = loadPolishPlugin([
  { id: 'plugin-zeta', label: 'Зета', order: 40 },
  { id: 'plugin-compact', label: 'compact', order: 21 },
  { id: 'plugin-widget', label: () => 'Виджет', order: 5 },
  { id: 'plugin-cards', label: 'cards', order: 20 },
])
const autoPage = auto.page()
assert.deepEqual(
  rowIdsOf(autoPage),
  ['widget', 'cards', 'compact', 'polish', 'zeta'],
  'строки — из entriesOfSlot, порядок по order',
)
const autoToggles = togglesOf(autoPage)
assert.equal(autoToggles.length, 5, 'переключатель у каждой зарегистрированной панели')
assert.equal(autoToggles.every((toggle) => toggle.props.checked === true), true, 'новые панели по умолчанию включены')
const autoRows = rowsOf(autoPage)
const widgetRow = autoRows.find((row) => row.props['data-dsh-polish-panel-row'] === 'widget')
assert.match(JSON.stringify(widgetRow), /Виджет/, 'подпись новой панели — из слота (thunk)')
assert.match(JSON.stringify(widgetRow), /🧩/, 'эмодзи новой панели по умолчанию')
const compactRow = autoRows.find((row) => row.props['data-dsh-polish-panel-row'] === 'compact')
assert.match(JSON.stringify(compactRow), /Сжатие диалога/, 'известная панель берёт название из словаря')
assert.match(JSON.stringify(compactRow), /🗜️/, 'известная панель берёт свой эмодзи')
assert.match(JSON.stringify(autoPage), /включено: 5 из 5/, 'счётчик — все зарегистрированные панели')
assert.equal(storage.has(PANEL_VISIBILITY_KEY), false, 'до первого изменения ключ не пишется')
assert.equal(panelsEvents().length, 0, 'при загрузке событие панелей не отправляется')

// Выключение нового id: уходит из visible и pinned, событие с detail; ранее
// известные записи (cards/compact/polish) сохраняются.
const eventsBeforeWidgetOff = panelsEvents().length
const widgetToggle = () =>
  togglesOf(auto.page()).find((toggle) => toggle.props['data-dsh-polish-panel-toggle'] === 'widget')
widgetToggle().props.onChange({ target: { checked: false } })
const savedWidgetOff = readPanelStorage()
assert.equal(savedWidgetOff.visible.includes('widget'), false, 'выключенная новая панель не видна')
assert.equal(savedWidgetOff.pinned.includes('widget'), false, 'выключенная новая панель не закреплена')
assert.equal(savedWidgetOff.visible.includes('cards'), true, 'ранее известная панель сохранена в visible')
assert.equal(savedWidgetOff.pinned.includes('cards'), true, 'ранее известная панель сохранена в pinned')
assert.equal(savedWidgetOff.known.includes('widget'), true, 'выключенный id запомнен в known')
assert.equal(panelsEvents().length - eventsBeforeWidgetOff, 1, 'выключение отправляет одно событие')
assert.equal(lastPanelsEvent().detail.visible.includes('widget'), false, 'в detail выключенного id нет')
assert.equal(lastPanelsEvent().detail.visible.includes('cards'), true, 'detail знает остальные панели')
assert.equal(
  togglesOf(auto.page()).find((toggle) => toggle.props['data-dsh-polish-panel-toggle'] === 'widget').props.checked,
  false,
  'после выключения флажок новой панели снят',
)

// Включение: только visible, панель ждёт в «Ещё»; состояние отсортировано по order.
const eventsBeforeWidgetOn = panelsEvents().length
widgetToggle().props.onChange({ target: { checked: true } })
const savedWidgetOn = readPanelStorage()
assert.equal(savedWidgetOn.visible.includes('widget'), true, 'включённая панель видна')
assert.equal(savedWidgetOn.pinned.includes('widget'), false, 'включение без закрепления — в «Ещё»')
assert.deepEqual(
  savedWidgetOn.visible,
  ['widget', 'cards', 'compact', 'polish', 'zeta'],
  'visible отсортирован по order слотов',
)
assert.deepEqual(
  savedWidgetOn.pinned,
  ['cards', 'compact', 'polish', 'zeta'],
  'pinned отсортирован по order слотов',
)
assert.equal(panelsEvents().length - eventsBeforeWidgetOn, 1, 'включение отправляет одно событие')
assert.deepEqual(lastPanelsEvent().detail.visible, savedWidgetOn.visible, 'detail.visible совпадает со state')
assert.deepEqual(lastPanelsEvent().detail.pinned, savedWidgetOn.pinned, 'detail.pinned совпадает со state')

// Снятая панель не показывается, но запись о ней не теряется при сохранении.
auto.slots.removeHostPanel(auto.hostEntries[0])
assert.deepEqual(
  rowIdsOf(auto.page()),
  ['widget', 'cards', 'compact', 'polish'],
  'панель без регистрации в настройках не показывается',
)
const cardsToggle = () => togglesOf(auto.page()).find((toggle) => toggle.props['data-dsh-polish-panel-toggle'] === 'cards')
cardsToggle().props.onChange({ target: { checked: false } })
cardsToggle().props.onChange({ target: { checked: true } })
assert.equal(
  readPanelStorage().visible.includes('zeta'),
  true,
  'запись снятой панели сохраняется при следующих изменениях',
)

// Слот изменился после загрузки: подписка обновляет список; дубли не рисуются.
auto.slots.addHostPanel('plugin-fresh', 'Свежая', 35)
assert.deepEqual(
  rowIdsOf(auto.page()),
  ['widget', 'cards', 'compact', 'polish', 'fresh'],
  'новая панель появилась после изменения слота',
)
assert.equal(
  togglesOf(auto.page()).find((toggle) => toggle.props['data-dsh-polish-panel-toggle'] === 'fresh').props.checked,
  true,
  'новая панель сразу отмечена включённой',
)
auto.slots.addHostPanel('plugin-fresh', 'Свежая', 35)
assert.equal(
  rowsOf(auto.page()).filter((row) => row.props['data-dsh-polish-panel-row'] === 'fresh').length,
  1,
  'дубль id не рисует вторую строку',
)

// Событие dsh-polish:panels-changed тоже перечитывает слот (даже если слот
// обновился без уведомления подписчиков).
auto.slots.addHostPanel('plugin-silent', 'Тихая', 33, { silent: true })
assert.equal(
  rowIdsOf(auto.page()).includes('silent'),
  false,
  'без уведомления слот ещё не перечитан',
)
window.dispatchEvent(new FakeCustomEvent('dsh-polish:panels-changed'))
assert.equal(
  rowIdsOf(auto.page()).includes('silent'),
  true,
  'событие panels-changed обновляет список панелей',
)

// Плагин выключил панель и снял свою строку из левой панели: панель остаётся
// в карточке (main-панель установленного плагина зарегистрирована), чтобы её
// можно было включить обратно.
const widgetToggleNode = () =>
  togglesOf(auto.page()).find((toggle) => toggle.props['data-dsh-polish-panel-toggle'] === 'widget')
widgetToggleNode().props.onChange({ target: { checked: false } })
auto.slots.removeHostSidebar(auto.hostEntries[2])
assert.equal(
  rowIdsOf(auto.page()).includes('widget'),
  true,
  'выключенная панель установленного плагина не пропадает из карточки',
)
assert.equal(widgetToggleNode().props.checked, false, 'флажок выключенной панели снят')
widgetToggleNode().props.onChange({ target: { checked: true } })
assert.equal(
  readPanelStorage().visible.includes('widget'),
  true,
  'включение из карточки возвращает панель в состояние',
)

// Плагин не установлен (снята и main-панель): в карточке его нет, но меню
// «Ещё» берёт подпись из кэша сессии и умеет вернуть id в pinned.
auto.slots.removeHostPanel(auto.hostEntries[2])
assert.equal(
  rowIdsOf(auto.page()).includes('widget'),
  false,
  'запись выгруженного плагина не показывается в карточке',
)
const autoActions = auto.registrations.find((item) => item.options.name === 'sidebar.panellist.actions')
const cacheMenu = autoActions.component({ entries: [], onDismiss() {} })
const cacheRow = cacheMenu.children.find(
  (node) => node?.props?.['data-dsh-polish-pinnable'] === 'plugin-widget',
)
assert.ok(cacheRow !== undefined, 'видимая-но-не-закреплённая панель есть в «Ещё»')
assert.match(JSON.stringify(cacheRow), /Виджет/, 'подпись снятой панели — из кэша сессии')
cacheRow.children[1].props.onClick()
assert.equal(readPanelStorage().pinned.includes('widget'), true, '«Закрепить» возвращает id в pinned')

/* --- Страховочная регистрация строк панелей ------------------------------ */

const sidebarRegistrationsOf = (regs, panelId) =>
  regs.filter((item) => item.options?.name === 'sidebar.panellist' && item.options?.id === panelId)

// main-панель есть, строки в sidebar.panellist нет: polish сам регистрирует
// закреплённые панели с эмодзи-иконкой (whale 🐳, browser 🌐, незнакомый 🧩).
const emergency = loadPolishPlugin([], undefined, {
  mains: ['plugin-whale', 'plugin-browser', 'plugin-mystery'],
})
const whaleRows = sidebarRegistrationsOf(emergency.registrations, 'plugin-whale')
assert.equal(whaleRows.length, 1, 'страховочная строка whale зарегистрирована')
assert.equal(whaleRows[0].options.order, 29, 'порядок whale — из карты плагинов')
assert.equal(whaleRows[0].options.locale, 'dshPolish', 'подпись из словаря плагина')
assert.equal(typeof whaleRows[0].options.label, 'function', 'подпись — thunk')
assert.equal(whaleRows[0].options.label(), 'Кит-помощник', 'название whale из ru-словаря')
const whaleIcon = whaleRows[0].component({ size: 18 })
assert.equal(whaleIcon.type, 'span', 'иконка — span с эмодзи')
assert.equal(whaleIcon.children[0], '🐳', 'иконка whale — 🐳')
assert.equal(whaleIcon.props.style.fontSize, 18, 'эмодзи 18 px по size prop')
assert.equal(whaleIcon.props.style.width, 18)
assert.equal(whaleRows[0].component({ size: 16 }).props.style.fontSize, 16, 'эмодзи 16 px по size prop')
const browserRows = sidebarRegistrationsOf(emergency.registrations, 'plugin-browser')
assert.equal(browserRows.length, 1, 'страховочная строка browser зарегистрирована')
assert.equal(browserRows[0].options.label(), 'Запуск браузера', 'название browser из словаря')
assert.equal(browserRows[0].component({ size: 16 }).children[0], '🌐', 'иконка browser — 🌐')
const mysteryRows = sidebarRegistrationsOf(emergency.registrations, 'plugin-mystery')
assert.equal(mysteryRows.length, 1, 'незнакомый id тоже получает страховочную строку')
assert.equal(mysteryRows[0].options.label(), 'Mystery', 'имя незнакомого id — человекочитаемое')
assert.equal(mysteryRows[0].component({ size: 16 }).children[0], '🧩', 'эмодзи незнакомого id по умолчанию')
assert.equal(mysteryRows[0].options.order, 200, 'незнакомый id — в конце списка')
window.dispatchEvent(new FakeCustomEvent('dsh-polish:panels-changed'))
window.dispatchEvent(new FakeCustomEvent('dsh-polish:panels-changed'))
assert.equal(
  sidebarRegistrationsOf(emergency.registrations, 'plugin-whale').length,
  1,
  'повторные события не дублируют страховочную строку',
)

// Строка плагина уже есть: polish не вмешивается и не дублирует её.
const naturalRow = loadPolishPlugin(
  [{ id: 'plugin-whale', label: 'Кит-помощник', order: 29 }],
  undefined,
  { mains: ['plugin-whale'] },
)
assert.equal(
  sidebarRegistrationsOf(naturalRow.registrations, 'plugin-whale').length,
  0,
  'при наличии строки плагина страховка не регистрируется',
)

// Выключенная панель: main есть, строки нет — строка не регистрируется;
// включение и закрепление событием возвращает её, повторное выключение снимает.
const hiddenWhaleSaved = { visible: ['polish'], pinned: ['polish'], known: ['polish', 'whale'] }
const hiddenWhale = loadPolishPlugin([], hiddenWhaleSaved, { mains: ['plugin-whale'] })
assert.equal(
  sidebarRegistrationsOf(hiddenWhale.registrations, 'plugin-whale').length,
  0,
  'выключенная панель не страхуется',
)
storage.set(
  PANEL_VISIBILITY_KEY,
  JSON.stringify({ visible: ['polish', 'whale'], pinned: ['polish', 'whale'], known: ['polish', 'whale'] }),
)
window.dispatchEvent(new FakeCustomEvent('dsh-polish:panels-changed'))
assert.equal(
  sidebarRegistrationsOf(hiddenWhale.registrations, 'plugin-whale').length,
  1,
  'после включения и закрепления страховочная строка зарегистрирована',
)
storage.set(
  PANEL_VISIBILITY_KEY,
  JSON.stringify({ visible: ['polish'], pinned: ['polish'], known: ['polish', 'whale'] }),
)
window.dispatchEvent(new FakeCustomEvent('dsh-polish:panels-changed'))
assert.equal(
  sidebarRegistrationsOf(hiddenWhale.registrations, 'plugin-whale').length,
  0,
  'при выключении страховочная строка снимается',
)

// Плагин зарегистрировал настоящую строку после страховки: своя строка снимается.
const takeover = loadPolishPlugin([], undefined, { mains: ['plugin-whale'] })
assert.equal(sidebarRegistrationsOf(takeover.registrations, 'plugin-whale').length, 1)
takeover.slots.addHostSidebar('plugin-whale', 'Кит-помощник', 29)
window.dispatchEvent(new FakeCustomEvent('dsh-polish:panels-changed'))
window.dispatchEvent(new FakeCustomEvent('dsh-polish:panels-changed'))
assert.equal(
  sidebarRegistrationsOf(takeover.registrations, 'plugin-whale').length,
  0,
  'настоящая строка плагина вытесняет страховочную и не возвращается обратно',
)
// Плагин снова снял строку (панель осталась закреплённой) — страховка
// возвращается и берёт панель под контроль.
const naturalSidebarRow = takeover.slots.entries('sidebar.panellist').find((entry) => entry.options?.id === 'plugin-whale')
takeover.slots.removeHostSidebar({ sidebarEntry: naturalSidebarRow })
window.dispatchEvent(new FakeCustomEvent('dsh-polish:panels-changed'))
assert.equal(
  sidebarRegistrationsOf(takeover.registrations, 'plugin-whale').length,
  1,
  'после снятия чужой строки страховка снова регистрирует панель',
)

// Плагин выгрузился (main-панели больше нет): страховочная строка снимается.
const unloaded = loadPolishPlugin([], undefined, { mains: ['plugin-whale'] })
assert.equal(sidebarRegistrationsOf(unloaded.registrations, 'plugin-whale').length, 1)
unloaded.slots.removeHostMain(unloaded.mainEntries[0])
window.dispatchEvent(new FakeCustomEvent('dsh-polish:panels-changed'))
assert.equal(
  sidebarRegistrationsOf(unloaded.registrations, 'plugin-whale').length,
  0,
  'при выгрузке плагина страховочная строка снимается',
)

// Скрытая панель из сохранённого состояния остаётся выключенной, а новая
// зарегистрированная панель вне known — видимой и закреплённой по умолчанию.
const hiddenSaved = {
  visible: ['cards', 'polish'],
  pinned: ['cards', 'polish'],
  known: ['cards', 'polish', 'widget'],
}
const hiddenState = loadPolishPlugin(
  [
    { id: 'plugin-cards', label: 'cards', order: 20 },
    { id: 'plugin-widget', label: 'Виджет', order: 5 },
  ],
  hiddenSaved,
)
assert.equal(
  storage.get(PANEL_VISIBILITY_KEY),
  JSON.stringify(hiddenSaved),
  'сохранённое состояние не перезаписано при загрузке',
)
const hiddenToggles = togglesOf(hiddenState.page())
const hiddenById = new Map(hiddenToggles.map((toggle) => [toggle.props['data-dsh-polish-panel-toggle'], toggle]))
assert.equal(hiddenToggles.length, 3, 'строки: cards, widget и своя polish')
assert.equal(hiddenById.get('cards').props.checked, true, 'включённая панель отмечена')
assert.equal(hiddenById.get('widget').props.checked, false, 'выключенная панель из known осталась выключенной')
const noveltySaved = { visible: ['cards', 'polish'], pinned: ['cards', 'polish'], known: ['cards', 'polish'] }
const freshState = loadPolishPlugin(
  [
    { id: 'plugin-cards', label: 'cards', order: 20 },
    { id: 'plugin-novelty', label: 'Новинка', order: 6 },
  ],
  noveltySaved,
)
const freshToggles = togglesOf(freshState.page())
const freshById = new Map(freshToggles.map((toggle) => [toggle.props['data-dsh-polish-panel-toggle'], toggle]))
assert.equal(freshById.get('novelty').props.checked, true, 'новая панель вне known видна по умолчанию')

// Своя панель выключена и не закреплена: строка в левой панели снята, но
// карточка помнит панель установленного плагина (main регистрируется всегда),
// поэтому её можно включить обратно.
const emptyList = loadPolishPlugin([], { visible: [], pinned: [], known: ['polish'] })
const emptyPage = emptyList.page()
assert.deepEqual(rowIdsOf(emptyPage), ['polish'], 'выключенная своя панель остаётся в карточке')
assert.equal(togglesOf(emptyPage)[0].props.checked, false, 'флажок выключенной своей панели снят')

/* --- Кнопка «Обновить» в подвале левой панели: вид «Новой сессии» -------- */

/** Тело CSS-блока по началу селектора (до первой закрывающей скобки). */
const cssBlock = (source, selector) => {
  const index = source.indexOf(selector)
  assert.ok(index >= 0, `есть CSS-селектор ${selector}`)
  const open = source.indexOf('{', index)
  const close = source.indexOf('}', open)
  return source.slice(open + 1, close)
}

const reloadStart = css.indexOf('/* --- Кнопка «Обновить» в подвале левой панели')
assert.ok(reloadStart >= 0, 'блок кнопки обновления добавлен в глобальный CSS')
const reloadEnd = css.indexOf('/* --- Конец кнопки обновления', reloadStart)
assert.ok(reloadEnd > reloadStart, 'у блока кнопки обновления есть закрывающий маркер')
const reloadCss = css.slice(reloadStart, reloadEnd)

// Геометрия и токены — те же, что у .newSession хоста: фон, рамка, радиус,
// высота, padding, шрифт. Отличается только иконка.
const reloadBase = cssBlock(reloadCss, '[data-dsh-polish-reload] {')
assert.match(reloadBase, /width: 100%/, 'ширина 100 % подвала')
assert.match(reloadBase, /height: 38px/, 'высота 38 px, как у «Новой сессии»')
assert.match(reloadBase, /padding: 8px 12px/, 'padding 8/12, как у «Новой сессии»')
assert.match(
  reloadBase,
  /border: 0\.5px solid var\(--dsw-alias-border-l3\)/,
  'рамка 0.5 px border-l3, как у newSession',
)
assert.match(reloadBase, /border-radius: var\(--dsw-radius-md\)/, 'радиус dsw-radius-md')
assert.match(
  reloadBase,
  /background: var\(--dsw-alias-button-elevated-fill\)/,
  'фон button-elevated-fill, как у newSession',
)
assert.match(reloadBase, /color: var\(--dsw-alias-label-primary\)/, 'цвет label-primary')
assert.match(reloadBase, /font-size: 14px/, 'шрифт 14 px')
assert.match(reloadBase, /font-weight: 500/, 'насыщенность 500')
assert.match(reloadBase, /line-height: 22px/, 'интерлиньяж 22 px')
assert.match(reloadBase, /display: flex/, 'кнопка растягивается на всю ширину')
assert.match(reloadBase, /justify-content: center/, 'содержимое по центру')
assert.match(reloadBase, /filter: none/, 'нет чужого brightness-фильтра при наведении')

// Боковой отступ подвала — как у строки «Новой сессии» (paint inset 3 + 1).
const footerPadding = cssBlock(reloadCss, "[class*='footArea'] [class*='footerActions'] {")
assert.match(
  footerPadding,
  /padding: 0 calc\(var\(--dsh-sidebar-paint-inset, 3px\) \+ 1px\)/,
  'боковой отступ подвала = inset «Новой сессии»',
)
assert.match(
  reloadCss,
  /\[class\*='footArea'\] \[class\*='footerActions'\]/,
  'селектор отступа ограничен подвалом левой панели, чужие footerActions не задеты',
)
const footerRailPadding = cssBlock(reloadCss, "[class*='collapsed'] [class*='footArea'] [class*='footerActions'] {")
assert.match(footerRailPadding, /padding: 0/, 'в свёрнутой панели лишний отступ снят')

// Hover/focus не сломан: те же токены, что у hosting-кнопки.
assert.match(
  reloadCss,
  /\[data-dsh-polish-reload\]:hover:not\(:disabled\) \{\s*background: var\(--dsw-alias-button-floating-hover\)/,
  'hover-фон — button-floating-hover, как у newSession',
)
assert.match(
  reloadCss,
  /\[data-dsh-polish-reload\]:focus-visible \{\s*outline: 2px solid var\(--dsw-alias-brand-primary\);?\s*outline-offset: 2px/,
  'обводка фокуса сохранена',
)

// Состояния: «Обновляется…» (спиннер + disabled-вид), «Готово», «Не удалось».
assert.match(
  reloadCss,
  /\[data-dsh-polish-reload\]\[data-state='loading'\] \{[^}]*cursor: progress/,
  'состояние «Обновляется…»',
)
assert.match(
  reloadCss,
  /\[data-dsh-polish-reload\]\[data-state='loading'\] \[data-dsh-polish-reload-icon\] \{[^}]*animation: dsh-polish-reload-spin/,
  'у «Обновляется…» крутится иконка',
)
assert.match(reloadCss, /@keyframes dsh-polish-reload-spin/, 'есть кадры вращения иконки')
assert.match(
  reloadCss,
  /\[data-dsh-polish-reload\]\[data-state='done'\] \{[^}]*--dsw-alias-state-success-primary/,
  'состояние «Готово» — success-токен',
)
assert.match(
  reloadCss,
  /\[data-dsh-polish-reload\]\[data-state='error'\] \{[^}]*--dsw-alias-state-error-primary/,
  'состояние «Не удалось» — error-токен',
)
assert.match(reloadCss, /@media \(prefers-reduced-motion: reduce\)/, 'спиннер уважает reduced-motion')

// Свёрнутая панель: иконка 36×36 по центру, подпись скрыта.
const reloadCompact = cssBlock(reloadCss, '[data-dsh-polish-reload][data-compact],')
assert.match(reloadCompact, /width: 36px/, 'в рельсе ширина 36 px')
assert.match(reloadCompact, /height: 36px/, 'в рельсе высота 36 px')
assert.match(reloadCompact, /padding: 0/, 'в рельсе без внутренних отступов')
assert.match(reloadCompact, /background: transparent/, 'в рельсе прозрачный фон')
assert.match(
  cssBlock(reloadCss, '[data-dsh-polish-reload][data-compact] [data-dsh-polish-reload-label]'),
  /display: none/,
  'в свёрнутой панели подпись скрыта — иконка по центру',
)

// Регистрация и состав панели: одна кнопка в подвале, панели не тронуты.
const footer = loadPolishPlugin([])
const footerRegistrations = footer.registrations.filter((item) => item.options.name === 'sidebar.footer.action')
assert.equal(footerRegistrations.length, 1, 'в подвале ровно одна кнопка обновления')
assert.equal(footerRegistrations[0].options.id, 'dsh-polish-reload', 'id кнопки обновления')
assert.equal(footerRegistrations[0].options.order, 90, 'порядок кнопки обновления')
assert.equal(
  footer.registrations.filter((item) => item.options.name === 'main').length,
  1,
  'состав панели не менялся: одна своя main-панель',
)
assert.equal(
  footer.registrations.filter((item) => item.options.name === 'sidebar.panellist').length,
  1,
  'состав панели не менялся: одна своя строка',
)

// Раскрытая панель: кнопка с подписью, aria-label и иконкой ↻.
const footerRegister = footerRegistrations[0]
const wideReload = footerRegister.component({ wide: true })
assert.equal(wideReload.type, 'button', 'кнопка обновления — button')
assert.equal(wideReload.props['data-dsh-polish-reload'], 'button', 'data-атрибут кнопки обновления')
assert.equal(wideReload.props['data-state'], 'idle', 'начальное состояние — «Обновить»')
assert.equal(wideReload.props['data-compact'], undefined, 'раскрытая панель — без рельсового флага')
assert.equal(wideReload.props.disabled, false, 'в покое кнопка активна')
assert.match(String(wideReload.props['aria-label']), /Обновить приложение/, 'aria-label «Обновить»')
assert.match(String(wideReload.props.title), /Обновить страницу \(Ctrl\+R\)/, 'подсказка кнопки')
assert.equal(wideReload.children[0].props['data-dsh-polish-reload-icon'], 'icon', 'иконка размечена data-атрибутом')
assert.equal(wideReload.children[0].children[0], '↻', 'иконка обновления ↻')
assert.equal(wideReload.children[1].props['data-dsh-polish-reload-label'], 'label', 'подпись размечена')
assert.equal(wideReload.children[1].children[0], 'Обновить', 'подпись «Обновить»')

// Свёрнутая панель: только иконка, рельсовый флаг.
const railReload = footerRegister.component({ wide: false })
assert.equal(railReload.props['data-compact'], 'true', 'свёрнутая панель — рельсовый флаг')
assert.equal(railReload.children.length, 1, 'в свёрнутой панели остаётся только иконка')
assert.equal(railReload.children[0].props['data-dsh-polish-reload-icon'], 'icon', 'иконка 36×36 по центру')

/* --- Состояния кнопки: запрос к хосту, запасной путь и ошибка ------------ */

/** Подождать миллисекунды (состояние «Обновляется…» держится минимум 320 мс). */
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms) })

/**
 * Мини-рендер с настоящим useState: хук-стор живёт на время одного сценария,
 * повторный рендер видит состояние после клика (fake React сам его не хранит).
 */
async function withReloadState(scenario) {
  const hookSlots = []
  let cursor = 0
  const originalUseState = React.useState
  React.useState = (initial) => {
    const index = cursor
    cursor += 1
    if (!(index in hookSlots)) hookSlots[index] = typeof initial === 'function' ? initial() : initial
    return [hookSlots[index], (next) => {
      hookSlots[index] = typeof next === 'function' ? next(hookSlots[index]) : next
    }]
  }
  const render = (props) => {
    cursor = 0
    return footerRegister.component(props)
  }
  try {
    await scenario(render)
  } finally {
    React.useState = originalUseState
  }
}

const realFetch = globalThis.fetch
const realReload = globalThis.window.location.reload
const reloadCalls = []

/** Тост «идёт работа» в документе (его строит client.js напрямую). */
function reloadWarning() {
  return globalThis.document.body.childNodes.find(
    (node) => node.attrs?.['data-dsh-polish-reload-warning'] !== undefined,
  ) ?? null
}

/** Весь текст поддерева FakeElement. */
function textOf(node) {
  let text = String(node.textContent ?? '')
  for (const child of node.childNodes ?? []) text += ' ' + textOf(child)
  return text
}

/** Все потомки с атрибутом (для кнопки принудительного перезапуска). */
function withAttr(node, name, found = []) {
  if (node.attrs?.[name] !== undefined) found.push(node)
  for (const child of node.childNodes ?? []) withAttr(child, name, found)
  return found
}

globalThis.window.location.reload = () => { reloadCalls.push(Date.now()) }
try {
  // Свободно: сначала проверка занятости, потом маршрут хоста; страницу сами не трогаем.
  const routeCalls = []
  globalThis.fetch = async (url, options) => {
    routeCalls.push({ url: String(url), body: JSON.parse(options?.body ?? '{}') })
    return { ok: true, status: 200, json: async () => ({ ok: true, busy: false, active: [], windows: 1 }) }
  }
  await withReloadState(async (render) => {
    const idle = render({ wide: true })
    assert.equal(idle.props['data-state'], 'idle')
    idle.props.onClick()
    assert.equal(routeCalls.length, 1, 'сначала один запрос — проверка занятости')
    assert.equal(routeCalls[0].url, '/api/dsh-polish/reload', 'проверка идёт на маршрут перезагрузки')
    assert.equal(routeCalls[0].body.check, true, 'первый запрос только проверяет, без перезагрузки')
    assert.equal(render({ wide: true }).props['data-state'], 'idle', 'проверка не включает «Обновляется…»')
    await sleep(20)
    const loading = render({ wide: true })
    assert.equal(loading.props['data-state'], 'loading', 'свободно — «Обновляется…»')
    assert.equal(loading.props.disabled, true, 'на время обновления кнопка неактивна')
    assert.equal(loading.props['aria-busy'], 'true', 'aria-busy на время обновления')
    assert.equal(loading.children[0].children[0], '↻', 'в процессе — иконка ↻')
    assert.equal(loading.children[1].children[0], 'Обновляется…', 'подпись «Обновляется…»')
    assert.equal(routeCalls.length, 2, 'второй запрос — сама перезагрузка')
    assert.equal(routeCalls[1].body.check, undefined, 'второй запрос — уже не проверка')
    assert.equal(routeCalls[1].body.force, undefined, 'без force, когда никто не работает')
    assert.equal(reloadCalls.length, 0, 'при успешном маршруте страницу сами не трогаем')
    await sleep(420)
    const done = render({ wide: true })
    assert.equal(done.props['data-state'], 'done', 'после ответа хоста — «Готово»')
    assert.equal(done.props.disabled, false, 'кнопка снова активна')
    assert.equal(done.children[0].children[0], '✓', 'в «Готово» — галочка')
    assert.equal(done.children[1].children[0], 'Готово', 'подпись «Готово»')
    assert.equal(reloadCalls.length, 0, 'хост перезагружает окно сам — запасной путь не нужен')
  })

  // Занято: busy-ответ, предупреждение со списком, reload не вызывается;
  // второй клик по кнопке — уже явный force и перезагрузка.
  const busyActive = [
    { sessionId: 's-1', title: 'Пишу отчёт', kind: 'session' },
    { sessionId: 's-2', title: 'Ревью кода', kind: 'subagent' },
    { sessionId: 's-3', title: 'Сборка проекта', kind: 'job' },
  ]
  const busyMessage = 'Идёт работа: дождитесь завершения'
  routeCalls.length = 0
  reloadCalls.length = 0
  globalThis.fetch = async (url, options) => {
    const body = JSON.parse(options?.body ?? '{}')
    routeCalls.push({ url: String(url), body })
    if (body.check === true) {
      return { ok: true, status: 200, json: async () => ({ ok: true, busy: true, active: busyActive, message: busyMessage }) }
    }
    if (body.force === true) {
      return { ok: true, status: 200, json: async () => ({ ok: true, busy: true, forced: true, active: busyActive, windows: 1 }) }
    }
    return { ok: true, status: 200, json: async () => ({ ok: false, busy: true, active: busyActive, message: busyMessage }) }
  }
  await withReloadState(async (render) => {
    render({ wide: true }).props.onClick()
    assert.equal(render({ wide: true }).props['data-state'], 'idle', 'занятость проверяется без loading')
    await sleep(20)
    const busy = render({ wide: true })
    assert.equal(busy.props['data-state'], 'busy', 'занято — состояние busy, а не loading')
    assert.equal(busy.props.disabled, false, 'при busy кнопка активна: второй клик — подтверждение')
    assert.equal(busy.props['aria-busy'], undefined, 'при busy нет aria-busy')
    assert.equal(busy.children[0].children[0], '⚠', 'при busy — предупреждающая иконка')
    assert.equal(busy.children[1].children[0], 'Всё равно перезапустить', 'подпись второго клика')
    assert.match(String(busy.props.title), /прервёт открытые ходы/, 'подсказка про риск перезапуска')
    assert.equal(reloadCalls.length, 0, 'busy не вызывает reload страницы')
    // Рендер предупреждения: тост со списком активных сессий.
    const warning = reloadWarning()
    assert.ok(warning !== null, 'предупреждение добавлено в документ')
    assert.equal(warning.attrs.role, 'alert', 'предупреждение — role=alert')
    const warningText = textOf(warning)
    for (const part of ['Идёт работа', 'Пишу отчёт', 'Ревью кода', 'Сборка проекта', 'Сессия', 'Субагент', 'Фоновая задача']) {
      assert.ok(warningText.includes(part), `в предупреждении есть «${part}»`)
    }
    const forceButtons = withAttr(warning, 'data-dsh-polish-reload-force')
    assert.equal(forceButtons.length, 1, 'в предупреждении одна кнопка «Всё равно перезапустить»')
    assert.equal(forceButtons[0].textContent, 'Всё равно перезапустить', 'текст кнопки подтверждения')
    // Второй клик по самой кнопке подвала — явное подтверждение force.
    busy.props.onClick()
    assert.equal(render({ wide: true }).props['data-state'], 'loading', 'второй клик — уже перезагрузка')
    await sleep(420)
    const forcedCall = routeCalls[routeCalls.length - 1]
    assert.equal(forcedCall.body.force, true, 'force-подтверждение уходит на хост')
    assert.equal(render({ wide: true }).props['data-state'], 'done', 'после force — «Готово»')
    assert.equal(reloadCalls.length, 0, 'перезагрузку делает хост по маршруту')
    assert.equal(reloadWarning(), null, 'после перезагрузки предупреждение убрано')
  })

  // Занято, но force нажат в самом предупреждении — тот же явный путь.
  routeCalls.length = 0
  reloadCalls.length = 0
  await withReloadState(async (render) => {
    render({ wide: true }).props.onClick()
    await sleep(20)
    const warning = reloadWarning()
    assert.ok(warning !== null, 'предупреждение показано до force')
    withAttr(warning, 'data-dsh-polish-reload-force')[0].dispatch('click')
    assert.equal(render({ wide: true }).props['data-state'], 'loading', 'кнопка в тосте тоже перезагружает с force')
    await sleep(420)
    assert.equal(routeCalls[routeCalls.length - 1].body.force, true, 'force из тоста')
    assert.equal(render({ wide: true }).props['data-state'], 'done', 'тост-боттон: «Готово»')
    assert.equal(reloadCalls.length, 0, 'тост не трогает location.reload')
  })

  // Хост отложил Ctrl+R/F5 и прислал событие — клиент показывает то же
  // предупреждение, а его force-кнопка перезагружает через маршрут с force.
  routeCalls.length = 0
  reloadCalls.length = 0
  globalThis.window.dispatchEvent(new globalThis.window.CustomEvent('dsh-polish:reload-blocked', {
    detail: { active: [{ sessionId: 's-9', title: 'Отчёт по задаче', kind: 'session' }] },
  }))
  const blockedWarning = reloadWarning()
  assert.ok(blockedWarning !== null, 'событие хоста показывает предупреждение о работе')
  assert.ok(textOf(blockedWarning).includes('Отчёт по задаче'), 'в предупреждении из события есть название сессии')
  assert.equal(reloadCalls.length, 0, 'событие хоста не перезагружает страницу само')
  withAttr(blockedWarning, 'data-dsh-polish-reload-force')[0].dispatch('click')
  await sleep(20)
  assert.equal(routeCalls[routeCalls.length - 1].body.force, true, 'force из предупреждения по событию')
  assert.equal(reloadCalls.length, 0, 'перезагрузку делает хост по маршруту')

  // Ошибка: маршрут недоступен, страница тоже не перезагружается.
  globalThis.fetch = async () => { throw new Error('нет сети') }
  globalThis.window.location.reload = () => { throw new Error('перезагрузка запрещена') }
  await withReloadState(async (render) => {
    const idle = render({ wide: true })
    idle.props.onClick()
    await sleep(20)
    const loading = render({ wide: true })
    assert.equal(loading.props['data-state'], 'loading', 'клик — «Обновляется…» и при недоступном хосте')
    await sleep(420)
    const failed = render({ wide: true })
    assert.equal(failed.props['data-state'], 'error', 'неудача — «Не удалось»')
    assert.equal(failed.children[0].children[0], '!', 'в ошибке — «!»')
    assert.equal(failed.children[1].children[0], 'Не удалось', 'подпись «Не удалось»')
    assert.match(String(failed.props.title), /Не удалось: нет сети/, 'причина ошибки — в title')
  })

  // Запасной путь: маршрута нет (старый хост), но страница перезагружается сама.
  reloadCalls.length = 0
  globalThis.fetch = async () => { throw new Error('маршрут недоступен') }
  globalThis.window.location.reload = () => { reloadCalls.push(Date.now()) }
  await withReloadState(async (render) => {
    render({ wide: true }).props.onClick()
    await sleep(420)
    assert.equal(reloadCalls.length, 1, 'без маршрута страница перезагружается сама')
    assert.equal(render({ wide: true }).props['data-state'], 'done', 'запасной путь — тоже «Готово»')
  })
} finally {
  globalThis.fetch = realFetch
  globalThis.window.location.reload = realReload
}

// Локали: подписи состояний есть в обеих словарных парах.
assert.equal(registeredLocales.ru.reloading, 'Обновляется…', 'ru: «Обновляется…»')
assert.equal(registeredLocales.ru.reloadDone, 'Готово', 'ru: «Готово»')
assert.equal(registeredLocales.ru.reloadFailed, 'Не удалось', 'ru: «Не удалось»')
assert.equal(registeredLocales.ru.reload, 'Обновить', 'ru: «Обновить»')
assert.equal(registeredLocales.ru.reloadBusy, 'Идёт работа: дождитесь завершения', 'ru: текст занятости')
assert.equal(registeredLocales.ru.reloadForce, 'Всё равно перезапустить', 'ru: второй клик force')
assert.equal(registeredLocales.en.reloading, 'Refreshing…', 'en: «Refreshing…»')
assert.equal(registeredLocales.en.reloadDone, 'Done', 'en: «Done»')
assert.equal(registeredLocales.en.reloadFailed, 'Failed', 'en: «Failed»')
assert.equal(registeredLocales.en.reloadBusy, 'Work in progress: wait until it finishes', 'en: текст занятости')
assert.equal(registeredLocales.en.reloadForce, 'Reload anyway', 'en: второй клик force')

// Клиент: проверка занятости до перезагрузки, единый защищённый путь.
assert.match(source, /body: JSON\.stringify\(\{ check: true \}\)/, 'клиент сначала спрашивает о занятости')
assert.match(source, /body: JSON\.stringify\(force === true \? \{ force: true \} : \{\}\)/, 'force уходит только по подтверждению')
assert.match(source, /const RELOAD_WARNING_FLAG = 'data-dsh-polish-reload-warning'/, 'предупреждение размечено data-атрибутом')
assert.match(source, /async function requestGuardedReload\(\)/, 'общий защищённый путь reload')
assert.equal(
  (source.match(/void requestGuardedReload\(\)/g) ?? []).length >= 2,
  true,
  'защищённый путь используют кнопка страницы и Ctrl+R',
)

// Хост-часть: маршрут перезагрузки зарегистрирован, состав панели не меняется.
const hostSource = await readFile(new URL('../index.js', import.meta.url), 'utf8')
assert.match(hostSource, /const RELOAD_PATH = '\/api\/dsh-polish\/reload'/, 'хост знает путь перезагрузки')
assert.match(hostSource, /path: RELOAD_PATH/, 'маршрут перезагрузки зарегистрирован')
assert.match(hostSource, /scheduleWindowReload/, 'хост перезагружает окна с задержкой после ответа')
assert.match(hostSource, /export const RELOAD_BUSY_MESSAGE = 'Идёт работа: дождитесь завершения'/, 'хост знает текст занятости')
assert.match(hostSource, /export async function collectActiveWork\(ctx\)/, 'хост собирает активную работу')
assert.match(hostSource, /export async function handleReloadRequest\(ctx, body/, 'хост проверяет занятость до перезагрузки')
assert.match(hostSource, /active: guard\.active, message: RELOAD_BUSY_MESSAGE/, 'busy-ответ содержит список активных')
assert.match(hostSource, /force: true/, 'force-параметр есть в инструменте/маршруте')
assert.match(hostSource, /export const RELOAD_BLOCKED_EVENT = 'dsh-polish:reload-blocked'/, 'хост умеет сообщать об отложенном Ctrl+R/F5')
assert.match(hostSource, /async function guardedWindowReload\(contents, ctx\)/, 'Ctrl+R/F5 в окне идут через проверку занятости')
assert.match(source, /const RELOAD_BLOCKED_EVENT = 'dsh-polish:reload-blocked'/, 'клиент слушает событие отложенной перезагрузки')
assert.match(source, /window\.addEventListener\(RELOAD_BLOCKED_EVENT, onBlocked, true\)/, 'клиент подписан на событие хоста')

// Эмодзи-иконки и hover/focus не сломаны: правила на месте.
assert.match(css, /nav button\[data-dsh-panel-emoji\] \[class\*="panelGlyph"\] svg/, 'эмодзи-иконки левой панели на месте')
assert.match(css, /button:not\(:disabled\):not\(\[aria-disabled='true'\]\):not\(\[data-dsh-polish-button\]\)/, 'общий hover кнопок не сломан')

// После всех перезагрузок возвращаем окно и состояние первого теста.
storage.set(
  PANEL_VISIBILITY_KEY,
  JSON.stringify({ visible: SHORTCUT_IDS, pinned: SHORTCUT_IDS }),
)


console.log('polish smoke: OK')
console.log('  стили:', css.split('\n').length, 'строк | карточка:', inner.children.length, 'элементов')
console.log('  описание:', 'свёрнуто, шеврон, localStorage:', baseKey, '|', docKey)
console.log('  документ:', 'скрыт data-detail-document, без дублей, restore очищает разметку')
console.log('  страница:', 'maxWidth 960, шапка 🎨, чип, «Обновить», карточек:', cards.length, ', адаптив')
console.log('  выравнивание:', 'text-align justify + hyphens auto; код, таблицы и списки исключены')
console.log(
  '  hover/focus:',
  'кнопки, поля, списки, вкладки, ссылки, чекбоксы, переключатели, строки и карточки; transition 120ms; disabled и pre/code исключены',
)
console.log(
  '  кнопка «Обновить»:',
  'как «Новая сессия»: 38 px, рамка 0.5 border-l3, радиус dsw-radius-md, фон button-elevated-fill, ширина 100 %, шрифт 14/500; проверка занятости без loading, занято — «Идёт работа / Всё равно перезапустить» + предупреждение со списком, свободно — «Обновляется…/Готово/Не удалось», рельс 36×36, маршрут reload (check/force) + запасной путь',
)
console.log(
  '  панели:',
  'список из ctx.slots.entriesOfSlot(sidebar.panellist), порядок по order, новые id с переключателем и дефолтом visible+pinned без записи ключа; своя main plugin-polish без блоков плагин-менеджера',
)
console.log(
  '  видимость:',
  'localStorage dsh-polish:panel-visibility {visible,pinned,known}, событие dsh-polish:panels-changed с detail {visible,pinned}, «Ещё» и «Закрепить все (N)», без дублей',
)
console.log(
  '  авто-обнаружение:',
  'entriesOfSlot, новый id, переключение, dispatch, сортировка по order, без дублей, снятые панели скрыты, записи сохранены',
)
console.log(
  '  страховка:',
  'main без строки sidebar.panellist → своя строка с эмодзи-иконкой (🐳/🌐/🧩, 16/18 px); без дублей, снимается при выключении/выгрузке, настоящая строка вытесняет страховочную',
)
console.log('  эмодзи-иконки:', PANEL_EMOJI_CASES.length, 'меток ru/en, data-dsh-panel-emoji на nav, observer и cleanup')
