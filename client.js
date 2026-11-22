/**
 * Browser half of `dsh-polish`.
 *
 * Один слой оформления на всё приложение: подсветка наведения на кнопках,
 * заметная обводка фокуса и правильный `color-scheme` для нативных полей.
 * Работает поверх любых плагинов, потому что не полагается на их классы —
 * только на теги и на `filter`, который не спорит с их собственными цветами.
 */
window.__ModuleLoader__.load({
  id: 'dsh-polish',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')
    const h = React.createElement

    const NS = 'dshPolish'
    const STORAGE_KEY = 'dsh-polish:enabled'
    const UPDATES_PATH = '/api/dsh-polish/updates'
    const HEALTH_PATH = '/api/dsh-polish/health'
    const FIX_PATH = '/api/dsh-polish/fix'
    const LOG_PATH = '/api/dsh-polish/log'
    const UPDATE_ALL_PATH = '/api/dsh-polish/update-all'
    const DESC_OPEN_PREFIX = 'dsh-polish:desc-open:'
    const DESC_FLAG = 'data-dsh-polish-desc'
    const DOC_FLAG = 'data-dsh-polish-doc'
    const DOC_BAR_FLAG = 'data-dsh-polish-doc-bar'
    const DOC_SELECTOR = '[data-detail-document]'
    // Шеврон вниз; при .is-open CSS поворачивает его на 180°.
    const CHEVRON_SVG =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">' +
      '<path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>'

    const en = {
      title: 'Interface polish',
      heading: 'Appearance of all plugins',
      hint: 'Highlights buttons on hover, draws a visible keyboard focus ring, and keeps native fields readable in both themes. Applies to every plugin, including third-party ones.',
      switchLabel: 'Hover highlight and focus ring',
      on: 'Enabled',
      off: 'Disabled',
      desc: 'Description',
      descOpen: 'Collapse description',
      descClosed: 'Expand description',
      descDoc: 'Detailed description',
      descDocOpen: 'Collapse detailed description',
      descDocClosed: 'Expand detailed description',
    }
    const ru = {
      reload: 'Обновить',
      title: 'Оформление интерфейса',
      heading: 'Внешний вид всех плагинов',
      hint: 'Подсвечивает кнопки при наведении, рисует заметную обводку фокуса и держит нативные поля читаемыми в обеих темах. Действует на все плагины, включая сторонние.',
      switchLabel: 'Подсветка наведения и фокус',
      on: 'Включено',
      off: 'Выключено',
      desc: 'Описание',
      descOpen: 'Свернуть описание',
      descClosed: 'Развернуть описание',
      descDoc: 'Подробное описание',
      descDocOpen: 'Свернуть подробное описание',
      descDocClosed: 'Развернуть подробное описание',
    }

    const CSS = `

/* Единый вид карточек наших плагинов. */
.dsh-our-card {
  padding: 12px !important;
  border-radius: 10px !important;
  border: 1px solid rgba(128, 128, 128, 0.22) !important;
  background: rgba(128, 128, 128, 0.05) !important;
}
.dsh-our-card button {
  min-height: 26px;
  border-radius: 8px !important;
}

/* --- dsh-polish ------------------------------------------------------- */
button:not(:disabled) {
  transition: filter .12s ease, background-color .12s ease, border-color .12s ease;
}
button:hover:not(:disabled) {
  filter: brightness(1.14);
}
button:active:not(:disabled) {
  filter: brightness(0.92);
}
button:disabled {
  cursor: default;
  opacity: .6;
}
button:focus-visible,
[role='button']:focus-visible,
a:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 2px solid rgba(84, 126, 214, 0.75);
  outline-offset: 2px;
}
input,
select,
textarea {
  color-scheme: inherit;
}
/* Выпадающий список нативного select берёт цвета из схемы темы. */
select option {
  background-color: Canvas;
  color: CanvasText;
}
select option:checked {
  background-color: Highlight;
  color: HighlightText;
}
/* Полосы прокрутки внутри плагинов не должны выбиваться из темы. */
* {
  scrollbar-color: rgba(128, 128, 128, 0.45) transparent;
}

/* Страница плагина: сначала блок управления, затем описание. */
[class*="detailMain"] {
  display: flex !important;
  flex-direction: column !important;
}
[class*="detailMain"] > [class*="detailSections"] {
  order: 1 !important;
  margin-top: 8px !important;
}
[class*="detailMain"] > [class*="detailDesc"] {
  order: 2 !important;
  margin-top: 8px !important;
}
[class*="detailMain"] > [class*="detailTitle"],
[class*="detailMain"] > [class*="titleRow"] {
  order: 0 !important;
}

/* Описание плагина: строка-переключатель и свёрнутое тело.
   Цвета нейтральные (rgba(128,128,128)) и currentColor — работают в обеих темах. */
.dsh-polish-desc-bar {
  display: flex !important;
  align-items: center;
  gap: 8px;
  width: 100%;
  box-sizing: border-box;
  margin: 0 0 8px;
  padding: 7px 10px;
  border: 1px solid rgba(128, 128, 128, 0.22);
  border-radius: 8px;
  background: rgba(128, 128, 128, 0.06);
  color: inherit;
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  line-height: 1.3;
  text-align: left;
  cursor: pointer;
  user-select: none;
  transition: background-color .12s ease, border-color .12s ease;
}
.dsh-polish-desc-bar:hover {
  background: rgba(128, 128, 128, 0.12);
  filter: none;
}
.dsh-polish-desc-bar:focus-visible {
  outline: 2px solid rgba(84, 126, 214, 0.75);
  outline-offset: 2px;
}
.dsh-polish-desc-label {
  flex: 0 0 auto;
}
.dsh-polish-desc-chevron {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-left: auto;
  transition: transform .18s ease;
}
.dsh-polish-desc-bar.is-open .dsh-polish-desc-chevron {
  transform: rotate(180deg);
}
.dsh-polish-desc-body {
  display: none;
}
[class*="detailDesc"].is-open > .dsh-polish-desc-body {
  display: block;
}

/* Подробное описание плагина (README/DETAIL.md): скрыто, пока не открыто. */
[data-detail-document].dsh-polish-doc-hidden {
  display: none !important;
}
`


    /**
     * Тема нативных контролов: DSH не выставляет color-scheme, поэтому
     * выпадающие списки остаются светлыми в тёмной теме. Определяем схему по
     * фактическому фону страницы и применяем ко всему документу.
     */
    function themeScheme() {
      try {
        const background = getComputedStyle(document.body).backgroundColor
        const parts = background.match(/[0-9.]+/g)
        if (parts === null || parts.length < 3) return 'dark'
        const [r, g, b] = parts.map(Number)
        return r * 0.299 + g * 0.587 + b * 0.114 > 140 ? 'light' : 'dark'
      } catch {
        return 'dark'
      }
    }

    /** Проставить схему и следить за сменой темы. */
    function watchTheme() {
      const apply = () => {
        try {
          document.documentElement.style.colorScheme = themeScheme()
        } catch {
          // вне браузера — нечего настраивать
        }
      }
      apply()
      try {
        const observer = new MutationObserver(apply)
        observer.observe(document.body, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] })
        return () => observer.disconnect()
      } catch {
        return () => {}
      }
    }

    function isEnabled() {
      try {
        return localStorage.getItem(STORAGE_KEY) !== '0'
      } catch {
        return true
      }
    }

    /** Поставить слой стилей (идемпотентно). */
    function installStyles() {
      try {
        if (document.querySelector('style[data-plugin="dsh-polish"]') !== null) return
        const tag = document.createElement('style')
        tag.dataset.plugin = 'dsh-polish'
        tag.textContent = CSS
        document.head.appendChild(tag)
      } catch {
        // вне браузера стили не нужны
      }
    }

    /** Убрать слой стилей. */
    function removeStyles() {
      try {
        const tag = document.querySelector('style[data-plugin="dsh-polish"]')
        if (tag !== null) tag.remove()
      } catch {
        // нечего убирать
      }
    }

    /** Ctrl+R / F5 обновляют страницу: в Electron по умолчанию такого сочетания нет. */
    function installReloadShortcut(ctx) {
      try {
        ctx.effect(() => {
          if (typeof window.addEventListener !== 'function') return () => {}
          const handler = (event) => {
            if (event.altKey === true) return
            const key = String(event.key ?? '').toLowerCase()
            const code = String(event.code ?? '')
            const withControl = event.ctrlKey === true || event.metaKey === true
            const isReload = withControl && (key === 'r' || key === 'к' || code === 'KeyR')
            const isF5 = event.key === 'F5' || code === 'F5'
            if (!isReload && !isF5) return
            event.preventDefault()
            event.stopPropagation()
            window.location.reload()
          }
          window.addEventListener('keydown', handler, true)
          return () => window.removeEventListener('keydown', handler, true)
        }, 'dsh-polish: reload shortcut')
      } catch (error) {
        console.error('[dsh-polish] сочетание обновления недоступно:', error)
      }
    }

    function applyStyles(ctx) {
      try {
        ctx.effect(() => {
          if (isEnabled()) installStyles()
          return () => removeStyles()
        }, 'dsh-polish: styles')
      } catch (error) {
        console.error('[dsh-polish] стили недоступны:', error)
      }
    }

    /* --- Сворачиваемое описание на странице плагина ---------------------- */

    /** Классы хоста — CSS-модули: хеш впереди (`V7pFBG_detailDesc`). */
    function classTokens(element) {
      const name = typeof element?.className === 'string' ? element.className : ''
      return name.split(/\s+/).filter(Boolean)
    }

    function hasClassPrefix(element, prefix) {
      return classTokens(element).some((token) => token === prefix || token.includes(prefix))
    }

    function detailMainOf(element) {
      let node = element?.parentElement
      while (node !== null && node !== undefined) {
        if (hasClassPrefix(node, 'detailMain')) return node
        node = node.parentElement
      }
      return null
    }

    function findFirstByPrefix(element, prefix) {
      for (const node of childNodesOf(element)) {
        if (node?.nodeType !== 1) continue
        if (hasClassPrefix(node, prefix)) return node
        const nested = findFirstByPrefix(node, prefix)
        if (nested !== null) return nested
      }
      return null
    }

    /** Ближайший заголовок плагина: у detailDesc он в detailMain, у документа — выше. */
    function titleFor(element) {
      let node = element?.parentElement
      while (node !== null && node !== undefined) {
        const title = findFirstByPrefix(node, 'detailTitle')
        if (title !== null) return title
        node = node.parentElement
      }
      return document.querySelector('[class*="detailTitle"]')
    }

    /** Короткий стабильный ключ памяти: заголовок плагина, иначе путь. */
    function detailKey(element) {
      try {
        const title = titleFor(element)
        const name = String(title?.textContent ?? '').trim()
        if (name !== '') return DESC_OPEN_PREFIX + hashText(name)
        const path = String(window.location?.pathname ?? '') + String(window.location?.hash ?? '')
        return DESC_OPEN_PREFIX + hashText(path === '' ? 'plugin' : path)
      } catch {
        return DESC_OPEN_PREFIX + 'plugin'
      }
    }

    /** Описание плагина — только `detailDesc*` внутри `detailMain*`. */
    function isPluginDesc(desc) {
      return hasClassPrefix(desc, 'detailDesc') && detailMainOf(desc) !== null
    }

    function hashText(text) {
      let value = 5381
      for (let index = 0; index < text.length; index += 1) {
        value = ((value << 5) + value + text.charCodeAt(index)) >>> 0
      }
      return value.toString(36)
    }

    function readDescOpen(key) {
      try {
        return localStorage.getItem(key) === '1'
      } catch {
        return false
      }
    }

    function saveDescOpen(key, open) {
      try {
        localStorage.setItem(key, open ? '1' : '0')
      } catch {
        // без хранилища состояние живёт до перезагрузки страницы
      }
    }

    /** Дочерние узлы без живой HTMLCollection — удобнее обходить и переносить. */
    function childNodesOf(element) {
      const nodes = []
      const live = element?.childNodes
      if (live === undefined || live === null) return nodes
      for (let index = 0; index < live.length; index += 1) nodes.push(live[index])
      return nodes
    }

    function findChild(element, className) {
      for (const node of childNodesOf(element)) {
        if (node?.nodeType !== 1 || typeof node.className !== 'string') continue
        if (node.className.split(/\s+/).includes(className)) return node
      }
      return null
    }

    function hasExactClass(element, className) {
      return classTokens(element).includes(className)
    }

    /**
     * Состояние панели: `is-open` на контейнере и на строке, а для подробного
     * описания ещё и скрывающий класс на самом блоке.
     */
    function setCollapseState(box, bar, open, kind) {
      if (box !== null) {
        if (open) box.classList.add('is-open')
        else box.classList.remove('is-open')
      }
      if (bar !== null) {
        if (open) bar.classList.add('is-open')
        else bar.classList.remove('is-open')
        bar.setAttribute('aria-expanded', open ? 'true' : 'false')
        const doc = kind === 'doc'
        const label = open
          ? translate(doc ? 'descDocOpen' : 'descOpen')
          : translate(doc ? 'descDocClosed' : 'descClosed')
        bar.setAttribute('aria-label', label)
        bar.title = label
      }
      if (kind === 'doc' && box !== null) {
        if (open) box.classList.remove('dsh-polish-doc-hidden')
        else box.classList.add('dsh-polish-doc-hidden')
      }
    }

    /** Строка-переключатель: подпись слева, шеврон справа. */
    function createBar(box, key, kind) {
      const doc = kind === 'doc'
      const bar = document.createElement('div')
      bar.className = 'dsh-polish-desc-bar'
      bar.setAttribute('role', 'button')
      bar.setAttribute('tabindex', '0')
      bar.dataset.descKey = key
      if (doc) bar.setAttribute(DOC_BAR_FLAG, '')
      const caption = document.createElement('span')
      caption.className = 'dsh-polish-desc-label'
      caption.textContent = translate(doc ? 'descDoc' : 'desc')
      const chevron = document.createElement('span')
      chevron.className = 'dsh-polish-desc-chevron'
      chevron.setAttribute('aria-hidden', 'true')
      chevron.innerHTML = CHEVRON_SVG
      bar.appendChild(caption)
      bar.appendChild(chevron)

      const toggle = (event) => {
        try {
          event?.preventDefault?.()
          event?.stopPropagation?.()
        } catch {
          // событие может быть синтетическим
        }
        const currentKey = typeof bar.dataset?.descKey === 'string' ? bar.dataset.descKey : key
        const open = !bar.classList.contains('is-open')
        saveDescOpen(currentKey, open)
        setCollapseState(box, bar, open, kind)
      }
      bar.addEventListener('click', toggle)
      bar.addEventListener('keydown', (event) => {
        const pressed = String(event?.key ?? '')
        if (pressed !== 'Enter' && pressed !== ' ' && pressed !== 'Spacebar') return
        toggle(event)
      })
      return bar
    }

    /** Привести один блок описания к свёрнутому виду; повторный вызов безопасен. */
    function ensureDescCollapse(desc) {
      const key = detailKey(desc)
      const open = readDescOpen(key)
      let bar = findChild(desc, 'dsh-polish-desc-bar')
      let body = findChild(desc, 'dsh-polish-desc-body')

      if (body === null) {
        body = document.createElement('div')
        body.className = 'dsh-polish-desc-body'
        while (desc.firstChild !== null && desc.firstChild !== undefined) {
          body.appendChild(desc.firstChild)
        }
        desc.appendChild(body)
      } else {
        // React мог добавить содержимое мимо обёртки — вернуть его в тело,
        // чтобы текст не вылезал из свёрнутого блока.
        for (const node of childNodesOf(desc)) {
          if (node !== bar && node !== body) body.appendChild(node)
        }
      }

      if (bar === null) {
        bar = createBar(desc, key, 'desc')
        desc.insertBefore(bar, body)
      } else {
        bar.dataset.descKey = key
        const caption = findChild(bar, 'dsh-polish-desc-label')
        const label = translate('desc')
        if (caption !== null && caption.textContent !== label) caption.textContent = label
      }

      setCollapseState(desc, bar, open, 'desc')
      desc.setAttribute(DESC_FLAG, '')
      return true
    }

    /** Строка подробного описания стоит прямо перед секцией документа. */
    function docBarOf(doc) {
      const previous = doc?.previousElementSibling
      if (previous === null || previous === undefined) return null
      if (hasExactClass(previous, 'dsh-polish-desc-bar') === false) return null
      return previous.getAttribute(DOC_BAR_FLAG) === null ? null : previous
    }

    /** Привести подробное описание (README/DETAIL.md) к свёрнутому виду. */
    function ensureDocCollapse(doc) {
      const key = detailKey(doc) + ':doc'
      const open = readDescOpen(key)
      let bar = docBarOf(doc)
      if (bar === null) {
        const parent = doc.parentElement
        if (parent === null || parent === undefined) return false
        bar = createBar(doc, key, 'doc')
        parent.insertBefore(bar, doc)
      } else {
        bar.dataset.descKey = key
        const caption = findChild(bar, 'dsh-polish-desc-label')
        const label = translate('descDoc')
        if (caption !== null && caption.textContent !== label) caption.textContent = label
      }
      setCollapseState(doc, bar, open, 'doc')
      doc.setAttribute(DOC_FLAG, '')
      return true
    }

    /** Разложить шевроны по всем описаниям и документам на странице. */
    function applyDetailCollapseOnce() {
      let descs
      let docs
      try {
        descs = Array.from(document.querySelectorAll('[class*="detailDesc"]'))
        docs = Array.from(document.querySelectorAll(DOC_SELECTOR))
      } catch {
        return 0
      }
      let count = 0
      for (const desc of descs) {
        try {
          if (isPluginDesc(desc) === false) continue
          if (ensureDescCollapse(desc) === true) count += 1
        } catch (error) {
          console.error('[dsh-polish] описание плагина не свернулось:', error)
        }
      }
      for (const doc of docs) {
        try {
          if (ensureDocCollapse(doc) === true) count += 1
        } catch (error) {
          console.error('[dsh-polish] подробное описание не свернулось:', error)
        }
      }
      return count
    }

    const descLayer = { observer: null, timer: 0 }

    function scheduleDetailCollapse() {
      if (descLayer.timer !== 0) {
        try {
          clearTimeout(descLayer.timer)
        } catch {
          // таймер уже сработал
        }
      }
      descLayer.timer = setTimeout(() => {
        descLayer.timer = 0
        applyDetailCollapseOnce()
      }, 250)
    }

    /** Включить свёрнутое описание и следить за перерисовками React. */
    function startDetailCollapse() {
      if (descLayer.observer !== null) return
      applyDetailCollapseOnce()
      try {
        const observer = new MutationObserver(() => scheduleDetailCollapse())
        observer.observe(document.body, { childList: true, subtree: true })
        descLayer.observer = observer
      } catch (error) {
        console.error('[dsh-polish] наблюдение за страницей плагина недоступно:', error)
      }
    }

    /** Вернуть разметку как была (при выключении оформления). */
    function restoreDetailCollapse() {
      try {
        for (const desc of document.querySelectorAll('[' + DESC_FLAG + ']')) {
          const bar = findChild(desc, 'dsh-polish-desc-bar')
          const body = findChild(desc, 'dsh-polish-desc-body')
          if (body !== null) {
            for (const node of childNodesOf(body)) desc.appendChild(node)
            body.remove()
          }
          if (bar !== null) bar.remove()
          desc.classList.remove('is-open')
          desc.removeAttribute(DESC_FLAG)
        }
      } catch {
        // вне браузера возвращать нечего
      }
      try {
        for (const doc of document.querySelectorAll('[' + DOC_FLAG + ']')) {
          const bar = docBarOf(doc)
          if (bar !== null) bar.remove()
          doc.classList.remove('is-open')
          doc.classList.remove('dsh-polish-doc-hidden')
          doc.removeAttribute(DOC_FLAG)
        }
      } catch {
        // документа на странице нет
      }
    }

    /** Выключить слой и убрать его разметку. */
    function stopDetailCollapse() {
      if (descLayer.observer !== null) {
        try {
          descLayer.observer.disconnect()
        } catch {
          // observer уже отключён
        }
        descLayer.observer = null
      }
      if (descLayer.timer !== 0) {
        try {
          clearTimeout(descLayer.timer)
        } catch {
          // таймер уже сработал
        }
        descLayer.timer = 0
      }
      restoreDetailCollapse()
    }

    function applyDetailCollapse(ctx) {
      try {
        ctx.effect(() => {
          try {
            if (isEnabled()) startDetailCollapse()
          } catch (error) {
            console.error('[dsh-polish] сворачивание описания недоступно:', error)
          }
          return () => {
            try {
              stopDetailCollapse()
            } catch {
              // нечего останавливать
            }
          }
        }, 'dsh-polish: collapsible description')
      } catch (error) {
        console.error('[dsh-polish] свёрнутое описание недоступно:', error)
      }
    }


    /** Список доступных обновлений наших плагинов. */

    /** Свёрнутая строка плагина: заголовок, пояснение и «Открыть». */
    /** Кнопка-шеврон: развернуть и свернуть. Виден в любой теме (currentColor). */
    function ToggleIcon({ open, onClick }) {
      return h(
        'button',
        {
          type: 'button',
          onClick,
          title: open ? 'Свернуть' : 'Открыть',
          'aria-label': open ? 'Свернуть' : 'Открыть',
          'aria-expanded': open ? 'true' : 'false',
          style: {
            position: 'absolute',
            // Свёрнутая карточка: по центру по вертикали. Развёрнутая: в углу.
            top: open ? 8 : '50%',
            transform: open ? 'none' : 'translateY(-50%)',
            right: 8,
            zIndex: 2,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            padding: 0,
            borderRadius: 8,
            border: '1px solid rgba(128,128,128,0.32)',
            background: 'rgba(128,128,128,0.1)',
            color: 'inherit',
            cursor: 'pointer',
          },
        },
        h(
          'svg',
          {
            width: 16,
            height: 16,
            viewBox: '0 0 24 24',
            fill: 'none',
            'aria-hidden': 'true',
            focusable: 'false',
            style: { transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s ease' },
          },
          h('path', {
            d: 'M6 15l6-6 6 6',
            stroke: 'currentColor',
            strokeWidth: 2,
            strokeLinecap: 'round',
            strokeLinejoin: 'round',
          }),
        ),
      )
    }

function CollapsedItem({ title, summary, badge, children }) {
      const [open, setOpen] = React.useState(false)
      const box = {
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '10px 12px',
        borderRadius: 10,
        border: '1px solid rgba(128,128,128,0.22)',
        background: 'rgba(128,128,128,0.05)',
      }
      return h(
        'div',
        {
          style: {
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            position: 'relative',
            padding: '10px 44px 12px 12px',
            borderRadius: 10,
            border: '1px solid rgba(128,128,128,0.28)',
            background: 'rgba(128,128,128,0.07)',
            boxSizing: 'border-box',
          },
        },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h('span', { style: { fontSize: 13, fontWeight: 600 } }, title),
          badge !== undefined && badge !== '' ? h('span', { style: { fontSize: 10.5, padding: '1px 7px', borderRadius: 999, background: 'rgba(106,139,208,0.22)', color: 'inherit', opacity: 0.9 } }, badge) : null,
          h('span', { style: { flex: 1, fontSize: 11.5, opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, summary ?? ''),
          h(ToggleIcon, { open, onClick: () => setOpen(!open) }),
        ),
        open
          ? h(
              'div',
              {
                style: {
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 10,
                  paddingTop: 10,
                  marginTop: 2,
                  borderTop: '1px solid rgba(128,128,128,0.24)',
                },
              },
              children,
            )
          : null,
      )
    }

    function UpdatesBlock() {
      const [rows, setRows] = React.useState(null);
      const [busy, setBusy] = React.useState(false);

      const load = async () => {
        setBusy(true);
        try {
          const response = await fetch(UPDATES_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
          const data = await response.json();
          setRows(Array.isArray(data?.rows) ? data.rows : []);
        } catch {
          setRows([]);
        } finally {
          setBusy(false);
        }
      };

      const behind = (rows ?? []).filter((row) => row.behind === true);

      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10, borderTop: '1px solid rgba(128,128,128,0.18)' } },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h('span', { style: { fontSize: 12.5, fontWeight: 600 } }, 'Обновления плагинов'),
          h(
            'button',
            { style: { padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(128,128,128,0.35)', background: 'rgba(128,128,128,0.12)', color: 'inherit', font: 'inherit', fontSize: 12, cursor: 'pointer' }, onClick: () => void load() },
            busy ? 'Проверяю…' : 'Проверить',
          ),
          rows !== null ? h('span', { style: { fontSize: 12, opacity: 0.7 } }, behind.length === 0 ? 'все актуальны' : 'доступно: ' + behind.length) : null,
          behind.length > 0
            ? h(
                'button',
                {
                  style: { padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(128,128,128,0.35)', background: 'rgba(128,128,128,0.12)', color: 'inherit', font: 'inherit', fontSize: 12, cursor: 'pointer' },
                  onClick: () => {
                    const commands = behind.map((row) => 'dsh plugin --profile desktop add github:' + (row.repo ?? row.name)).join('\n');
                    try {
                      void navigator.clipboard.writeText(commands);
                      setNote('команды скопированы: ' + behind.length);
                    } catch {
                      setNote(commands);
                    }
                  },
                },
                'Скопировать команды',
              )
            : null,
          behind.length > 0
            ? h(
                'button',
                {
                  style: { padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(106,139,208,0.45)', background: 'rgba(106,139,208,0.16)', color: 'inherit', font: 'inherit', fontSize: 12, cursor: 'pointer' },
                  onClick: async () => {
                    setNote('обновляю… это может занять минуту')
                    try {
                      const response = await fetch(UPDATE_ALL_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apply: true }) })
                      const data = await response.json()
                      setNote(String(data?.message ?? 'готово'))
                      await load()
                    } catch (error) {
                      setNote('не удалось: ' + String(error?.message ?? error))
                    }
                  },
                },
                'Обновить всё',
              )
            : null,
        ),
        rows === null
          ? h('span', { style: { fontSize: 11.5, opacity: 0.6 } }, 'Нажмите «Проверить», чтобы сравнить установленные версии с GitHub.')
          : h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
              ...rows.map((row) =>
                h(
                  'div',
                  { key: row.name, style: { display: 'flex', gap: 10, fontSize: 11.5, opacity: row.behind === true ? 1 : 0.7 } },
                  h('span', { style: { minWidth: 150 } }, row.name),
                  h('span', null, row.installed ?? '—'),
                  h('span', { style: { opacity: 0.6 } }, '→'),
                  h('span', { style: { fontWeight: row.behind === true ? 600 : 400 } }, row.latest ?? row.error ?? '—'),
                ),
              ),
            ),
      );
    }


    /** Подсказки: что делать, если проверка не прошла. */
    const HINTS = {
      token: 'Настройки → Плагины → GitHub → поле Personal access token.',
      sync: 'Проверь вход в GitHub: git ls-remote <адрес репозитория>.',
      chrome: 'Установи Google Chrome — без него браузер агента не поднимается.',
      port: 'Открой «Старт» справа и нажми «Запустить браузер».',
      secrets: 'Впиши логины в ~/.dsh/browser-secrets.env по образцу из архива подготовки.',
      mcp: 'Нажми «Исправить» — сервер допишется в профиль.',
      versions: 'Нажми «Скопировать команды» в блоке обновлений и выполни их в терминале.',
      backup: 'Проверь свободное место на Яндекс.Диске и запусти синхронизацию вручную.',
    }

    /** Экран «Состояние»: проверки окружения и починка того, что исправимо. */

    /** Журнал: что проверяли и исправляли в последнее время. */
    function JournalBlock() {
      const [rows, setRows] = React.useState(null);

      const load = async () => {
        try {
          const response = await fetch(LOG_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
          const data = await response.json();
          setRows(Array.isArray(data?.rows) ? data.rows : []);
        } catch {
          setRows([]);
        }
      };

      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 10, borderTop: '1px solid rgba(128,128,128,0.18)' } },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h('span', { style: { fontSize: 12.5, fontWeight: 600 } }, 'Журнал'),
          h(
            'button',
            { style: { padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(128,128,128,0.35)', background: 'rgba(128,128,128,0.12)', color: 'inherit', font: 'inherit', fontSize: 12, cursor: 'pointer' }, onClick: () => void load() },
            'Показать',
          ),
        ),
        rows === null
          ? h('span', { style: { fontSize: 11.5, opacity: 0.6 } }, 'Последние проверки и исправления.')
          : rows.length === 0
            ? h('span', { style: { fontSize: 11.5, opacity: 0.6 } }, 'Записей пока нет.')
            : h(
                'div',
                { style: { display: 'flex', flexDirection: 'column', gap: 3 } },
                ...rows.slice(0, 8).map((row, index) =>
                  h(
                    'div',
                    { key: String(index), style: { display: 'flex', gap: 8, fontSize: 11.5, opacity: row.ok === false ? 1 : 0.75 } },
                    h('span', { style: { minWidth: 120, opacity: 0.7 } }, String(row.at ?? '').slice(11, 16)),
                    h('span', { style: { minWidth: 70, opacity: 0.8 } }, row.plugin ?? ''),
                    h('span', { style: { minWidth: 60 } }, row.kind ?? ''),
                    h('span', null, String(row.text ?? '')),
                  ),
                ),
              ),
      );
    }

    function HealthBlock() {
      const [state, setState] = React.useState(null);
      const [busy, setBusy] = React.useState(false);
      const [note, setNote] = React.useState('');

      const check = async () => {
        setBusy(true);
        setNote('');
        try {
          const response = await fetch(HEALTH_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
          const data = await response.json();
          setState(data?.ok === true ? data : { checks: [], message: data?.message ?? 'не удалось проверить' });
        } catch (error) {
          setState({ checks: [], message: String(error?.message ?? error) });
        } finally {
          setBusy(false);
        }
      };

      const fix = async (action) => {
        setNote('исправляю…');
        try {
          const response = await fetch(FIX_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) });
          const data = await response.json();
          setNote(String(data?.message ?? 'готово'));
          await check();
        } catch (error) {
          setNote('не получилось: ' + String(error?.message ?? error));
        }
      };

      const checks = state?.checks ?? [];
      const bad = checks.filter((item) => item.ok !== true);

      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 10, borderTop: '1px solid rgba(128,128,128,0.18)' } },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h('span', { style: { fontSize: 12.5, fontWeight: 600 } }, 'Состояние'),
          h(
            'button',
            { style: { padding: '4px 10px', borderRadius: 8, border: '1px solid rgba(128,128,128,0.35)', background: 'rgba(128,128,128,0.12)', color: 'inherit', font: 'inherit', fontSize: 12, cursor: 'pointer' }, onClick: () => void check() },
            busy ? 'Проверяю…' : 'Проверить',
          ),
          state !== null ? h('span', { style: { fontSize: 12, opacity: 0.7 } }, bad.length === 0 ? 'всё в порядке' : 'требует внимания: ' + bad.length) : null,
        ),
        note !== '' ? h('span', { style: { fontSize: 11.5, opacity: 0.75 } }, note) : null,
        state !== null && checks.length > 0
          ? (() => {
              const steps = ['sync', 'backup', 'port', 'token', 'versions']
              const done = steps.filter((id) => checks.some((item) => item.id === id && item.ok === true)).length
              return h('span', { style: { fontSize: 11.5, fontWeight: 600 } }, `Быстрый старт: ${done} из ${steps.length}`)
            })()
          : null,
        state === null
          ? h('span', { style: { fontSize: 11.5, opacity: 0.6 } }, 'Проверяет git, доступ к репозиторию, резерв, токен, Chrome, порт отладки, MCP и версии.')
          : h(
              'div',
              { style: { display: 'flex', flexDirection: 'column', gap: 4 } },
              ...checks.map((item) =>
                h(
                  'div',
                  { key: item.id, style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5 } },
                  h('span', { style: { width: 14, color: item.ok === true ? '#2f9e44' : '#d1242f' } }, item.ok === true ? '✓' : '✗'),
                  h('span', { style: { minWidth: 170 } }, item.title),
                  h('span', { style: { opacity: 0.7, flex: 1 } }, item.detail ?? ''),
                  item.ok !== true && HINTS[item.fix] !== undefined
                    ? h('span', { style: { fontSize: 10.5, opacity: 0.55, maxWidth: 260 } }, HINTS[item.fix])
                    : null,
                  item.ok !== true && (item.fix === 'mcp' || item.fix === 'secrets')
                    ? h(
                        'button',
                        { style: { padding: '2px 8px', borderRadius: 6, border: '1px solid rgba(128,128,128,0.35)', background: 'rgba(128,128,128,0.12)', color: 'inherit', font: 'inherit', fontSize: 11, cursor: 'pointer' }, onClick: () => void fix(item.fix) },
                        'Исправить',
                      )
                    : null,
                ),
              ),
            ),
      );
    }

    function PolishCard() {
      const [enabled, setEnabled] = React.useState(isEnabled())
      const t = (key) => translate(key)

      const toggle = (next) => {
        setEnabled(next)
        if (next) {
          installStyles()
          startDetailCollapse()
        } else {
          removeStyles()
          stopDetailCollapse()
        }
        try {
          localStorage.setItem(STORAGE_KEY, next ? '1' : '0')
        } catch {
          // без хранилища переключатель живёт до перезагрузки
        }
      }

      return h(
        'div',
        { style: { display: 'flex', flexDirection: 'column', gap: 10, fontSize: 13 } },
        h('span', { style: { fontSize: 13.5, fontWeight: 600 } }, t('heading')),
        h('span', { style: { fontSize: 12, opacity: 0.75, lineHeight: 1.5 } }, t('hint')),
        h(HealthBlock, null),
        h(JournalBlock, null),
        h(UpdatesBlock, null),
        h(
          'label',
          { style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' } },
          h('input', {
            type: 'checkbox',
            checked: enabled,
            onChange: (event) => toggle(event.target.checked),
          }),
          h('span', null, t('switchLabel')),
          h('span', { style: { fontSize: 12, opacity: 0.7 } }, enabled ? t('on') : t('off')),
        ),
      )
    }

    let translate = (key) => key

    /** Содержимое карточки на странице своего плагина. */
    function DetailCard_dshpolish(props) {
      const subject = props?.subject
      const packageName =
        subject?.kind === 'bundle' && typeof subject?.pkg?.name === 'string'
          ? subject.pkg.name
          : typeof subject?.id === 'string'
            ? subject.id
            : ''
      if (packageName !== 'dsh-polish') return null
      const content = () => h(CollapsedItem, { title: 'Оформление интерфейса', summary: 'Наведение, фокус, тема; состояние и обновления', badge: 'наше' }, h(PolishCard))
      return typeof content === 'function' ? content(props) : content
    }

    function apply(ctx) {
      const locale = ctx.locale
      locale.register(NS, { en, ru })
      translate = locale.bind(NS)

      watchTheme()
      applyStyles(ctx)
      applyDetailCollapse(ctx)
      installReloadShortcut(ctx)
      try {
        ctx.slots.inject('sidebar.footer.action', () =>
          ctx.slots.register(
            { name: 'sidebar.footer.action', id: 'dsh-polish-reload', order: 90, locale: NS },
            () =>
              h(
                'button',
                {
                  type: 'button',
                  title: 'Обновить страницу (Ctrl+R)',
                  onClick: () => window.location.reload(),
                  style: {
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    height: 26,
                    padding: '0 8px',
                    borderRadius: 6,
                    border: '1px solid rgba(128,128,128,0.3)',
                    background: 'transparent',
                    color: 'inherit',
                    font: 'inherit',
                    fontSize: 12,
                    cursor: 'pointer',
                  },
                },
                h('span', null, '↻'),
                h('span', null, translate('reload')),
              ),
          ),
        )
      } catch (error) {
        console.error('[dsh-polish] кнопка обновления недоступна:', error)
      }

      try {
              try {
        ctx.slots.inject('plugins.detail.section', () =>
          ctx.slots.register(
            {
              name: 'plugins.detail.section',
              id: 'dsh-polish-detail',
              order: 45,
              locale: NS,
            },
            DetailCard_dshpolish,
          ),
        )
      } catch (error) {
        console.error('[dsh-polish] секция страницы недоступна:', error)
      }
      } catch (error) {
        console.error('[dsh-polish] карточка недоступна:', error)
      }
    }

    exports.apply = apply
    exports.inject = ['slots', 'locale']
    exports.NS = NS
    return module.exports
  },
})
