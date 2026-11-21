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


    /** Список доступных обновлений наших плагинов. */

    /** Свёрнутая строка плагина: заголовок, пояснение и «Открыть». */
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
        { style: box },
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 10 } },
          h('span', { style: { fontSize: 13, fontWeight: 600 } }, title),
          badge !== undefined && badge !== '' ? h('span', { style: { fontSize: 10.5, padding: '1px 7px', borderRadius: 999, background: 'rgba(106,139,208,0.22)', color: 'inherit', opacity: 0.9 } }, badge) : null,
          h('span', { style: { flex: 1, fontSize: 11.5, opacity: 0.6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, summary ?? ''),
          h(
            'button',
            {
              type: 'button',
              onClick: () => setOpen(!open),
              style: {
                padding: '4px 12px',
                borderRadius: 8,
                border: '1px solid rgba(128,128,128,0.32)',
                background: open ? 'rgba(106,139,208,0.18)' : 'rgba(128,128,128,0.1)',
                color: 'inherit',
                font: 'inherit',
                fontSize: 12,
                cursor: 'pointer',
                flex: '0 0 auto',
              },
            },
            open ? 'Свернуть' : 'Открыть',
          ),
        ),
        open ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } }, children) : null,
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

    function apply(ctx) {
      const locale = ctx.locale
      locale.register(NS, { en, ru })
      translate = locale.bind(NS)

      watchTheme()
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
            () => h(CollapsedItem, { title: 'Оформление интерфейса', summary: 'Наведение, фокус, тема; состояние и обновления', badge: 'наше' }, h(PolishCard)),
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
