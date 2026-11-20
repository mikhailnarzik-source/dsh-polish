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

    const en = {
      title: 'Interface polish',
      heading: 'Appearance of all plugins',
      hint: 'Highlights buttons on hover, draws a visible keyboard focus ring, and keeps native fields readable in both themes. Applies to every plugin, including third-party ones.',
      switchLabel: 'Hover highlight and focus ring',
      on: 'Enabled',
      off: 'Disabled',
    }
    const ru = {
      title: 'Оформление интерфейса',
      heading: 'Внешний вид всех плагинов',
      hint: 'Подсвечивает кнопки при наведении, рисует заметную обводку фокуса и держит нативные поля читаемыми в обеих темах. Действует на все плагины, включая сторонние.',
      switchLabel: 'Подсветка наведения и фокус',
      on: 'Включено',
      off: 'Выключено',
    }

    const CSS = `
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
/* Полосы прокрутки внутри плагинов не должны выбиваться из темы. */
* {
  scrollbar-color: rgba(128, 128, 128, 0.45) transparent;
}
`

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

    function PolishCard() {
      const [enabled, setEnabled] = React.useState(isEnabled())
      const t = (key) => translate(key)

      const toggle = (next) => {
        setEnabled(next)
        if (next) installStyles()
        else removeStyles()
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

    function apply(ctx) {
      const locale = ctx.locale
      locale.register(NS, { en, ru })
      translate = locale.bind(NS)

      applyStyles(ctx)

      try {
        ctx.slots.inject('plugins.item', () =>
          ctx.slots.register(
            {
              name: 'plugins.item',
              id: 'dsh-polish',
              order: 56,
              label: () => translate('title'),
              locale: NS,
            },
            PolishCard,
          ),
        )
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
