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
    const RELOAD_PATH = '/api/dsh-polish/reload'
    // Сколько минимум держим «Обновляется…», чтобы состояние было видно глазом,
    // а не мелькало на один кадр.
    const RELOAD_BUSY_MIN_MS = 320
    // Предупреждение «идёт работа»: сколько висит и по какому атрибуту его найти.
    // Перезапуск во время работы даёт дубли сессий и отвалившиеся плагины,
    // поэтому кнопка сначала проверяет занятость и только второй явный клик
    // («Всё равно перезапустить») перезагружает принудительно.
    const RELOAD_WARNING_MS = 9000
    const RELOAD_WARNING_FLAG = 'data-dsh-polish-reload-warning'
    // Событие от хоста: Ctrl+R/F5 отложен, потому что идёт работа.
    const RELOAD_BLOCKED_EVENT = 'dsh-polish:reload-blocked'
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

    /**
     * Известные плагины с панелями в левом меню: привычные эмодзи для
     * настроек и меню «Ещё». Сам список панелей больше не захардкожен — он
     * строится из слота `sidebar.panellist` (`ctx.slots.entriesOfSlot`),
     * поэтому новый плагин появляется в карточке «Панели в левом меню» сам,
     * без правки кода. `dsh-polish` чужих панелей не создаёт: он хранит
     * состояние видимости и закрепления и сообщает об изменениях событием
     * `dsh-polish:panels-changed`.
     */
    const SHORTCUT_META = [
      { id: 'cards', emoji: '🧩', order: 20 },
      { id: 'compact', emoji: '🗜️', order: 21 },
      { id: 'review', emoji: '📝', order: 22 },
      { id: 'notify', emoji: '🔔', order: 23 },
      { id: 'team', emoji: '👥', order: 24 },
      { id: 'vault', emoji: '🔑', order: 25 },
      { id: 'pyrus', emoji: '📋', order: 26 },
      { id: 'inbox', emoji: '📥', order: 27 },
      { id: 'polish', emoji: '🎨', order: 28 },
      { id: 'whale', emoji: '🐳', order: 29 },
      { id: 'browser', emoji: '🌐', order: 30 },
    ]
    const SHORTCUT_META_BY_ID = new Map(SHORTCUT_META.map((plugin) => [plugin.id, plugin]))
    // Эмодзи незнакомой панели, пока для её подписи нет своей метки в карте.
    const DEFAULT_PANEL_EMOJI = '🧩'
    // Префикс ключа main-панели и id строки: `plugin-cards`, `plugin-review`, …
    const SHORTCUT_PREFIX = 'plugin-'
    // Слот, в который плагины регистрируют строки левой панели.
    const SIDEBAR_PANELLIST_SLOT = 'sidebar.panellist'
    // Ключевой слот `main`: плагин регистрирует там свою страницу всегда, даже
    // когда строка левой панели снята. По нему видно, что плагин установлен.
    const MAIN_PANEL_SLOT = 'main'
    // Настройки видимости и закрепления панелей:
    // { visible: string[], pinned: string[], known: string[] }.
    const PANEL_VISIBILITY_KEY = 'dsh-polish:panel-visibility'
    // Событие для плагинов: по нему они перерегистрируют строку левой панели.
    const PANELS_CHANGED_EVENT = 'dsh-polish:panels-changed'

    /**
     * Цветные эмодзи вместо одноцветных SVG во всей левой панели. Хост рисует
     * строку как `button.panelRow[aria-label] > span.panelGlyph > svg`, где
     * подпись — локализованное название панели. Ищем кнопку по aria-label,
     * ставим ей `data-dsh-panel-emoji`, а CSS скрывает svg и рисует эмодзи
     * через `::before`. Ключи карты — aria-label без регистра и лишних пробелов.
     */
    const PANEL_EMOJI_ATTR = 'data-dsh-panel-emoji'
    const PANEL_EMOJI_BY_LABEL = {
      плагины: '🧩',
      plugins: '🧩',
      календарь: '📅',
      calendar: '📅',
      расходы: '💰',
      expenses: '💰',
      'синхронизация сессий': '🔄',
      'session sync': '🔄',
      'sessions sync': '🔄',
      'session synchronization': '🔄',
      'задачи автоматизации': '⏰',
      'automation tasks': '⏰',
      карточки: '🧩',
      cards: '🧩',
      'сжатие диалога': '🗜️',
      'dialog compaction': '🗜️',
      'dialog compression': '🗜️',
      'ревью изменений': '🔍',
      'changes review': '🔍',
      'review changes': '🔍',
      уведомления: '🔔',
      notifications: '🔔',
      команда: '👥',
      team: '👥',
      сейф: '🔑',
      vault: '🔑',
      'pyrus: мои задачи': '📋',
      'pyrus: my tasks': '📋',
      pyrus: '📋',
      входящие: '📥',
      inbox: '📥',
      'оформление интерфейса': '🎨',
      appearance: '🎨',
      'interface polish': '🎨',
      'кит-помощник': '🐳',
      'whale companion': '🐳',
      whale: '🐳',
      'запуск браузера': '🌐',
      browser: '🌐',
      'launch browser': '🌐',
      'agent browser launcher': '🌐',
    }

    const en = {
      title: 'Interface polish',
      reloadAria: 'Refresh the app',
      reloading: 'Refreshing…',
      reloadDone: 'Done',
      reloadFailed: 'Failed',
      reloadBusy: 'Work in progress: wait until it finishes',
      reloadBusyNote: 'Reloading now would duplicate sessions and leave plugins half applied. Finish all sessions and subagents first.',
      reloadForce: 'Reload anyway',
      reloadForceHint: 'The reload interrupts open turns and may duplicate sessions.',
      reloadActiveSession: 'Session',
      reloadActiveSubagent: 'Subagent',
      reloadActiveJob: 'Background task',
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
      reload: 'Refresh',
      healthTitle: 'State',
      check: 'Check',
      checking: 'Checking…',
      allOk: 'everything is fine',
      needsAttention: 'needs attention: {count}',
      quickStart: 'Quick start: {done} of {total}',
      healthHint: 'Checks git, repository access, backup, token, Chrome, the debug port, MCP and plugin versions.',
      fix: 'Fix',
      fixing: 'fixing…',
      fixFailed: 'did not work: {message}',
      checkFailed: 'could not check',
      journalTitle: 'Journal',
      show: 'Show',
      journalHint: 'Recent checks and fixes.',
      journalEmpty: 'No records yet.',
      updatesTitle: 'Plugin updates',
      allCurrent: 'all up to date',
      available: 'available: {count}',
      copyCommands: 'Copy commands',
      commandsCopied: 'commands copied: {count}',
      updateAll: 'Update all',
      updating: 'updating… this may take a minute',
      updatesHint: 'Press “Check” to compare installed versions with GitHub.',
      'hints.token': 'Settings → Plugins → GitHub → Personal access token field.',
      'hints.sync': 'Check GitHub sign-in: git ls-remote <repository URL>.',
      'hints.chrome': 'Install Google Chrome — the agent browser will not start without it.',
      'hints.port': 'Open “Start” on the right and press “Launch browser”.',
      'hints.secrets': 'Write the logins into ~/.dsh/browser-secrets.env following the preparation archive sample.',
      'hints.mcp': 'Press “Fix” — the server will be added to the profile.',
      'hints.versions': 'Press “Copy commands” in the updates block and run them in a terminal.',
      'hints.backup': 'Check free space on Yandex Disk and start the sync manually.',
      reloadHint: 'Reload page (Ctrl+R)',
      summary: 'Appearance of all plugins, checks and updates.',
      panelsTitle: 'Panels in the left menu',
      panelsHint: 'The list is collected automatically: panels come from the plugins themselves. Any panel can be pinned — use the pin button in the left sidebar. Unpinned a panel? It stays in the “More” menu — pin it back there.',
      panelsEmpty: 'Panels appear here as soon as plugins register them in the left sidebar.',
      panelsPinTitle: 'Bring all panels back to the left sidebar',
      panelsPinAll: 'Pin all panels ({count})',
      panelsUnpinnedTitle: 'Unpinned panels',
      panelsUnpinnedHint: 'Pin the launchers you need — they return to the left sidebar.',
      panelsPinOne: 'Pin',
      panelsPinOneTitle: 'Pin “{name}” to the left sidebar',
      panelsAllPinned: 'All panels are in the left sidebar already.',
      panelsShowLabel: 'Show in the left sidebar',
      panelsPinned: 'In the left sidebar',
      panelsInMore: 'In the “More” menu',
      panelsVisibleCount: 'enabled: {count} of {total}',
      panelsVisibilityHint: 'Turn the switch off — the row disappears from both the left sidebar and the “More” menu. Turn it back on — the plugin returns to “More”, where it can be pinned.',
      shortcutHint: 'A panel never disappears for good: unpinned ones wait in the “More” menu, where the “Pin” button brings them back to the left sidebar.',
      'shortcut.cards.title': 'Cards',
      'shortcut.compact.title': 'Dialog compression',
      'shortcut.review.title': 'Review changes',
      'shortcut.notify.title': 'Notifications',
      'shortcut.team.title': 'Team',
      'shortcut.vault.title': 'Vault',
      'shortcut.pyrus.title': 'Pyrus: my tasks',
      'shortcut.inbox.title': 'Inbox',
      'shortcut.polish.title': 'Interface polish',
      'shortcut.whale.title': 'Whale helper',
      'shortcut.browser.title': 'Launch browser',
    }
    const ru = {
      reload: 'Обновить',
      reloadAria: 'Обновить приложение',
      reloading: 'Обновляется…',
      reloadDone: 'Готово',
      reloadFailed: 'Не удалось',
      reloadBusy: 'Идёт работа: дождитесь завершения',
      reloadBusyNote: 'Перезапуск сейчас даст дубли сессий и отвалившиеся плагины. Дождитесь завершения всех сессий и субагентов.',
      reloadForce: 'Всё равно перезапустить',
      reloadForceHint: 'Перезапуск прервёт открытые ходы и может дать дубли сессий.',
      reloadActiveSession: 'Сессия',
      reloadActiveSubagent: 'Субагент',
      reloadActiveJob: 'Фоновая задача',
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
      healthTitle: 'Состояние',
      check: 'Проверить',
      checking: 'Проверяю…',
      allOk: 'всё в порядке',
      needsAttention: 'требует внимания: {count}',
      quickStart: 'Быстрый старт: {done} из {total}',
      healthHint: 'Проверяет git, доступ к репозиторию, резерв, токен, Chrome, порт отладки, MCP и версии.',
      fix: 'Исправить',
      fixing: 'исправляю…',
      fixFailed: 'не получилось: {message}',
      checkFailed: 'не удалось проверить',
      journalTitle: 'Журнал',
      show: 'Показать',
      journalHint: 'Последние проверки и исправления.',
      journalEmpty: 'Записей пока нет.',
      updatesTitle: 'Обновления плагинов',
      allCurrent: 'все актуальны',
      available: 'доступно: {count}',
      copyCommands: 'Скопировать команды',
      commandsCopied: 'команды скопированы: {count}',
      updateAll: 'Обновить всё',
      updating: 'обновляю… это может занять минуту',
      updatesHint: 'Нажмите «Проверить», чтобы сравнить установленные версии с GitHub.',
      'hints.token': 'Настройки → Плагины → GitHub → поле Personal access token.',
      'hints.sync': 'Проверь вход в GitHub: git ls-remote <адрес репозитория>.',
      'hints.chrome': 'Установи Google Chrome — без него браузер агента не поднимается.',
      'hints.port': 'Открой «Старт» справа и нажми «Запустить браузер».',
      'hints.secrets': 'Впиши логины в ~/.dsh/browser-secrets.env по образцу из архива подготовки.',
      'hints.mcp': 'Нажми «Исправить» — сервер допишется в профиль.',
      'hints.versions': 'Нажми «Скопировать команды» в блоке обновлений и выполни их в терминале.',
      'hints.backup': 'Проверь свободное место на Яндекс.Диске и запусти синхронизацию вручную.',
      reloadHint: 'Обновить страницу (Ctrl+R)',
      summary: 'Внешний вид всех плагинов, проверки и обновления.',
      panelsTitle: 'Панели в левом меню',
      panelsHint: 'Список собирается сам: панели приходят из плагинов. Закрепить можно любую панель — кнопкой-булавкой в левой панели. Открепили панель? Она осталась в меню «Ещё» — там её можно закрепить обратно.',
      panelsEmpty: 'Панели появятся, как только плагины зарегистрируют их в левом меню.',
      panelsPinTitle: 'Вернуть все панели в левую панель',
      panelsPinAll: 'Закрепить все панели ({count})',
      panelsUnpinnedTitle: 'Откреплённые панели',
      panelsUnpinnedHint: 'Закрепите нужные панели — они вернутся в левую панель.',
      panelsPinOne: 'Закрепить',
      panelsPinOneTitle: 'Закрепить «{name}» в левой панели',
      panelsAllPinned: 'Все панели уже в левом меню.',
      panelsShowLabel: 'Показывать в левом меню',
      panelsPinned: 'В левом меню',
      panelsInMore: 'В меню «Ещё»',
      panelsVisibleCount: 'включено: {count} из {total}',
      panelsVisibilityHint: 'Выключите переключатель — строка исчезнет и из левой панели, и из меню «Ещё». Включите обратно — плагин снова появится в «Ещё», откуда его можно закрепить.',
      shortcutHint: 'Панель не пропадает насовсем: откреплённые ждут в меню «Ещё», откуда кнопка «Закрепить» возвращает их в левое меню.',
      'shortcut.cards.title': 'Карточки',
      'shortcut.compact.title': 'Сжатие диалога',
      'shortcut.review.title': 'Ревью изменений',
      'shortcut.notify.title': 'Уведомления',
      'shortcut.team.title': 'Команда',
      'shortcut.vault.title': 'Сейф',
      'shortcut.pyrus.title': 'Pyrus: мои задачи',
      'shortcut.inbox.title': 'Входящие',
      'shortcut.polish.title': 'Оформление интерфейса',
      'shortcut.whale.title': 'Кит-помощник',
      'shortcut.browser.title': 'Запуск браузера',
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
/* Кнопки «Закрепить» в меню «Ещё»: мягкая подсветка и кольцо фокуса. */
[data-dsh-polish-button='pin']:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}
[data-dsh-polish-button='pin']:focus-visible {
  outline: 2px solid rgba(84, 126, 214, 0.75);
  outline-offset: 2px;
}
button:focus-visible,
[role='button']:focus-visible,
a:focus-visible,
input:focus-visible,
select:focus-visible,
textarea:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
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

/* --- Наведение и фокус: все интерактивные элементы -------------------- */
/* Общий слой поверх кнопок, полей, списков, вкладок, строк и кликабельных
   карточек: мягкий фон/рамка токенами темы и заметная обводка при фокусе с
   клавиатуры. Размеры, радиусы, отступы и белый текст не переопределяем —
   раскладку и наши кнопки это не меняет. Отключённые элементы (disabled,
   aria-disabled=true) и содержимое pre/code исключены. */

/* Плавность: 120 мс на фон, рамку, текст и тень. Нулевая специфичность —
   собственный transition плагина всегда главнее. */
:where(
  button,
  select,
  input,
  textarea,
  a[href],
  [role='button'],
  [role='option'],
  [role='menuitem'],
  [role='tab'],
  [class*='switch'],
  label:has(> input[type='checkbox']),
  label:has(> input[type='radio']),
  [data-dsh-polish-row],
  [data-dsh-polish-panel-row],
  [class*='row']:is(button, a[href], [role='button'], [tabindex]),
  [class*='item']:is(button, a[href], [role='button'], [tabindex]),
  [class*='card']:is(button, a[href], [role='button'], [tabindex])
):where(:not(:disabled):not([aria-disabled='true'])) {
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease, box-shadow 120ms ease;
}

/* Кнопки, вкладки, пункты списков, ссылки и кликабельные строки: мягкий фон
   при наведении. Наши собственные кнопки (data-dsh-polish-button) не трогаем:
   у них своя система hover из карточки. */
:where(
  button:not(:disabled):not([aria-disabled='true']):not([data-dsh-polish-button]),
  select:not(:disabled),
  [role='button']:not([aria-disabled='true']),
  [role='option']:not([aria-disabled='true']),
  [role='menuitem']:not([aria-disabled='true']),
  [role='tab']:not([aria-disabled='true']),
  a[href]:not([aria-disabled='true']),
  label:has(> input[type='checkbox']:not(:disabled)),
  label:has(> input[type='radio']:not(:disabled)),
  [class*='switch']:not([aria-disabled='true']),
  [data-dsh-polish-row],
  [data-dsh-polish-panel-row],
  [class*='row']:is(button, a[href], [role='button'], [tabindex]):not([aria-disabled='true']),
  [class*='item']:is(button, a[href], [role='button'], [tabindex]):not([aria-disabled='true']),
  [class*='card']:is(button, a[href], [role='button'], [tabindex]):not([aria-disabled='true'])
):not(:is(pre, code) *):hover {
  background-color: var(--dsw-alias-interactive-bg-hover);
  background-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 7%, transparent);
}

/* Поля ввода и выбора: при наведении рамка в цвет бренда — мягко, без толщины
   и без заливки, чтобы не спорить с оформлением плагинов. */
:where(
  input:not(:disabled):not([type='checkbox']):not([type='radio']):not([type='range']):not([type='file']):not([type='hidden']),
  textarea:not(:disabled),
  select:not(:disabled)
):hover {
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 45%, transparent);
}

/* Чекбоксы, радио и переключатели: акцент и усиление рамки при наведении. */
:where(
  input[type='checkbox']:not(:disabled),
  input[type='radio']:not(:disabled),
  [class*='switch']:not([aria-disabled='true'])
):hover {
  accent-color: var(--dsw-alias-brand-primary);
  border-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent);
}

/* Вкладки и переключатели вкладок: выбранная вкладка — акцент бренда
   (в покое 10 %, при наведении чуть заметнее — 14 %). */
[role='tab'][aria-selected='true']:not([aria-disabled='true']) {
  color: var(--dsw-alias-brand-primary);
  background-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent);
}
[role='tab'][aria-selected='true']:not([aria-disabled='true']):hover {
  background-color: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent);
}

/* Кликабельные карточки: лёгкая тень при наведении, размеры не меняются. */
:where(
  [class*='card']:is(button, a[href], [role='button'], [tabindex]):not([aria-disabled='true']),
  button:not(:disabled)[class*='card'],
  a[href][class*='card']
):hover {
  box-shadow: 0 2px 10px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
}

/* Фокус с клавиатуры для тех же элементов: обводка 2 px бренда, отступ 2 px,
   радиус не задаём — outline сам повторяет border-radius элемента. */
:where(
  [role='option']:not([aria-disabled='true']),
  [role='menuitem']:not([aria-disabled='true']),
  [role='tab']:not([aria-disabled='true']),
  label:has(> input[type='checkbox']),
  label:has(> input[type='radio']),
  [class*='switch'],
  [data-dsh-polish-row],
  [data-dsh-polish-panel-row],
  [class*='row']:is(button, a[href], [role='button'], [tabindex]),
  [class*='item']:is(button, a[href], [role='button'], [tabindex]),
  [class*='card']:is(button, a[href], [role='button'], [tabindex])
):focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}

/* Исключения: disabled / aria-disabled=true и содержимое pre/code не
   подсвечиваются. Отключённым не назначаем фон (у них он свой), только снимаем
   анимацию; у кода снимаем и фон, и обводку. */
:where(
  button,
  a[href],
  [role='button'],
  [role='option'],
  [role='menuitem'],
  [role='tab'],
  [class*='switch']
):is(:disabled, [aria-disabled='true']) {
  transition: none;
}
:where(pre, code) :is(button, select, input, textarea, a[href], [role='button'], [role='option'], [role='menuitem'], [role='tab']) {
  transition: none;
}
:where(pre, code) :is(button, a[href], [role='button'], [role='option'], [role='menuitem'], [role='tab']):hover {
  background-color: transparent;
  box-shadow: none;
}
:where(pre, code) :is(button, select, input, textarea, a[href], [role='button'], [role='option'], [role='menuitem'], [role='tab']):focus-visible {
  outline: none;
}
/* --- Конец слоя hover/focus ------------------------------------------- */

/* Страница плагина: сначала блок управления, затем описание. */
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

/* Длинные абзацы чата и страниц плагинов — по ширине.
   Код, таблицы и списки не трогаем: у них своя раскладка строк. */
:is(
  [class*="message"] p,
  [class*="markdown"] p,
  [class*="messageText"] p,
  [class*="markdownBody"] p,
  [class*="detailDesc"] p,
  [class*="DETAIL"] p,
  [class*="detailDocument"] p,
  [class*="richText"] p,
  [class*="prose"] p,
  [data-detail-document] p
):not(pre p):not(code p):not(table p):not(td p):not(th p):not(li p) {
  text-align: justify;
  hyphens: auto;
  text-justify: inter-word;
}

/* Левая панель: цветные эмодзи-иконки вместо одноцветных SVG.
   Атрибут стоит и на кнопке панели, и на её span.panelGlyph: content: attr()
   в ::before читается с самого глифа, поэтому значение дублируется. */
nav button[data-dsh-panel-emoji] [class*="panelGlyph"] svg {
  display: none !important;
}
nav button[data-dsh-panel-emoji] [class*="panelGlyph"]::before {
  content: attr(data-dsh-panel-emoji);
  font-family: "Segoe UI Emoji", "Noto Color Emoji", "Apple Color Emoji", sans-serif;
  font-size: 17px;
  font-style: normal;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
/* Свёрнутая левая панель: иконка чуть крупнее, как у штатных SVG. */
[class*="collapsed"] nav button[data-dsh-panel-emoji] [class*="panelGlyph"]::before {
  font-size: 18px;
}

/* --- Кнопка «Обновить» в подвале левой панели --------------------------- */
/* Вид повторяет «Новую сессию» хоста один в один: тот же фон
   (button-elevated-fill), рамка 0.5 px border-l3, радиус dsw-radius-md,
   высота 38 px, padding 8/12, шрифт 14/500/22; ширина — 100 % подвала.
   Отличается только иконка. Боковой отступ подвала — как у строки «Новой
   сессии» (paint inset 3 + 1), поэтому кнопки встают в одну линию. Селектор
   ограничен footArea левой панели, чтобы не задеть чужие footerActions. */
[class*='footArea'] [class*='footerActions'] {
  padding: 0 calc(var(--dsh-sidebar-paint-inset, 3px) + 1px);
}
[class*='collapsed'] [class*='footArea'] [class*='footerActions'] {
  padding: 0;
}
[data-dsh-polish-reload] {
  box-sizing: border-box;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  width: 100%;
  height: 38px;
  margin: 0;
  padding: 8px 12px;
  border: 0.5px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md);
  background: var(--dsw-alias-button-elevated-fill);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
  cursor: pointer;
  overflow: hidden;
  filter: none;
  transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}
@media (hover: hover) {
  [data-dsh-polish-reload]:hover:not(:disabled) {
    background: var(--dsw-alias-button-floating-hover);
    filter: none;
  }
}
[data-dsh-polish-reload]:active:not(:disabled) {
  filter: none;
}
[data-dsh-polish-reload]:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}
[data-dsh-polish-reload] [data-dsh-polish-reload-icon] {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: none;
  font-size: 14px;
  line-height: 1;
}
[data-dsh-polish-reload] [data-dsh-polish-reload-label] {
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
/* Состояния: «Обновляется…» — спиннер, «Готово» и «Не удалось» — мягкая
   заливка токеном по смыслу (как у статус-чипов), заметка — в title. */
[data-dsh-polish-reload][data-state='loading'] {
  cursor: progress;
  opacity: 0.9;
}
[data-dsh-polish-reload][data-state='loading'] [data-dsh-polish-reload-icon] {
  animation: dsh-polish-reload-spin 0.9s linear infinite;
}
[data-dsh-polish-reload][data-state='done'] {
  border-color: color-mix(in srgb, var(--dsw-alias-state-success-primary) 55%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-state-success-primary) 16%, transparent);
  color: var(--dsw-alias-state-success-primary);
}
[data-dsh-polish-reload][data-state='error'] {
  border-color: color-mix(in srgb, var(--dsw-alias-state-error-primary) 55%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 16%, transparent);
  color: var(--dsw-alias-state-error-primary);
}
@keyframes dsh-polish-reload-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
@media (prefers-reduced-motion: reduce) {
  [data-dsh-polish-reload][data-state='loading'] [data-dsh-polish-reload-icon] {
    animation: none;
  }
}
/* Свёрнутая панель: кнопка становится иконкой 36×36 по центру рельса, как
   штатная «Новая сессия» в свёрнутом виде; подпись скрыта. */
[data-dsh-polish-reload][data-compact],
[class*='collapsed'] [class*='footArea'] [class*='footerActions'] [data-dsh-polish-reload] {
  width: 36px;
  height: 36px;
  padding: 0;
  gap: 0;
  border-color: transparent;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
}
[data-dsh-polish-reload][data-compact] [data-dsh-polish-reload-label] {
  display: none;
}
@media (hover: hover) {
  [data-dsh-polish-reload][data-compact]:hover:not(:disabled),
  [class*='collapsed'] [class*='footArea'] [class*='footerActions'] [data-dsh-polish-reload]:hover:not(:disabled) {
    background-color: var(--dsw-alias-interactive-bg-hover);
  }
}
/* «Идёт работа»: мягкая предупреждающая заливка тем же токеном, что у
   статус-чипов. Кнопка остаётся активной — второй клик перезагружает
   принудительно; спиннер сюда не попадает. */
[data-dsh-polish-reload][data-state='busy'] {
  border-color: color-mix(in srgb, var(--dsw-alias-state-warn-primary, var(--dsw-alias-state-error-primary)) 55%, transparent);
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, var(--dsw-alias-state-error-primary)) 16%, transparent);
  color: var(--dsw-alias-state-warn-primary, var(--dsw-alias-state-error-primary));
}
[data-dsh-polish-reload][data-state='busy'] [data-dsh-polish-reload-icon] {
  animation: none;
}
/* Предупреждение «идёт работа»: карточка-тост с перечнем активных сессий и
   кнопкой принудительного перезапуска. Поверх интерфейса, адаптив: на узком
   экране растягивается по ширине, длинный список прокручивается внутри. */
[data-dsh-polish-reload-warning] {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483000;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: min(420px, calc(100vw - 32px));
  max-height: min(70vh, 520px);
  overflow-y: auto;
  overscroll-behavior: contain;
  margin: 0;
  padding: 14px 16px;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary, var(--dsw-alias-state-error-primary)) 45%, transparent);
  border-left: 3px solid var(--dsw-alias-state-warn-primary, var(--dsw-alias-state-error-primary));
  border-radius: 14px;
  background: var(--dsw-alias-bg-elevated, var(--dsw-alias-button-elevated-fill));
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.28);
  font-size: 12.5px;
  line-height: 18px;
}
[data-dsh-polish-reload-warning] [data-dsh-polish-reload-warning-title] {
  font-size: 13px;
  font-weight: 600;
  line-height: 19px;
}
[data-dsh-polish-reload-warning] [data-dsh-polish-reload-warning-list] {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding-left: 18px;
}
[data-dsh-polish-reload-warning] [data-dsh-polish-reload-warning-kind] {
  margin-right: 6px;
  color: var(--dsw-alias-label-secondary);
}
[data-dsh-polish-reload-warning] [data-dsh-polish-reload-warning-name] {
  font-weight: 600;
  overflow-wrap: anywhere;
}
[data-dsh-polish-reload-warning] [data-dsh-polish-reload-warning-note] {
  color: var(--dsw-alias-label-secondary);
  text-align: justify;
  hyphens: auto;
}
[data-dsh-polish-reload-warning] [data-dsh-polish-reload-warning-actions] {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}
[data-dsh-polish-reload-warning] [data-dsh-polish-reload-force] {
  box-sizing: border-box;
  height: 32px;
  margin: 0;
  padding: 0 12px;
  border: 1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary, var(--dsw-alias-state-error-primary)) 45%, transparent);
  border-radius: 10px;
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, var(--dsw-alias-state-error-primary)) 16%, transparent);
  color: var(--dsw-alias-state-warn-primary, var(--dsw-alias-state-error-primary));
  font: inherit;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
[data-dsh-polish-reload-warning] [data-dsh-polish-reload-force]:hover {
  background: color-mix(in srgb, var(--dsw-alias-state-warn-primary, var(--dsw-alias-state-error-primary)) 24%, transparent);
}
[data-dsh-polish-reload-warning] [data-dsh-polish-reload-force]:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 2px;
}
@media (max-width: 480px) {
  [data-dsh-polish-reload-warning] {
    right: 12px;
    left: 12px;
    bottom: 12px;
    width: auto;
    padding: 12px;
  }
}
@media (prefers-reduced-motion: reduce) {
  [data-dsh-polish-reload-warning] {
    transition: none;
  }
}
/* --- Конец кнопки обновления ------------------------------------------- */
`

    /** Только токены DSH: акцент, границы, текст — без жёстких цветов. */
    const ACCENT = 'var(--dsw-alias-brand-primary)'
    const OK_COLOR = 'var(--dsw-alias-state-success-primary)'
    const BAD_COLOR = 'var(--dsw-alias-state-error-primary)'

    /**
     * Статус-чип — та же система, что кнопки (спека v2): height 32, радиус 10,
     * padding 0 12, border 1px, шрифт 600 12.5, inline-flex gap 6. Фон и рамка —
     * мягкая заливка токеном по смыслу, текст — тем же токеном, поэтому точка
     * 6 px слева красится `currentColor`.
     */
    const CHIP_BASE = {
      boxSizing: 'border-box',
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 32,
      padding: '0 12px',
      borderRadius: 10,
      border: '1px solid color-mix(in srgb, ' + ACCENT + ' 55%, transparent)',
      background: 'color-mix(in srgb, ' + ACCENT + ' 18%, transparent)',
      color: ACCENT,
      fontSize: 12.5,
      fontWeight: 600,
      lineHeight: 1,
      whiteSpace: 'nowrap',
      flex: '0 0 auto',
      minWidth: 0,
    }
    const CHIP_TONES = {
      brand: {},
      ok: {
        border: '1px solid color-mix(in srgb, ' + OK_COLOR + ' 55%, transparent)',
        background: 'color-mix(in srgb, ' + OK_COLOR + ' 16%, transparent)',
        color: OK_COLOR,
      },
      warn: {
        border: '1px solid color-mix(in srgb, var(--dsw-alias-state-warn-primary) 55%, transparent)',
        background: 'color-mix(in srgb, var(--dsw-alias-state-warn-primary) 16%, transparent)',
        color: 'var(--dsw-alias-state-warn-primary)',
      },
      error: {
        border: '1px solid color-mix(in srgb, ' + BAD_COLOR + ' 55%, transparent)',
        background: 'color-mix(in srgb, ' + BAD_COLOR + ' 16%, transparent)',
        color: BAD_COLOR,
      },
      muted: {
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'color-mix(in srgb, var(--dsw-alias-label-primary) 7%, transparent)',
        color: 'var(--dsw-alias-label-secondary)',
      },
    }
    const chipStyle = (tone) => ({ ...CHIP_BASE, ...(CHIP_TONES[tone] ?? CHIP_TONES.brand) })
    const CHIP_DOT = { boxSizing: 'border-box', width: 6, height: 6, borderRadius: '50%', background: 'currentColor', flex: '0 0 auto' }

    const S = {
      page: {
        width: '100%',
        maxWidth: 960,
        margin: '0 auto',
        padding: '24px 28px 40px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 16,
        color: 'inherit',
        flex: '1 1 auto',
        minHeight: 0,
        maxHeight: '100%',
        overflowY: 'auto',
        overflowX: 'hidden',
        overscrollBehavior: 'contain',
      },
      header: { display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' },
      logo: {
        flex: 'none',
        width: 52,
        height: 52,
        borderRadius: 14,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 26,
        lineHeight: 1,
        color: ACCENT,
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--dsw-alias-brand-primary) 24%, transparent), color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent))',
        border: '1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 22%, transparent)',
      },
      titles: { display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0, flex: '1 1 220px' },
      heading: { margin: 0, fontSize: 20, fontWeight: 600, lineHeight: 1.25, color: 'var(--dsw-alias-label-primary)' },
      subtitle: {
        margin: 0,
        fontSize: 12.5,
        lineHeight: 1.45,
        color: 'var(--dsw-alias-label-secondary)',
        maxWidth: '70ch',
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      },
      actions: { marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
      refresh: {
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 32,
        padding: '0 14px',
        borderRadius: 10,
        border: '1px solid var(--dsw-alias-border-l4)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: 12.5,
        fontWeight: 600,
        lineHeight: '20px',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        transition: 'background-color .12s ease,border-color .12s ease,color .12s ease',
      },
      grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 280px), 1fr))', gap: 16, alignItems: 'stretch' },
      stack: { display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 },
      card: {
        background: 'var(--dsw-alias-bg-layer-1)',
        border: '1px solid var(--dsw-alias-border-l2)',
        borderRadius: 14,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minWidth: 0,
      },
      cardHead: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
      cardTitle: {
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        fontSize: 14,
        fontWeight: 600,
        color: 'var(--dsw-alias-label-primary)',
      },
      stripe: { flex: 'none', width: 3, height: 14, borderRadius: 2, background: ACCENT },
      hint: { margin: 0, fontSize: 12, lineHeight: 1.5, color: 'var(--dsw-alias-label-tertiary)' },
      text: {
        margin: 0,
        fontSize: 12.5,
        lineHeight: 1.5,
        color: 'var(--dsw-alias-label-secondary)',
        textAlign: 'justify',
        hyphens: 'auto',
      },
      row: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
      list: { display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 },
      listRow: {
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: 10,
        padding: '8px 10px',
        borderRadius: 10,
        borderBottom: '1px solid var(--dsw-alias-border-l1)',
        fontSize: 12,
        lineHeight: 1.45,
        color: 'var(--dsw-alias-label-secondary)',
        minWidth: 0,
        overflowWrap: 'anywhere',
      },
      label: { fontSize: 12, color: 'var(--dsw-alias-label-secondary)' },
      mark: (ok) => ({
        flex: 'none',
        width: 16,
        textAlign: 'center',
        fontWeight: 700,
        color: ok ? OK_COLOR : BAD_COLOR,
      }),
      primary: {
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 36,
        padding: '0 14px',
        borderRadius: 10,
        border: '1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent)',
        background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent)',
        color: 'var(--dsw-alias-brand-primary)',
        font: 'inherit',
        fontSize: 12.5,
        fontWeight: 600,
        lineHeight: '20px',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
      },
      secondary: {
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 32,
        padding: '0 14px',
        borderRadius: 10,
        border: '1px solid var(--dsw-alias-border-l4)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: 12.5,
        fontWeight: 600,
        lineHeight: '20px',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
      },
      input: {
        height: 34,
        borderRadius: 9,
        border: '1px solid var(--dsw-alias-border-l2)',
        background: 'var(--dsw-alias-bg-layer-2)',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: 12.5,
        padding: '0 10px',
        boxSizing: 'border-box',
      },
      switchRow: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        fontSize: 12.5,
        lineHeight: 1.5,
        color: 'var(--dsw-alias-label-primary)',
        cursor: 'pointer',
      },
      error: { margin: 0, fontSize: 12, lineHeight: 1.5, color: BAD_COLOR },
      panellistActions: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        gap: 6,
        padding: '8px 4px 4px',
        minWidth: 0,
        maxHeight: 'min(60vh, 420px)',
        overflowY: 'auto',
        overflowX: 'hidden',
      },
      panellistTitle: {
        margin: '0 0 2px',
        flexShrink: 0,
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--dsw-alias-label-tertiary)',
      },
      panellistHintText: {
        margin: 0,
        flexShrink: 0,
        fontSize: 12,
        lineHeight: 1.45,
        color: 'var(--dsw-alias-label-secondary)',
        minWidth: 0,
        overflowWrap: 'anywhere',
      },
      panellistRow: {
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        flexShrink: 0,
        gap: 8,
        padding: '2px 0',
        minWidth: 0,
      },
      // Строка панели в карточке настроек: кликабельна целиком, поэтому
      // получает поля, радиус и курсор-указатель. Фон при наведении и фокусе
      // внутри — в PAGE_CSS (`data-dsh-polish-panel-row`).
      panelToggleRow: {
        boxSizing: 'border-box',
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        flexShrink: 0,
        gap: 8,
        padding: '8px 10px',
        borderRadius: 10,
        minWidth: 0,
        cursor: 'pointer',
      },
      panellistLabel: {
        flex: '1 1 120px',
        minWidth: 0,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        fontSize: 12.5,
        color: 'var(--dsw-alias-label-primary)',
      },
      panellistPin: {
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        height: 32,
        padding: '0 10px',
        borderRadius: 10,
        border: '1px solid var(--dsw-alias-border-l4)',
        background: 'transparent',
        color: 'var(--dsw-alias-label-primary)',
        font: 'inherit',
        fontSize: 12,
        fontWeight: 600,
        lineHeight: '20px',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
      },
      panellistPinAll: {
        boxSizing: 'border-box',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        flexShrink: 0,
        alignSelf: 'flex-start',
        height: 36,
        padding: '0 14px',
        borderRadius: 10,
        border: '1px solid color-mix(in srgb, var(--dsw-alias-brand-primary) 55%, transparent)',
        background: 'color-mix(in srgb, var(--dsw-alias-brand-primary) 18%, transparent)',
        color: 'var(--dsw-alias-brand-primary)',
        font: 'inherit',
        fontSize: 12.5,
        fontWeight: 600,
        lineHeight: '20px',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
      },
    }

    /** Скролл страницы: корень ограничивает высоту и прокручивается. */
    const PAGE_SCROLL_CSS =
      '/* --- Скролл страницы: корень ограничивает высоту и прокручивается --- */' +
      '[data-dsh-polish-page]{box-sizing:border-box;width:100%;min-width:0;min-height:0;max-height:100%;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain;scrollbar-width:thin;padding-bottom:40px;flex:1 1 auto}' +
      '/* --- Конец блока скролла страницы --- */'

    /** Адаптив и hover строк списка — то, что не выразить inline-стилями. */
    const PAGE_CSS =
      PAGE_SCROLL_CSS +
      '[data-dsh-polish-row]{overflow-wrap:anywhere}' +
      '[data-dsh-polish-row]:hover{background:color-mix(in srgb, var(--dsw-alias-label-primary) 5%, transparent)}' +
      // Строка панели в карточке «Панели в левом меню»: мягкий фон при
      // наведении и фокусе с клавиатуры, лёгкое усиление названия и чипа.
      '[data-dsh-polish-panel-row]{transition:background-color 120ms ease,border-color 120ms ease}' +
      '[data-dsh-polish-panel-row]:hover,[data-dsh-polish-panel-row]:focus-within{' +
      'background:var(--dsw-alias-interactive-bg-hover);' +
      'background:color-mix(in srgb, var(--dsw-alias-brand-primary) 8%, transparent)}' +
      '[data-dsh-polish-panel-row] [data-dsh-polish-panel-name]{transition:color 120ms ease,font-weight 120ms ease}' +
      '[data-dsh-polish-panel-row]:hover [data-dsh-polish-panel-name],' +
      '[data-dsh-polish-panel-row]:focus-within [data-dsh-polish-panel-name]{' +
      'font-weight:600;color:var(--dsw-alias-label-primary)}' +
      '[data-dsh-polish-panel-row] [data-dsh-polish-chip="status"]{transition:border-color 120ms ease}' +
      '[data-dsh-polish-panel-row]:hover [data-dsh-polish-chip="status"],' +
      '[data-dsh-polish-panel-row]:focus-within [data-dsh-polish-chip="status"]{' +
      'border-color:color-mix(in srgb, var(--dsw-alias-brand-primary) 35%, transparent) !important}' +
      '[data-dsh-polish-card]{justify-content:flex-start}' +
      '[data-dsh-polish-card] > *:last-child{margin-top:auto}' +
      '[data-dsh-polish-button="secondary"]:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover) !important}' +
      '[data-dsh-polish-button="pin"]:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover) !important}' +
      '[data-dsh-polish-button="refresh"]:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover) !important}' +
      '[data-dsh-polish-button="primary"]:hover:not(:disabled){background:color-mix(in srgb, var(--dsw-alias-brand-primary) 28%, transparent) !important}' +
      '[data-dsh-polish-button]:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}' +
      '[data-dsh-polish-button]:disabled{opacity:0.55;cursor:default}' +
      '@media (max-width: 900px){' +
      '[data-dsh-polish-page]{padding:20px 20px 36px !important}' +
      '[data-dsh-polish-grid]{grid-template-columns:1fr !important}' +
      '[data-dsh-polish-header]{align-items:flex-start}' +
      '}' +
      '@media (max-width: 640px){' +
      '[data-dsh-polish-page]{padding:18px 16px 32px !important}' +
      '[data-dsh-polish-actions]{margin-left:0 !important;width:100%}' +
      '[data-dsh-polish-row]{gap:6px}' +
      '[data-dsh-polish-row] > span{min-width:0 !important}' +
      '[data-dsh-polish-panel-row]{padding:8px !important;gap:6px !important}' +
      '[data-dsh-polish-panel-row] [data-dsh-polish-chip="status"]{flex:1 1 100% !important;justify-content:center}' +
      '[data-dsh-polish-button]{max-width:100%}' +
      '}'

    /** Подстановка {name} в строки словаря. */
    function fmt(text, values) {
      return String(text ?? '').replace(/\{(\w+)\}/g, (match, name) =>
        Object.hasOwn(values ?? {}, name) ? String(values[name]) : match,
      )
    }


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

    /* --- Панели, зарегистрированные плагинами ------------------------------- */

    /**
     * Список панелей — не константа, а проекция слота `sidebar.panellist`:
     * панели регистрируют сами плагины, и каждая запись даёт id строки
     * (`plugin-<id>`), порядок (`order`) и подпись (`label` — строка или
     * thunk, как в `resolveSlotLabel`). Хост обновляет такой слот, когда
     * плагин загрузился или выгрузился, поэтому новый плагин сам появляется
     * в настройках «Оформления».
     */
    let registeredPanels = []
    // id плагинов, у которых зарегистрирована main-панель: плагин установлен и
    // загружен, даже если строку левой панели он сейчас снял (панель выключена
    // или откреплена). Так карточка настроек не теряет панель, которую можно
    // вернуть, и не показывает записи выгруженных плагинов.
    let loadedPanelIds = new Set()
    // Метаданные панелей, которые видели за сессию: по ним меню «Ещё» может
    // вернуть и незнакомую панель, если плагин снял её строку, оставив панель
    // видимой-но-не-закреплённой.
    const panelCache = new Map()
    const registeredPanelListeners = new Set()
    // Слоты панелей: нужны, чтобы перечитать список сразу после регистрации или
    // снятия своей строки, не полагаясь только на `ctx.slots.subscribe`.
    let panelRegistrySlots = null

    /** Подпись панели из слота: строка или thunk, как `resolveSlotLabel`. */
    function resolveSlotLabel(label) {
      try {
        return typeof label === 'function' ? label() : label
      } catch (error) {
        console.error('[dsh-polish] подпись панели не прочитана:', error)
        return undefined
      }
    }

    /** id панели (`plugin-<id>`) → id плагина; чужие id остаются как есть. */
    function pluginIdOfPanel(panelId) {
      if (typeof panelId !== 'string') return ''
      return panelId.startsWith(SHORTCUT_PREFIX) ? panelId.slice(SHORTCUT_PREFIX.length) : panelId
    }

    /** Запись панели из слота → строка списка; null, если id нет. */
    function panelFromSlotEntry(entry) {
      const options = entry?.options ?? {}
      const panelId = typeof options?.id === 'string' ? options.id.trim() : ''
      if (panelId === '') return null
      const pluginId = pluginIdOfPanel(panelId)
      if (pluginId === '') return null
      const order = Number.isFinite(options?.order) ? Number(options.order) : 0
      const label = resolveSlotLabel(options?.label)
      const known = SHORTCUT_META_BY_ID.get(pluginId) ?? null
      return {
        panelId,
        pluginId,
        order,
        label: typeof label === 'string' && label.trim() !== '' ? label.trim() : '',
        known: known !== null,
        emoji: known !== null ? known.emoji : null,
      }
    }

    /** Панели из слота: без дублей по id панели и плагина, по `order`. */
    function collectRegisteredPanels(slots) {
      let entries = []
      try {
        if (typeof slots?.entriesOfSlot === 'function') entries = slots.entriesOfSlot(SIDEBAR_PANELLIST_SLOT)
      } catch (error) {
        console.error('[dsh-polish] список панелей не прочитан:', error)
      }
      const panels = []
      const seenPanels = new Set()
      const seenPlugins = new Set()
      for (const entry of Array.isArray(entries) ? entries : []) {
        const panel = panelFromSlotEntry(entry)
        if (panel === null) continue
        if (seenPanels.has(panel.panelId) || seenPlugins.has(panel.pluginId)) continue
        seenPanels.add(panel.panelId)
        seenPlugins.add(panel.pluginId)
        panels.push(panel)
      }
      panels.sort((a, b) => a.order - b.order)
      return panels
    }

    function panelSignature(panels) {
      return panels.map((panel) => [panel.panelId, panel.order, panel.label].join('\u0000')).join('\u0001')
    }

    /** id плагинов с зарегистрированной main-панелью (`plugin-<id>` → id). */
    function collectLoadedPanelIds(slots) {
      const ids = new Set()
      let entries = []
      try {
        if (typeof slots?.entriesOfSlot === 'function') entries = slots.entriesOfSlot(MAIN_PANEL_SLOT)
      } catch (error) {
        console.error('[dsh-polish] список main-панелей не прочитан:', error)
      }
      for (const entry of Array.isArray(entries) ? entries : []) {
        const options = entry?.options ?? {}
        const key = typeof options.key === 'string' && options.key !== '' ? options.key : options.id
        const pluginId = pluginIdOfPanel(key)
        if (pluginId !== '') ids.add(pluginId)
      }
      return ids
    }

    function idsSignature(ids) {
      return [...ids].sort().join('\u0001')
    }

    /** Перечитать слоты и, если списки изменились, разбудить подписчиков. */
    function syncRegisteredPanels(slots) {
      const next = collectRegisteredPanels(slots)
      const nextLoaded = collectLoadedPanelIds(slots)
      for (const panel of next) panelCache.set(panel.pluginId, panel)
      const panelsChanged = panelSignature(next) !== panelSignature(registeredPanels)
      const loadedChanged = idsSignature(nextLoaded) !== idsSignature(loadedPanelIds)
      registeredPanels = next
      loadedPanelIds = nextLoaded
      if (!panelsChanged && !loadedChanged) return false
      for (const listener of [...registeredPanelListeners]) {
        try {
          listener()
        } catch (error) {
          console.error('[dsh-polish] подписчик списка панелей упал:', error)
        }
      }
      return true
    }

    function subscribeRegisteredPanels(listener) {
      registeredPanelListeners.add(listener)
      return () => {
        registeredPanelListeners.delete(listener)
      }
    }

    function registeredPanelIds() {
      return registeredPanels.map((panel) => panel.pluginId)
    }

    /**
     * Панель по id для меню «Ещё», даже если строка уже снята: известные id
     * берут метаданные из карты, остальные — из кэша сессии (пока мы видели их
     * зарегистрированными). Неизвестный и невиденный id восстановить нечем.
     */
    function fallbackPanel(pluginId) {
      const cached = panelCache.get(pluginId)
      if (cached !== undefined) return cached
      const meta = SHORTCUT_META_BY_ID.get(pluginId)
      if (meta === undefined) return null
      return {
        panelId: SHORTCUT_PREFIX + pluginId,
        pluginId,
        order: meta.order,
        label: '',
        known: true,
        emoji: meta.emoji,
      }
    }

    /**
     * Строки карточки «Панели в левом меню»: зарегистрированные панели плюс
     * известные панели установленных плагинов, чью строку плагин снял сам
     * (выключенная или откреплённая панель). Плагин без main-панели считается
     * выгруженным/неустановленным — такие записи не показываются, но остаются
     * в `known`.
     */
    function cardPanels() {
      const panels = [...registeredPanels]
      const seen = new Set(panels.map((panel) => panel.pluginId))
      for (const id of panelState.known) {
        if (seen.has(id) || !loadedPanelIds.has(id)) continue
        const fallback = fallbackPanel(id)
        if (fallback !== null) panels.push(fallback)
      }
      return panels.sort((a, b) => a.order - b.order)
    }

    /**
     * Порядок id в общем списке: `order` зарегистрированной панели, затем
     * запасной `order` из карты известных плагинов или кэша (панель может быть
     * откреплена и временно отсутствовать в слоте), затем — конец списка.
     */
    function panelOrderValue(id) {
      const panel = registeredPanels.find((item) => item.pluginId === id)
      if (panel !== undefined) return panel.order
      const fallback = fallbackPanel(id)
      return fallback !== null ? fallback.order : Number.MAX_SAFE_INTEGER
    }

    function sortByPanelOrder(ids) {
      return ids.sort((a, b) => panelOrderValue(a) - panelOrderValue(b))
    }

    /** Название панели: словарь для известных, подпись слота для новых. */
    function panelTitle(panel) {
      if (panel === null || panel === undefined) return ''
      if (panel.known) {
        const key = 'shortcut.' + panel.pluginId + '.title'
        const title = translate(key)
        if (typeof title === 'string' && title !== '' && title !== key) return title
      }
      return panel.label !== '' ? panel.label : panel.pluginId
    }

    /** Эмодзи панели: свои — из карты, новые — по подписи или 🧩. */
    function panelEmojiFor(panel) {
      if (panel === null || panel === undefined) return DEFAULT_PANEL_EMOJI
      if (panel.emoji !== null && panel.emoji !== undefined) return panel.emoji
      return emojiForPanelLabel(panel.label) ?? DEFAULT_PANEL_EMOJI
    }

    /**
     * Следить за слотом панелей и локалью: подписи новых панелей — thunk,
     * они меняются при смене языка. Новые и снятые панели попадают в настройки
     * без перезагрузки страницы.
     */
    function installPanelRegistry(ctx) {
      panelRegistrySlots = ctx.slots
      syncRegisteredPanels(ctx.slots)
      for (const slotName of [SIDEBAR_PANELLIST_SLOT, MAIN_PANEL_SLOT]) {
        try {
          ctx.effect(
            () =>
              ctx.slots.subscribe(slotName, () => {
                syncRegisteredPanels(ctx.slots)
                syncFallbackPanels(ctx)
              }),
            'dsh-polish: panel slot ' + slotName,
          )
        } catch (error) {
          console.error('[dsh-polish] подписка на слот панелей недоступна:', error)
        }
      }
      try {
        if (typeof ctx.locale?.subscribe === 'function') {
          ctx.effect(
            () => ctx.locale.subscribe(() => syncRegisteredPanels(ctx.slots)),
            'dsh-polish: panel labels',
          )
        }
      } catch (error) {
        console.error('[dsh-polish] подписка на язык панелей недоступна:', error)
      }
    }

    /* --- Страховочная регистрация недостающих строк панелей ----------------- */

    /**
     * Иногда плагин регистрирует main-панель (`main`, key `plugin-<id>`), но
     * строку `sidebar.panellist` не создаёт (не успел, ошибся в обработке
     * события, состояние закрепления потерялось). Тогда панель пропадает из
     * левой панели, хотя установлена. Страховка: для каждой main-панели с
     * ключом `plugin-*`, у которой нет строки в `sidebar.panellist`, но панель
     * должна быть закреплена, `dsh-polish` регистрирует строку сам — с
     * эмодзи-иконкой, названием из словаря и порядком из карты плагинов.
     * Чужие строки не трогаем, дублей не создаём; при выключении или выгрузке
     * плагина свою строку снимаем.
     */
    const fallbackSidebarRows = new Map()
    // id, где уже есть чужая (настоящая) запись: свою строку не возвращаем,
    // пока чужая не исчезнет. Защищает от цикла «регистрация ↔ снятие», если
    // чужая запись есть, но хост её не показывает (например, упала).
    const fallbackBlockedRows = new Map()
    let fallbackSyncActive = false

    /** Название для страховочной строки: словарь, кэш или id с заглавной. */
    function fallbackPanelLabel(pluginId) {
      const key = 'shortcut.' + pluginId + '.title'
      if (SHORTCUT_META_BY_ID.has(pluginId)) {
        const translated = translate(key)
        if (typeof translated === 'string' && translated !== '' && translated !== key) return translated
      }
      const cached = panelCache.get(pluginId)
      if (cached !== undefined && cached.label !== '') return cached.label
      const text = String(pluginId ?? '').replace(/[._-]+/g, ' ').trim()
      if (text === '') return String(pluginId ?? '')
      return text.charAt(0).toUpperCase() + text.slice(1)
    }

    /** Эмодзи для страховочной строки: карта плагинов, карта меток или 🧩. */
    function fallbackPanelEmoji(pluginId) {
      const meta = SHORTCUT_META_BY_ID.get(pluginId)
      if (meta !== undefined) return meta.emoji
      return emojiForPanelLabel(fallbackPanelLabel(pluginId)) ?? DEFAULT_PANEL_EMOJI
    }

    /** Порядок страховочной строки: из карты плагинов, кэша или в конце. */
    function fallbackPanelOrder(pluginId) {
      const meta = SHORTCUT_META_BY_ID.get(pluginId)
      if (meta !== undefined) return meta.order
      const cached = panelCache.get(pluginId)
      if (cached !== undefined) return cached.order
      return 200
    }

    /** Эмодзи-иконка строки: размер запрашивает хост (16/18 px). */
    function emojiPanelIcon(emoji) {
      return function EmojiPanelIcon(props) {
        const requested = Number(props?.size)
        const size = Number.isFinite(requested) && requested > 0 ? requested : 16
        return h(
          'span',
          {
            'data-dsh-polish-icon': 'fallback',
            'aria-hidden': true,
            style: {
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: size,
              height: size,
              fontSize: size,
              lineHeight: 1,
            },
          },
          emoji,
        )
      }
    }

    /** Записи слота как есть: `entries` хоста, иначе дедуплицированный список. */
    function rawPanelEntries(slots, slotName) {
      try {
        if (typeof slots?.entries === 'function') return slots.entries(slotName) ?? []
      } catch (error) {
        console.error('[dsh-polish] записи слота не прочитаны:', error)
      }
      try {
        if (typeof slots?.entriesOfSlot === 'function') return slots.entriesOfSlot(slotName) ?? []
      } catch {
        // слота ещё нет — записей нет
      }
      return []
    }

    /** Зарегистрировать свою страховочную строку панели. */
    function registerFallbackSidebarRow(ctx, panelId) {
      const pluginId = pluginIdOfPanel(panelId)
      if (pluginId === '') return
      // Уникальный thunk подписи: хост копирует options, но функцию сохраняет
      // по ссылке — по ней и отличаем свою строку от строки самого плагина.
      const label = () => fallbackPanelLabel(pluginId)
      const options = {
        name: SIDEBAR_PANELLIST_SLOT,
        id: panelId,
        order: fallbackPanelOrder(pluginId),
        label,
        locale: NS,
      }
      const icon = emojiPanelIcon(fallbackPanelEmoji(pluginId))
      let dispose = null
      try {
        dispose = ctx.slots.inject(SIDEBAR_PANELLIST_SLOT, () => ctx.slots.register(options, icon))
      } catch (error) {
        console.error('[dsh-polish] страховочная строка панели недоступна:', panelId, error)
      }
      if (typeof dispose === 'function') fallbackSidebarRows.set(panelId, { dispose, options, label })
    }

    /** Снять свою страховочную строку, если она есть. */
    function disposeFallbackSidebarRow(panelId) {
      const row = fallbackSidebarRows.get(panelId)
      if (row === undefined) return
      fallbackSidebarRows.delete(panelId)
      try {
        if (typeof row.dispose === 'function') row.dispose()
      } catch (error) {
        console.error('[dsh-polish] не удалось снять страховочную строку панели:', panelId, error)
      }
    }

    /** Снять все свои страховочные строки (выгрузка плагина). */
    function disposeAllFallbackSidebarRows() {
      for (const panelId of [...fallbackSidebarRows.keys()]) disposeFallbackSidebarRow(panelId)
    }

    /**
     * Пересчитать страховочные строки: добавить недостающие закреплённые и
     * снять лишние — только свои. Вызывается при изменении слотов `main` и
     * `sidebar.panellist`, событиях состояния и выгрузке.
     */
    function syncFallbackPanels(ctx) {
      const slots = ctx?.slots
      if (fallbackSyncActive || slots === null || slots === undefined) return
      if (
        typeof slots.inject !== 'function' ||
        typeof slots.register !== 'function' ||
        typeof slots.entriesOfSlot !== 'function'
      ) {
        return
      }
      fallbackSyncActive = true
      try {
        const rows = rawPanelEntries(slots, SIDEBAR_PANELLIST_SLOT)
        // Снять свои строки, которым больше не место: панель выключена или
        // откреплена, плагин выгружен, или есть настоящая строка того же id.
        for (const [panelId, row] of [...fallbackSidebarRows]) {
          const pluginId = pluginIdOfPanel(panelId)
          // Чужая (настоящая) строка того же id: хост хранит копию options, но
          // функцию подписи — по ссылке, поэтому своя узнаётся по ней.
          const foreign = rows.some(
            (entry) => entry?.options?.id === panelId && entry?.options?.label !== row.label,
          )
          if (foreign) {
            // Пока чужая запись на месте, свою не возвращаем — иначе цикл.
            fallbackBlockedRows.set(panelId, row.label)
            disposeFallbackSidebarRow(panelId)
            continue
          }
          fallbackBlockedRows.delete(panelId)
          if (!isPanelPinned(pluginId) || !loadedPanelIds.has(pluginId)) {
            disposeFallbackSidebarRow(panelId)
          }
        }
        // Чужая запись исчезла (плагин снял строку) — страховка снова разрешена.
        for (const [panelId, ourLabel] of [...fallbackBlockedRows]) {
          const foreign = rows.some(
            (entry) => entry?.options?.id === panelId && entry?.options?.label !== ourLabel,
          )
          if (!foreign) fallbackBlockedRows.delete(panelId)
        }
        // Добавить недостающие: main-панель есть, строки нет, панель закреплена.
        const present = new Set(
          rawPanelEntries(slots, SIDEBAR_PANELLIST_SLOT)
            .map((entry) => entry?.options?.id)
            .filter((id) => typeof id === 'string' && id !== ''),
        )
        for (const entry of rawPanelEntries(slots, MAIN_PANEL_SLOT)) {
          const options = entry?.options ?? {}
          const panelId = typeof options.key === 'string' ? options.key : ''
          if (!panelId.startsWith(SHORTCUT_PREFIX)) continue
          // Своя строка управляется syncPolishSidebar — не дублируем её.
          if (panelId === POLISH_PANEL_ID) continue
          if (fallbackBlockedRows.has(panelId)) continue
          if (present.has(panelId) || fallbackSidebarRows.has(panelId)) continue
          const pluginId = pluginIdOfPanel(panelId)
          if (pluginId === '' || !isPanelPinned(pluginId)) continue
          registerFallbackSidebarRow(ctx, panelId)
        }
      } finally {
        fallbackSyncActive = false
      }
    }

    /* --- Видимость и закрепление панелей левой панели ---------------------- */

    /**
     * Пустое состояние: записей нет, поэтому любая зарегистрированная панель
     * считается видимой и закреплённой — ровно так её и регистрирует плагин.
     * Ключ в localStorage до первого изменения не пишется.
     */
    function emptyPanelState() {
      return { visible: [], pinned: [], known: [] }
    }

    /**
     * Привести сохранённое состояние к строкам id. `known` — id, о которых
     * состояние уже знает: если id есть в `known`, но нет в `visible`/`pinned`,
     * панель выключена; id вне `known` — новая панель плагина (по умолчанию
     * видна и закреплена). Старые записи без `known` знают ровно те id, что
     * перечислены в `visible`/`pinned`, поэтому новые панели после обновления
     * плагина тоже считаются видимыми и закреплёнными.
     */
    function normalizePanelState(value) {
      const visible = []
      const pinned = []
      const known = []
      const take = (list, target) => {
        if (!Array.isArray(list)) return
        for (const item of list) {
          if (typeof item !== 'string') continue
          const id = item.trim()
          if (id === '' || target.includes(id)) continue
          target.push(id)
        }
      }
      take(value?.known, known)
      take(value?.visible, visible)
      take(value?.pinned, pinned)
      for (const id of [...visible, ...pinned]) {
        if (!known.includes(id)) known.push(id)
      }
      // Старый формат (1.4.21 и раньше) хранил только visible/pinned и всегда
      // перечислял все одиннадцать наших id: отсутствие id значит «выключена»,
      // а не «новая панель». Дополняем known картой известных плагинов, иначе
      // выключенная до обновления панель снова стала бы видимой.
      const legacy = !Array.isArray(value?.known)
      if (legacy) {
        for (const meta of SHORTCUT_META) {
          if (!known.includes(meta.id)) known.push(meta.id)
        }
      }
      return {
        visible: sortByPanelOrder(visible),
        pinned: sortByPanelOrder(pinned.filter((id) => visible.includes(id))),
        known: sortByPanelOrder(known),
      }
    }

    function readPanelState() {
      try {
        const raw = localStorage.getItem(PANEL_VISIBILITY_KEY)
        if (raw === null || raw === '') return emptyPanelState()
        return normalizePanelState(JSON.parse(raw))
      } catch {
        return emptyPanelState()
      }
    }

    let panelState = readPanelState()
    const panelStateListeners = new Set()

    /** id, о которых состояние знает: выключенная панель остаётся в `known`. */
    function isPanelKnown(id) {
      return panelState.known.includes(id)
    }

    function isPanelVisible(id) {
      return isPanelKnown(id) ? panelState.visible.includes(id) : true
    }

    function isPanelPinned(id) {
      return isPanelKnown(id) ? panelState.pinned.includes(id) : true
    }

    /** Все id, которые состояние должно помнить: записи + зарегистрированные. */
    function statePanelIds() {
      const ids = [...panelState.known]
      for (const id of registeredPanelIds()) {
        if (!ids.includes(id)) ids.push(id)
      }
      return sortByPanelOrder(ids)
    }

    /** Снимок для UI и события: реальные `visible`/`pinned` всех известных id. */
    function getPanelState() {
      const ids = statePanelIds()
      return {
        visible: ids.filter((id) => isPanelVisible(id)),
        pinned: ids.filter((id) => isPanelPinned(id)),
      }
    }

    function writePanelState() {
      try {
        localStorage.setItem(PANEL_VISIBILITY_KEY, JSON.stringify(panelState))
      } catch {
        // без хранилища состояние живёт до перезагрузки
      }
    }

    /**
     * Сообщить плагинам, что видимость или закрепление изменились.
     *
     * Каждый плагин сам регистрирует main-панель и строку `sidebar.panellist`;
     * по этому событию он перерегистрирует или снимает строку. `detail` —
     * снимок состояния `{ visible, pinned }` (массивы id): в нём есть и новые
     * панели, которых ещё нет в localStorage, — их плагин видит по умолчанию
     * закреплёнными.
     */
    function dispatchPanelsChanged(state) {
      try {
        if (typeof window === 'undefined' || typeof window.dispatchEvent !== 'function') return
        const CustomEventCtor =
          typeof window.CustomEvent === 'function'
            ? window.CustomEvent
            : typeof CustomEvent === 'function'
              ? CustomEvent
              : null
        if (CustomEventCtor === null) return
        window.dispatchEvent(
          new CustomEventCtor(PANELS_CHANGED_EVENT, {
            detail: { visible: [...state.visible], pinned: [...state.pinned] },
          }),
        )
      } catch (error) {
        console.error('[dsh-polish] событие панелей не отправлено:', error)
      }
    }

    function notifyPanelStateListeners() {
      for (const listener of [...panelStateListeners]) {
        try {
          listener(getPanelState())
        } catch (error) {
          console.error('[dsh-polish] подписчик панелей упал:', error)
        }
      }
    }

    /**
     * Сохранить изменение: в `known` попадают все id, которые состояние видело
     * (записи и зарегистрированные панели), поэтому ранее известные записи не
     * теряются, а новые панели после первого изменения запоминаются как
     * выключенные/включённые в явном виде.
     */
    function commitPanelState(next) {
      const known = [...panelState.known]
      for (const id of [...(next?.visible ?? []), ...(next?.pinned ?? []), ...registeredPanelIds()]) {
        if (typeof id !== 'string' || id === '' || known.includes(id)) continue
        known.push(id)
      }
      panelState = normalizePanelState({ visible: next?.visible, pinned: next?.pinned, known })
      writePanelState()
      dispatchPanelsChanged(getPanelState())
      notifyPanelStateListeners()
    }

    /** Перечитать состояние из localStorage и обновить подписчиков без записи. */
    function adoptPanelStateFromStorage() {
      panelState = readPanelState()
      notifyPanelStateListeners()
    }

    /** Подписка на изменение видимости/закрепления: возвращает отписку. */
    function subscribePanelState(listener) {
      panelStateListeners.add(listener)
      return () => {
        panelStateListeners.delete(listener)
      }
    }

    /** id панели хоста → id плагина, если это наша зарегистрированная панель. */
    function shortcutIdFromPanel(panelId) {
      const panel = registeredPanels.find((item) => item.panelId === panelId)
      return panel === undefined ? null : panel.pluginId
    }

    /**
     * Панели, которые видны, но не закреплены: их место — меню «Ещё».
     * Это зарегистрированные панели, а также известные панели, чья строка
     * сейчас не зарегистрирована (откреплённый плагин снимает её сам): для них
     * берём метаданные из карты известных плагинов или из кэша сессии. Совсем
     * незнакомый id без регистрации восстановить нечем — он останется в `known`.
     */
    function visibleUnpinnedPanels() {
      const panels = []
      const seen = new Set()
      for (const panel of registeredPanels) {
        seen.add(panel.pluginId)
        if (isPanelVisible(panel.pluginId) && !isPanelPinned(panel.pluginId)) panels.push(panel)
      }
      for (const id of panelState.known) {
        if (seen.has(id)) continue
        if (!isPanelVisible(id) || isPanelPinned(id)) continue
        const fallback = fallbackPanel(id)
        if (fallback !== null) panels.push(fallback)
      }
      return panels.sort((a, b) => a.order - b.order)
    }

    /* --- Управление видимостью и закреплением ------------------------------ */

    /** Есть ли панель с таким id: зарегистрирована сейчас или известна состоянию. */
    function hasPanelId(id) {
      return (
        typeof id === 'string' &&
        id !== '' &&
        (registeredPanelIds().includes(id) || isPanelKnown(id))
      )
    }

    /**
     * Показывать или скрыть панель плагина из настроек «Оформления».
     * Включение добавляет id только в `visible` — плагин уходит в меню «Ещё»,
     * где его закрепляют кнопкой. Выключение убирает id и из `visible`, и из
     * `pinned`: панель не видна ни в левой панели, ни в «Ещё». Работает для
     * любого зарегистрированного id, включая новые плагины.
     */
    function setPanelVisible(id, visible) {
      const snapshot = getPanelState()
      if (!hasPanelId(id)) return snapshot
      const visibleIds = snapshot.visible.filter((item) => item !== id)
      const pinnedIds = snapshot.pinned.filter((item) => item !== id)
      if (visible) visibleIds.push(id)
      commitPanelState({ visible: visibleIds, pinned: pinnedIds })
      return getPanelState()
    }

    /** Закрепить панель плагина: id попадает в `pinned`, плагин возвращает строку. */
    function pinShortcutPanel(id) {
      if (!hasPanelId(id)) return false
      const snapshot = getPanelState()
      const visibleIds = snapshot.visible.includes(id) ? [...snapshot.visible] : [...snapshot.visible, id]
      const pinnedIds = [...snapshot.pinned.filter((item) => item !== id), id]
      commitPanelState({ visible: visibleIds, pinned: pinnedIds })
      return true
    }

    /** «Закрепить все панели (N)»: все переданные id — в `pinned` одним изменением. */
    function pinAllShortcutPanels(ids) {
      const snapshot = getPanelState()
      const visibleIds = [...snapshot.visible]
      const pinnedIds = [...snapshot.pinned]
      const done = []
      for (const id of Array.isArray(ids) ? ids : []) {
        if (!hasPanelId(id)) continue
        if (!visibleIds.includes(id)) visibleIds.push(id)
        if (!pinnedIds.includes(id)) pinnedIds.push(id)
        done.push(id)
      }
      if (done.length > 0) commitPanelState({ visible: visibleIds, pinned: pinnedIds })
      return done
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
            // Тот же защищённый путь, что у кнопки: занято — предупреждение,
            // свободно — перезагрузка через хост.
            void requestGuardedReload()
          }
          /** Хост отложил Ctrl+R/F5: показываем то же предупреждение и force. */
          const onBlocked = (event) => {
            const active = Array.isArray(event?.detail?.active) ? event.detail.active : []
            showReloadWarning({ active, message: translate('reloadBusy') }, () => { void requestForcedReload() })
          }
          window.addEventListener(RELOAD_BLOCKED_EVENT, onBlocked, true)
          window.addEventListener('keydown', handler, true)
          return () => {
            window.removeEventListener(RELOAD_BLOCKED_EVENT, onBlocked, true)
            window.removeEventListener('keydown', handler, true)
          }
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

    /* --- Цветные эмодзи-иконки левой панели --------------------------------- */

    /** Ключ карты меток: без регистра, лишних пробелов и неразрывных пробелов. */
    function panelEmojiKey(label) {
      return String(label ?? '')
        .replace(/[\u00a0\u2007\u202f]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase()
    }

    /** Эмодзи для aria-label панели или null, если метка не наша. */
    function emojiForPanelLabel(label) {
      const key = panelEmojiKey(label)
      if (key === '') return null
      return Object.hasOwn(PANEL_EMOJI_BY_LABEL, key) ? PANEL_EMOJI_BY_LABEL[key] : null
    }

    function isElementNode(node) {
      return node !== null && node !== undefined && node.nodeType === 1
    }

    function tagOf(node) {
      return String(node?.tagName ?? '').toUpperCase()
    }

    /** Первый потомок с классом, содержащим `panelGlyph` (хост хеширует имена). */
    function panelGlyphOf(node) {
      for (const child of childNodesOf(node)) {
        if (!isElementNode(child)) continue
        if (String(child.className ?? '').includes('panelGlyph')) return child
        const nested = panelGlyphOf(child)
        if (nested !== null) return nested
      }
      return null
    }

    /** Есть ли внутри иконки SVG (одноцветный глиф хоста или плагина). */
    function hasSvgGlyph(node) {
      for (const child of childNodesOf(node)) {
        if (!isElementNode(child)) continue
        if (tagOf(child) === 'SVG') return true
        if (hasSvgGlyph(child)) return true
      }
      return false
    }

    /** Свой текст внутри глифа: иконка уже текстовая или эмодзи — не вмешиваемся. */
    function hasOwnText(node) {
      if (node === null || node === undefined) return false
      if (node.nodeType === 3) return String(node.nodeValue ?? '').trim() !== ''
      // Текст внутри SVG (title, desc) — не повод считать иконку текстовой.
      if (tagOf(node) === 'SVG') return false
      const children = childNodesOf(node)
      if (children.length === 0) {
        return isElementNode(node) && String(node.textContent ?? '').trim() !== ''
      }
      for (const child of children) {
        if (hasOwnText(child)) return true
      }
      return false
    }

    /**
     * Пометка одной кнопки левой панели. Возвращает true, если эмодзи стоит.
     * aria-label и обработчики не трогаем: только data-атрибуты.
     */
    function markPanelButton(button) {
      if (!isElementNode(button) || tagOf(button) !== 'BUTTON') return false
      const emoji = emojiForPanelLabel(typeof button.getAttribute === 'function' ? button.getAttribute('aria-label') : null)
      const glyph = panelGlyphOf(button)
      const eligible = emoji !== null && glyph !== null && hasSvgGlyph(glyph) && !hasOwnText(glyph)
      if (!eligible) {
        if (button.getAttribute?.(PANEL_EMOJI_ATTR) !== null && button.getAttribute?.(PANEL_EMOJI_ATTR) !== undefined) {
          button.removeAttribute(PANEL_EMOJI_ATTR)
        }
        if (glyph !== null && glyph.getAttribute?.(PANEL_EMOJI_ATTR) !== null) {
          glyph.removeAttribute(PANEL_EMOJI_ATTR)
        }
        return false
      }
      if (button.getAttribute?.(PANEL_EMOJI_ATTR) !== emoji) button.setAttribute(PANEL_EMOJI_ATTR, emoji)
      // content: attr() в ::before читает атрибут с самого span.panelGlyph.
      if (glyph.getAttribute?.(PANEL_EMOJI_ATTR) !== emoji) glyph.setAttribute(PANEL_EMOJI_ATTR, emoji)
      return true
    }

    function panelButtonsOf(nav) {
      if (nav !== null && nav !== undefined && typeof nav.querySelectorAll === 'function') {
        try {
          return Array.from(nav.querySelectorAll('button'))
        } catch {
          // ниже попробуем документ
        }
      }
      try {
        return Array.from(document.querySelectorAll('nav button'))
      } catch {
        return []
      }
    }

    function clearPanelEmoji() {
      try {
        for (const element of Array.from(document.querySelectorAll('[' + PANEL_EMOJI_ATTR + ']'))) {
          if (typeof element.removeAttribute === 'function') element.removeAttribute(PANEL_EMOJI_ATTR)
        }
      } catch {
        // вне браузера снимать нечего
      }
    }

    /**
     * Глобальный эффект: одна MutationObserver на левую панель (или на body,
     * пока панели нет — плагин грузится на старте приложения), первичный
     * проход и повторная пометка после перерисовок и смены языка. При
     * выключении оформления атрибуты снимаются, observer отключается.
     */
    function applyPanelEmoji(ctx) {
      try {
        ctx.effect(() => {
          if (!isEnabled()) {
            clearPanelEmoji()
            return () => {}
          }
          let observer = null
          let observed = null

          const pass = () => {
            let nav = null
            try {
              nav = document.querySelector('nav')
            } catch {
              nav = null
            }
            const root = nav ?? (typeof document.body !== 'undefined' ? document.body : null)
            for (const button of panelButtonsOf(nav)) markPanelButton(button)
            if (root === null || root === observed) return
            if (observer !== null) {
              try {
                observer.disconnect()
              } catch {
                // уже отключён
              }
            }
            observed = root
            try {
              observer = new MutationObserver(() => pass())
              observer.observe(root, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['aria-label'],
              })
            } catch {
              observer = null
            }
          }

          pass()
          return () => {
            if (observer !== null) {
              try {
                observer.disconnect()
              } catch {
                // уже отключён
              }
            }
            observer = null
            observed = null
            clearPanelEmoji()
          }
        }, 'dsh-polish: panel emoji')
      } catch (error) {
        console.error('[dsh-polish] эмодзи-иконки левой панели недоступны:', error)
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

    /** Карточка-секция страницы: заголовок с акцентной полоской и содержимое. */
    function cardSection(id, title, actions, ...children) {
      return h(
        'section',
        { style: S.card, 'data-dsh-polish-card': id },
        h(
          'div',
          { style: S.cardHead },
          h('div', { style: S.cardTitle }, h('span', { style: S.stripe }), title),
          actions ?? null,
        ),
        ...children,
      )
    }

    /** Маленькая secondary-кнопка внутри карточек. */
    function smallButton(label, onClick, disabled) {
      return h(
        'button',
        {
          type: 'button',
          style: S.secondary,
          disabled: disabled === true,
          'data-dsh-polish-button': 'secondary',
          onClick,
        },
        label,
      )
    }

    /** Статус-чип: кнопочная форма (высота 32, radius 10) и точка 6 px. */
    function chipNode(label, tone) {
      return h(
        'span',
        { style: chipStyle(tone ?? 'brand'), 'data-dsh-polish-chip': 'status', role: 'status' },
        h('span', { style: CHIP_DOT }),
        label,
      )
    }

    /**
     * Карточка «Панели в левом меню»: список строится из зарегистрированных
     * панелей (`ctx.slots.entriesOfSlot('sidebar.panellist')`) и известных
     * панелей установленных плагинов (по main-слоту), с переключателем
     * «Показывать в левом меню» у каждой. Новый плагин появляется здесь сам:
     * порядок — по `order` слота, подпись — из словаря для известных плагинов
     * или из слота для новых. Состояние — в localStorage (панели вне `known`
     * считаются видимыми и закреплёнными); каждое изменение уходит событием
     * `dsh-polish:panels-changed`, и плагины сами перерегистрируют строку.
     */
    function PanelsBlock() {
      const t = (key) => translate(key)
      const [state, setState] = React.useState(() => getPanelState())
      const [, setPanelsRevision] = React.useState(0)
      React.useEffect(() => {
        const offState = subscribePanelState(() => setState(getPanelState()))
        const offPanels = subscribeRegisteredPanels(() => {
          // Новая панель по умолчанию видима: обновляем и снимок состояния,
          // иначе её флажок остался бы снятым до следующего изменения.
          setState(getPanelState())
          setPanelsRevision((value) => value + 1)
        })
        return () => {
          offState()
          offPanels()
        }
      }, [])
      const panels = cardPanels()
      const toggle = (id, nextVisible) => {
        setPanelVisible(id, nextVisible)
        setState(getPanelState())
      }
      const visibleCount = panels.filter((panel) => state.visible.includes(panel.pluginId)).length
      /**
       * Клик по строке переключает панель целиком, но клик по флажку и его
       * подписи уже обрабатывает сам флажок: строку второй раз не трогаем,
       * иначе переключение сработало бы дважды.
       */
      const switchHandlesClick = (event) => {
        let node = event?.target ?? null
        for (let depth = 0; node !== null && node !== undefined && depth < 16; depth += 1) {
          const tag = String(node.tagName ?? '').toUpperCase()
          if (tag === 'INPUT' || tag === 'LABEL') return true
          node = node.parentElement ?? null
        }
        return false
      }
      const actions = chipNode(
        fmt(t('panelsVisibleCount'), { count: visibleCount, total: panels.length }),
        'brand',
      )
      return cardSection(
        'panels',
        t('panelsTitle'),
        actions,
        h('p', { style: S.text }, t('panelsHint')),
        panels.length === 0
          ? h('p', { style: S.hint, 'data-dsh-polish-panels-empty': 'true' }, t('panelsEmpty'))
          : h(
              'div',
              { style: S.list, 'data-dsh-polish-panels-list': 'list' },
              ...panels.map((panel) => {
                const visible = state.visible.includes(panel.pluginId)
                const pinned = state.pinned.includes(panel.pluginId)
                const name = panelTitle(panel)
                const emoji = panelEmojiFor(panel)
                return h(
                  'div',
                  {
                    key: panel.pluginId,
                    style: S.panelToggleRow,
                    'data-dsh-polish-panel-row': panel.pluginId,
                    // Вся строка — цель клика: наведение подсвечивает её фон,
                    // клик в любом месте (кроме самого флажка) переключает панель.
                    onClick: (event) => {
                      if (switchHandlesClick(event)) return
                      toggle(panel.pluginId, !visible)
                    },
                  },
                  h('span', { 'aria-hidden': true, style: { flex: 'none', fontSize: 15, lineHeight: 1 } }, emoji),
                  h(
                    'span',
                    { style: S.panellistLabel, title: name, 'data-dsh-polish-panel-name': panel.pluginId },
                    name,
                  ),
                  h(
                    'label',
                    { style: S.switchRow },
                    h('input', {
                      type: 'checkbox',
                      checked: visible,
                      'data-dsh-polish-panel-toggle': panel.pluginId,
                      'aria-label': t('panelsShowLabel') + ': ' + name,
                      onChange: (event) => toggle(panel.pluginId, event.target.checked),
                    }),
                    h('span', null, t('panelsShowLabel')),
                  ),
                  visible ? chipNode(pinned ? t('panelsPinned') : t('panelsInMore'), pinned ? 'ok' : 'brand') : null,
                )
              }),
            ),
        h('p', { style: S.hint }, t('panelsVisibilityHint')),
        h('p', { style: S.hint }, t('shortcutHint')),
      )
    }

    /**
     * Меню «Ещё» в левой панели: список панелей, которые видны, но не
     * закреплены, с кнопкой «Закрепить» у каждой и общей кнопкой
     * «Закрепить все панели (N)». Наши строки берутся из состояния,
     * откреплённые панели хоста — из `entries`, без дублей по id.
     * Закрепление нашей панели меняет состояние и отправляет событие
     * `dsh-polish:panels-changed`: строку левой панели вернёт сам плагин.
     * Слот рендерится внутри меню, поэтому после действия меню закрываем.
     */
    function PanellistActions(props) {
      const t = (key) => translate(key)
      const entries = Array.isArray(props?.entries) ? props.entries : []
      const labelOf = (entry) =>
        typeof entry?.label === 'string' && entry.label !== '' ? entry.label : String(entry?.id ?? '')
      // Сначала наши видимые-но-не-закреплённые панели: их может не быть в
      // entries, пока панель не зарегистрирована.
      const rows = []
      const seen = new Set()
      for (const panel of visibleUnpinnedPanels()) {
        seen.add(panel.panelId)
        rows.push({ id: panel.panelId, label: panelTitle(panel), pluginId: panel.pluginId })
      }
      // Затем откреплённые панели хоста — кроме тех, что уже есть в нашем списке.
      for (const entry of entries) {
        if (typeof entry?.id !== 'string' || entry.id === '' || entry.pinned === true) continue
        if (seen.has(entry.id)) continue
        seen.add(entry.id)
        rows.push({ id: entry.id, label: labelOf(entry), pluginId: shortcutIdFromPanel(entry.id) })
      }
      const dismiss = () => {
        try {
          if (typeof props?.onDismiss === 'function') props.onDismiss()
        } catch {
          // меню уже закрыто
        }
      }
      const pinRow = (row) => {
        // Наша панель: пишем pinned в localStorage и отправляем событие —
        // строку левой панели вернёт сам плагин.
        if (row.pluginId !== null && row.pluginId !== undefined) {
          pinShortcutPanel(row.pluginId)
          return
        }
        if (typeof props?.onPinnedChange !== 'function') return
        try {
          props.onPinnedChange(row.id, true)
        } catch (error) {
          console.error('[dsh-polish] не удалось закрепить панель:', error)
        }
      }
      const pin = (row) => {
        pinRow(row)
        dismiss()
      }
      const pinAll = () => {
        // Наши видимые панели закрепляются одним изменением и одним событием.
        const ours = rows
          .filter((row) => row.pluginId !== null && row.pluginId !== undefined)
          .map((row) => row.pluginId)
        if (ours.length > 0) pinAllShortcutPanels(ours)
        for (const row of rows) {
          if (row.pluginId !== null && row.pluginId !== undefined) continue
          if (typeof props?.onPinnedChange !== 'function') continue
          try {
            props.onPinnedChange(row.id, true)
          } catch (error) {
            console.error('[dsh-polish] не удалось закрепить панель:', error)
          }
        }
        dismiss()
      }
      if (rows.length === 0) {
        return h(
          'div',
          { style: S.panellistActions, 'data-dsh-polish-panellist-actions': 'list' },
          h(
            'p',
            { style: S.panellistTitle, 'data-dsh-polish-panellist-title': 'unpinned' },
            t('panelsUnpinnedTitle'),
          ),
          h('p', { style: S.panellistHintText, 'data-dsh-polish-all-pinned': 'true' }, t('panelsAllPinned')),
        )
      }
      return h(
        'div',
        { style: S.panellistActions, 'data-dsh-polish-panellist-actions': 'list' },
        h(
          'p',
          { style: S.panellistTitle, 'data-dsh-polish-panellist-title': 'unpinned' },
          t('panelsUnpinnedTitle'),
        ),
        h('p', { style: S.panellistHintText }, t('panelsUnpinnedHint')),
        ...rows.map((row) =>
          h(
            'div',
            { key: row.id, style: S.panellistRow, 'data-dsh-polish-pinnable': row.id },
            h('span', { style: S.panellistLabel, title: row.label }, row.label),
            h(
              'button',
              {
                type: 'button',
                style: S.panellistPin,
                'data-dsh-polish-button': 'pin',
                'data-dsh-polish-pin': row.id,
                title: fmt(t('panelsPinOneTitle'), { name: row.label }),
                'aria-label': fmt(t('panelsPinOneTitle'), { name: row.label }),
                onClick: () => pin(row),
              },
              h('span', { 'aria-hidden': true, style: { fontSize: 12, lineHeight: 1 } }, '📌'),
              h('span', null, t('panelsPinOne')),
            ),
          ),
        ),
        h(
          'button',
          {
            type: 'button',
            style: S.panellistPinAll,
            'data-dsh-polish-button': 'primary',
            'data-dsh-polish-pin-all': 'button',
            title: t('panelsPinTitle'),
            onClick: pinAll,
          },
          fmt(t('panelsPinAll'), { count: rows.length }),
        ),
      )
    }

    function UpdatesBlock() {
      const t = (key) => translate(key)
      const [rows, setRows] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [note, setNote] = React.useState('')

      const load = async () => {
        setBusy(true)
        try {
          const response = await fetch(UPDATES_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
          const data = await response.json()
          setRows(Array.isArray(data?.rows) ? data.rows : [])
        } catch {
          setRows([])
        } finally {
          setBusy(false)
        }
      }

      const behind = (rows ?? []).filter((row) => row.behind === true)

      const copyCommands = () => {
        const commands = behind.map((row) => 'dsh plugin --profile desktop add github:' + (row.repo ?? row.name)).join('\n')
        try {
          void navigator.clipboard.writeText(commands)
          setNote(fmt(t('commandsCopied'), { count: behind.length }))
        } catch {
          setNote(commands)
        }
      }

      const updateAll = async () => {
        setNote(t('updating'))
        try {
          const response = await fetch(UPDATE_ALL_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ apply: true }) })
          const data = await response.json()
          setNote(String(data?.message ?? t('allCurrent')))
          await load()
        } catch (error) {
          setNote(fmt(t('fixFailed'), { message: String(error?.message ?? error) }))
        }
      }

      const actions = h(
        'div',
        { style: S.row },
        smallButton(busy ? t('checking') : t('check'), () => void load(), busy),
        rows !== null
          ? chipNode(
              behind.length === 0 ? t('allCurrent') : fmt(t('available'), { count: behind.length }),
              behind.length === 0 ? 'ok' : 'warn',
            )
          : null,
        behind.length > 0 ? smallButton(t('copyCommands'), copyCommands, false) : null,
        behind.length > 0 ? smallButton(t('updateAll'), () => void updateAll(), false) : null,
      )

      return cardSection(
        'updates',
        t('updatesTitle'),
        actions,
        note !== '' ? h('p', { style: S.hint }, note) : null,
        rows === null
          ? h('p', { style: S.hint }, t('updatesHint'))
          : rows.length === 0
            ? h('p', { style: S.hint }, t('allCurrent'))
            : h(
                'div',
                { style: S.list },
                ...rows.map((row) =>
                  h(
                    'div',
                    { key: row.name, style: S.listRow, 'data-dsh-polish-row': 'row' },
                    h('span', { style: { minWidth: 150, color: 'var(--dsw-alias-label-primary)' } }, row.name),
                    h('span', null, row.installed ?? '—'),
                    h('span', { style: { color: 'var(--dsw-alias-label-tertiary)' } }, '→'),
                    h('span', { style: { fontWeight: row.behind === true ? 600 : 400 } }, row.latest ?? row.error ?? '—'),
                  ),
                ),
              ),
      )
    }


    /** Подсказки: ключ проверки → ключ строки словаря. */
    const HINT_KEYS = {
      token: 'hints.token',
      sync: 'hints.sync',
      chrome: 'hints.chrome',
      port: 'hints.port',
      secrets: 'hints.secrets',
      mcp: 'hints.mcp',
      versions: 'hints.versions',
      backup: 'hints.backup',
    }

    let translate = (key) => key

    /** Журнал: что проверяли и исправляли в последнее время. */
    function JournalBlock() {
      const t = (key) => translate(key)
      const [rows, setRows] = React.useState(null)

      const load = async () => {
        try {
          const response = await fetch(LOG_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
          const data = await response.json()
          setRows(Array.isArray(data?.rows) ? data.rows : [])
        } catch {
          setRows([])
        }
      }

      return cardSection(
        'journal',
        t('journalTitle'),
        h('div', { style: S.row }, smallButton(t('show'), () => void load(), false)),
        rows === null
          ? h('p', { style: S.hint }, t('journalHint'))
          : rows.length === 0
            ? h('p', { style: S.hint }, t('journalEmpty'))
            : h(
                'div',
                { style: S.list },
                ...rows.slice(0, 8).map((row, index) =>
                  h(
                    'div',
                    { key: String(index), style: S.listRow, 'data-dsh-polish-row': 'row' },
                    h('span', { style: { minWidth: 120, color: 'var(--dsw-alias-label-tertiary)' } }, String(row.at ?? '').slice(11, 16)),
                    h('span', { style: { minWidth: 70 } }, row.plugin ?? ''),
                    h('span', { style: { minWidth: 60, color: 'var(--dsw-alias-label-tertiary)' } }, row.kind ?? ''),
                    h(
                      'span',
                      { style: { flex: 1, minWidth: 0, color: row.ok === false ? BAD_COLOR : 'var(--dsw-alias-label-primary)' } },
                      String(row.text ?? ''),
                    ),
                  ),
                ),
              ),
      )
    }

    /** Экран «Состояние»: проверки окружения и починка того, что исправимо. */
    function HealthBlock() {
      const t = (key) => translate(key)
      const [state, setState] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [note, setNote] = React.useState('')

      const check = async () => {
        setBusy(true)
        setNote('')
        try {
          const response = await fetch(HEALTH_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' })
          const data = await response.json()
          setState(data?.ok === true ? data : { checks: [], message: data?.message ?? t('checkFailed') })
        } catch (error) {
          setState({ checks: [], message: String(error?.message ?? error) })
        } finally {
          setBusy(false)
        }
      }

      const fix = async (action) => {
        setNote(t('fixing'))
        try {
          const response = await fetch(FIX_PATH, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action }) })
          const data = await response.json()
          setNote(String(data?.message ?? t('allOk')))
          await check()
        } catch (error) {
          setNote(fmt(t('fixFailed'), { message: String(error?.message ?? error) }))
        }
      }

      const checks = state?.checks ?? []
      const bad = checks.filter((item) => item.ok !== true)

      const actions = h(
        'div',
        { style: S.row },
        smallButton(busy ? t('checking') : t('check'), () => void check(), busy),
        state !== null
          ? chipNode(
              bad.length === 0 ? t('allOk') : fmt(t('needsAttention'), { count: bad.length }),
              bad.length === 0 ? 'ok' : 'warn',
            )
          : null,
      )

      return cardSection(
        'health',
        t('healthTitle'),
        actions,
        note !== '' ? h('p', { style: S.hint }, note) : null,
        state !== null && checks.length > 0
          ? (() => {
              const steps = ['sync', 'backup', 'port', 'token', 'versions']
              const done = steps.filter((id) => checks.some((item) => item.id === id && item.ok === true)).length
              return h('p', { style: { ...S.text, fontWeight: 600 } }, fmt(t('quickStart'), { done, total: steps.length }))
            })()
          : null,
        state === null
          ? h('p', { style: S.hint }, t('healthHint'))
          : h(
              'div',
              { style: S.list },
              ...checks.map((item) =>
                h(
                  'div',
                  { key: item.id, style: S.listRow, 'data-dsh-polish-row': 'row' },
                  h('span', { style: S.mark(item.ok === true) }, item.ok === true ? '✓' : '✗'),
                  h('span', { style: { minWidth: 170, color: 'var(--dsw-alias-label-primary)' } }, item.title),
                  h('span', { style: { flex: 1, minWidth: 0, color: 'var(--dsw-alias-label-tertiary)' } }, item.detail ?? ''),
                  item.ok !== true && HINT_KEYS[item.fix] !== undefined
                    ? h('span', { style: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary)', maxWidth: 260 } }, t(HINT_KEYS[item.fix]))
                    : null,
                  item.ok !== true && (item.fix === 'mcp' || item.fix === 'secrets')
                    ? smallButton(t('fix'), () => void fix(item.fix), false)
                    : null,
                ),
              ),
            ),
      )
    }

    /** Переключатель оформления: тот же обработчик, что был на странице. */
    function AppearanceBlock() {
      const t = (key) => translate(key)
      const [enabled, setEnabled] = React.useState(isEnabled())

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

      return cardSection(
        'appearance',
        t('heading'),
        null,
        h(
          'label',
          { style: S.switchRow },
          h('input', {
            type: 'checkbox',
            checked: enabled,
            onChange: (event) => toggle(event.target.checked),
          }),
          h('span', null, t('switchLabel')),
        ),
        h('p', { style: S.hint }, enabled ? t('on') : t('off')),
      )
    }

    /** Страница плагина: шапка со статусом и «Обновить», карточки-секции. */
    function PolishPage() {
      const t = (key) => translate(key)
      const enabled = isEnabled()

      return h(
        'div',
        { style: S.page, 'data-dsh-polish-page': 'page' },
        h('style', null, PAGE_CSS),
        h(
          'div',
          { style: S.header, 'data-dsh-polish-header': 'header' },
          h('div', { style: S.logo, 'aria-hidden': true }, '🎨'),
          h(
            'div',
            { style: S.titles },
            h('h1', { style: S.heading }, t('title')),
            h('p', { style: S.subtitle }, t('hint')),
          ),
          h(
            'div',
            { style: S.actions, 'data-dsh-polish-actions': 'actions' },
            chipNode(enabled ? t('on') : t('off'), enabled ? 'ok' : 'muted'),
            h(
              'button',
              {
                type: 'button',
                style: S.refresh,
                'data-dsh-polish-button': 'refresh',
                title: t('reload'),
                'aria-label': t('reload'),
                onClick: () => {
                  // Тот же защищённый путь, что у кнопки в подвале: при активной
                  // работе предупреждение и force, а не мгновенный reload.
                  void requestGuardedReload()
                },
              },
              h('span', { 'aria-hidden': true, style: { fontSize: 14, lineHeight: 1 } }, '↻'),
              h('span', null, t('reload')),
            ),
          ),
        ),
        h(AppearanceBlock, null),
        h(PanelsBlock, null),
        h(HealthBlock, null),
        h('div', { style: S.grid, 'data-dsh-polish-grid': 'grid' }, h(JournalBlock, null), h(UpdatesBlock, null)),
      )
    }

    /** Сводный режим страницы плагина: короткая карточка. */
    function PolishSummary() {
      const t = (key) => translate(key)
      const enabled = isEnabled()
      return h(
        'div',
        { style: S.card, 'data-dsh-polish-card': 'summary' },
        h(
          'div',
          { style: S.row },
          h('span', { style: { ...S.logo, width: 34, height: 34, borderRadius: 11, fontSize: 18 } }, '🎨'),
          h(
            'div',
            { style: S.titles },
            h('span', { style: S.cardTitle }, t('title')),
            h('span', { style: S.hint }, t('summary')),
          ),
          chipNode(enabled ? t('on') : t('off'), enabled ? 'ok' : 'muted'),
        ),
      )
    }

    /** Содержимое страницы своего плагина. */
    function DetailCard_dshpolish(props) {
      const subject = props?.subject
      const packageName =
        subject?.kind === 'bundle' && typeof subject?.pkg?.name === 'string'
          ? subject.pkg.name
          : typeof subject?.id === 'string'
            ? subject.id
            : ''
      if (packageName !== 'dsh-polish') return null
      if (props?.view === 'summary') return h(PolishSummary, props)
      return h(PolishPage, props)
    }

    /* --- Своя панель «Оформление интерфейса» ------------------------------- */

    // dsh-polish — такой же плагин с панелью, как остальные: main-панель с
    // ключом `plugin-polish` он регистрирует сам, а строку левой панели —
    // только когда id `polish` закреплён в общем состоянии. Свою строку он же
    // и видит в списке `sidebar.panellist`, поэтому карточка настроек
    // показывает «Оформление интерфейса» наравне с чужими панелями.
    const POLISH_PANEL_ID = SHORTCUT_PREFIX + 'polish'
    const POLISH_SIDEBAR_ORDER = 28
    // Disposer зарегистрированной строки sidebar.panellist (null — строки нет).
    let polishSidebarDispose = null

    /** Иконка своей строки: 🎨 в размер, который просит хост (16/18 px). */
    function PolishPanelIcon(props) {
      const requested = Number(props?.size)
      const size = Number.isFinite(requested) && requested > 0 ? requested : 16
      return h(
        'span',
        {
          'data-dsh-polish-icon': 'polish',
          'aria-hidden': true,
          style: {
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: size,
            height: size,
            fontSize: Math.round(size * 0.95),
            lineHeight: 1,
          },
        },
        '🎨',
      )
    }

    /** Своя main-панель: страница настроек «Оформления». Регистрируется всегда. */
    function registerPolishMainPanel(ctx) {
      try {
        ctx.slots.inject('main', () =>
          ctx.slots.register({ name: 'main', key: POLISH_PANEL_ID, locale: NS }, PolishPage),
        )
      } catch (error) {
        console.error('[dsh-polish] своя main-панель недоступна:', error)
      }
    }

    /** Снять свою строку левой панели (если она была). */
    function disposePolishSidebar() {
      const dispose = polishSidebarDispose
      if (dispose === null) return
      polishSidebarDispose = null
      try {
        if (typeof dispose === 'function') dispose()
      } catch (error) {
        console.error('[dsh-polish] не удалось снять строку своей панели:', error)
      }
      if (panelRegistrySlots !== null) syncRegisteredPanels(panelRegistrySlots)
    }

    /**
     * Привести свою строку левой панели в соответствие с состоянием:
     * закреплён `polish` — строка есть, иначе её нет. Повторные вызовы без
     * изменений ничего не делают.
     */
    function syncPolishSidebar(ctx) {
      if (!isPanelPinned('polish')) {
        disposePolishSidebar()
        return
      }
      if (polishSidebarDispose !== null) return
      try {
        polishSidebarDispose = ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist',
              id: POLISH_PANEL_ID,
              order: POLISH_SIDEBAR_ORDER,
              label: () => translate('shortcut.polish.title'),
              locale: NS,
            },
            PolishPanelIcon,
          ),
        )
      } catch (error) {
        polishSidebarDispose = null
        console.error('[dsh-polish] строка своей панели недоступна:', error)
      }
      // Свой id может быть тем самым новым/снятым: список панелей читаем сразу,
      // не дожидаясь уведомления слота.
      if (panelRegistrySlots !== null) syncRegisteredPanels(panelRegistrySlots)
    }

    /**
     * Своя панель: main регистрируется всегда, строка — по `pinned`.
     * Реагируем на событие `dsh-polish:panels-changed` (другие плагины и наша
     * страница настроек шлют его после изменения состояния) и на `storage`
     * (изменение из другой вкладки): перечитываем localStorage, заодно
     * перечитываем слот панелей (плагин мог снять или вернуть строку) и
     * перерегистрируем свою строку. main не трогаем.
     */
    function installPolishPanel(ctx) {
      registerPolishMainPanel(ctx)
      syncPolishSidebar(ctx)

      const onPanelsChanged = () => {
        syncRegisteredPanels(ctx.slots)
        adoptPanelStateFromStorage()
        syncPolishSidebar(ctx)
        syncFallbackPanels(ctx)
      }
      const onStorage = (event) => {
        const key = event?.key
        if (key !== null && key !== undefined && key !== PANEL_VISIBILITY_KEY) return
        syncRegisteredPanels(ctx.slots)
        adoptPanelStateFromStorage()
        syncPolishSidebar(ctx)
        syncFallbackPanels(ctx)
      }
      try {
        if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
          window.addEventListener(PANELS_CHANGED_EVENT, onPanelsChanged)
          window.addEventListener('storage', onStorage)
        }
      } catch (error) {
        console.error('[dsh-polish] подписка на событие панелей недоступна:', error)
      }
      try {
        ctx.effect(
          () => () => {
            try {
              if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
                window.removeEventListener(PANELS_CHANGED_EVENT, onPanelsChanged)
                window.removeEventListener('storage', onStorage)
              }
            } catch {
              // вне браузера снимать нечего
            }
            disposePolishSidebar()
            disposeAllFallbackSidebarRows()
          },
          'dsh-polish: own panel',
        )
      } catch (error) {
        console.error('[dsh-polish] очистка своей панели недоступна:', error)
      }
      // Страховка на старте: вернуть строки закреплённых панелей, которые
      // плагины зарегистрировали в `main`, но забыли в `sidebar.panellist`.
      syncFallbackPanels(ctx)
    }

    /* --- Кнопка «Обновить» в подвале левой панели -------------------------- */

    /** Пауза для короткой выдержки состояния «Обновляется…». */
    function wait(ms) {
      return new Promise((resolve) => {
        setTimeout(resolve, ms)
      })
    }

    /* --- Защита от перезапуска во время активной работы ---------------------
       Перезапуск посреди работы даёт дубли сессий, обрезанные логи и
       полуприменённый профиль. Поэтому кнопки и Ctrl+R сначала спрашивают хост
       «чем занят?» (`check: true`), и только свободный DSH перезагружается.
       Занято — предупреждение со списком активных сессий и кнопка «Всё равно
       перезапустить»: force уходит на хост только по явному второму клику. */

    // Один общий замок: проверка/перезагрузка из кнопки, страницы или Ctrl+R.
    let reloadActivityInFlight = false
    // Текущее предупреждение «идёт работа» и таймер его автоскрытия.
    let reloadWarningNode
    let reloadWarningTimer

    /** Убрать предупреждение «идёт работа» из документа. */
    function hideReloadWarning() {
      if (reloadWarningTimer !== undefined) {
        clearTimeout(reloadWarningTimer)
        reloadWarningTimer = undefined
      }
      try {
        if (reloadWarningNode !== undefined) {
          reloadWarningNode.remove()
          reloadWarningNode = undefined
        }
      } catch {
        reloadWarningNode = undefined
      }
    }

    /** Как назвать строку активной работы в предупреждении. */
    function activeWorkKindLabel(entry, t) {
      if (entry?.kind === 'job') return t('reloadActiveJob')
      if (entry?.kind === 'subagent') return t('reloadActiveSubagent')
      return t('reloadActiveSession')
    }

    /** Текст строки: название сессии, иначе её id. */
    function activeWorkTitle(entry) {
      const title = typeof entry?.title === 'string' ? entry.title.trim() : ''
      if (title !== '') return title
      const id = String(entry?.sessionId ?? '')
      return id === '' ? '—' : id.slice(0, 12)
    }

    /**
     * Показать предупреждение «идёт работа»: тост с перечнем активных сессий,
     * пояснением и кнопкой принудительного перезапуска. Автоматически скрывается.
     */
    function showReloadWarning(info, onForce) {
      hideReloadWarning()
      try {
        const t = (key) => translate(key)
        const box = document.createElement('div')
        box.className = 'dsh-polish-reload-warning'
        box.setAttribute(RELOAD_WARNING_FLAG, 'busy')
        box.setAttribute('role', 'alert')
        box.setAttribute('aria-live', 'assertive')

        const title = document.createElement('div')
        title.setAttribute('data-dsh-polish-reload-warning-title', 'title')
        const message = typeof info?.message === 'string' && info.message.trim() !== ''
          ? info.message.trim()
          : t('reloadBusy')
        title.textContent = message
        box.appendChild(title)

        const active = Array.isArray(info?.active) ? info.active : []
        if (active.length > 0) {
          const list = document.createElement('ul')
          list.setAttribute('data-dsh-polish-reload-warning-list', 'list')
          for (const entry of active.slice(0, 8)) {
            const item = document.createElement('li')
            const kind = document.createElement('span')
            kind.setAttribute('data-dsh-polish-reload-warning-kind', 'kind')
            kind.textContent = activeWorkKindLabel(entry, t)
            item.appendChild(kind)
            const name = document.createElement('span')
            name.setAttribute('data-dsh-polish-reload-warning-name', 'name')
            name.textContent = activeWorkTitle(entry)
            item.appendChild(name)
            list.appendChild(item)
          }
          box.appendChild(list)
        }

        const note = document.createElement('div')
        note.setAttribute('data-dsh-polish-reload-warning-note', 'note')
        note.textContent = t('reloadBusyNote')
        box.appendChild(note)

        const actions = document.createElement('div')
        actions.setAttribute('data-dsh-polish-reload-warning-actions', 'actions')
        const force = document.createElement('button')
        force.type = 'button'
        force.setAttribute('data-dsh-polish-reload-force', 'button')
        force.textContent = t('reloadForce')
        force.addEventListener('click', () => {
          if (typeof onForce !== 'function') return
          try {
            onForce()
          } catch (error) {
            console.error('[dsh-polish] принудительный перезапуск недоступен:', error)
          }
        })
        actions.appendChild(force)
        box.appendChild(actions)

        document.body.appendChild(box)
        reloadWarningNode = box
        reloadWarningTimer = setTimeout(() => { hideReloadWarning() }, RELOAD_WARNING_MS)
        if (typeof reloadWarningTimer?.unref === 'function') reloadWarningTimer.unref()
      } catch (error) {
        console.error('[dsh-polish] предупреждение о работе не показано:', error)
      }
    }

    /**
     * Проверить, чем занят DSH, без перезагрузки (`check: true`).
     * Возвращает `{ ok, busy, active, message }`; сбой проверки — `{ ok: false,
     * unavailable: true }` (тогда работает обычный путь с запасным reload).
     */
    async function requestActivity() {
      let response
      try {
        const controller = typeof AbortController === 'function' ? new AbortController() : undefined
        const abortTimer = controller === undefined ? undefined : setTimeout(() => controller.abort(), 5000)
        if (typeof abortTimer?.unref === 'function') abortTimer.unref()
        try {
          response = await fetch(RELOAD_PATH, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ check: true }),
            ...(controller === undefined ? {} : { signal: controller.signal }),
          })
        } finally {
          clearTimeout(abortTimer)
        }
      } catch {
        return { ok: false, unavailable: true }
      }
      let payload = {}
      try {
        payload = (await response.json()) ?? {}
      } catch {
        payload = {}
      }
      if (response.ok !== true) {
        return {
          ok: false,
          unavailable: true,
          message: typeof payload?.message === 'string' ? payload.message : 'HTTP ' + String(response.status),
        }
      }
      return {
        ok: true,
        busy: payload?.busy === true,
        active: Array.isArray(payload?.active) ? payload.active : [],
        message: typeof payload?.message === 'string' ? payload.message : '',
      }
    }

    /**
     * Попросить хост перезагрузить окно приложения (маршрут `/api/dsh-polish/reload`:
     * сначала ответ, перезагрузка — с задержкой). `force` — явное подтверждение
     * пользователя. Занятость возвращается как `{ ok:false, busy:true, active }`,
     * и запасной путь при этом НЕ включается. Если маршрута нет (старый хост,
     * нет доступа к API) — перезагрузить страницу самим.
     */
    async function requestAppReload(force = false) {
      let routeError = ''
      try {
        const controller = typeof AbortController === 'function' ? new AbortController() : undefined
        const abortTimer = controller === undefined ? undefined : setTimeout(() => controller.abort(), 8000)
        if (typeof abortTimer?.unref === 'function') abortTimer.unref()
        let response
        try {
          response = await fetch(RELOAD_PATH, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(force === true ? { force: true } : {}),
            ...(controller === undefined ? {} : { signal: controller.signal }),
          })
        } finally {
          clearTimeout(abortTimer)
        }
        let payload = {}
        try {
          payload = (await response.json()) ?? {}
        } catch {
          payload = {}
        }
        // Успех (в том числе force при busy: хост вернёт ok с busy-списком).
        if (response.ok === true && payload?.ok === true) return { ok: true, windows: payload.windows, forced: payload?.forced === true }
        // Занято: хост отказал — перезагрузки нет, запасной путь запрещён.
        if (payload?.busy === true) {
          return {
            ok: false,
            busy: true,
            active: Array.isArray(payload?.active) ? payload.active : [],
            message: typeof payload?.message === 'string' ? payload.message : '',
          }
        }
        routeError = typeof payload?.message === 'string' ? payload.message : 'HTTP ' + String(response.status)
      } catch (error) {
        routeError = String(error?.message ?? error)
      }
      // Запасной путь: страница обновляется сама, без участия хоста.
      try {
        window.location.reload()
        return { ok: true, fallback: true }
      } catch (error) {
        return { ok: false, message: routeError === '' ? String(error?.message ?? error) : routeError }
      }
    }

    /** Принудительный перезапуск по явному подтверждению (кнопка в предупреждении). */
    async function requestForcedReload() {
      hideReloadWarning()
      return requestAppReload(true)
    }

    /**
     * Общая точка перезапуска для кнопки на странице плагина и Ctrl+R: сначала
     * проверка занятости; занято — предупреждение и ни одного reload; свободно —
     * обычная перезагрузка через хост.
     */
    async function requestGuardedReload() {
      if (reloadActivityInFlight) return { ok: false, busy: true }
      reloadActivityInFlight = true
      try {
        const activity = await requestActivity()
        if (activity?.ok === true && activity.busy === true) {
          showReloadWarning(activity, () => { void requestForcedReload() })
          return { ok: false, busy: true, active: activity.active }
        }
        return await requestAppReload(false)
      } finally {
        reloadActivityInFlight = false
      }
    }

    /**
     * Кнопка «Обновить» в `sidebar.footer.action`: вид как у «Новой сессии»
     * (CSS-слой `[data-dsh-polish-reload]`), отличается только иконка.
     * Состояния: idle → проверка занятости (спиннера нет) → «Обновляется…»
     * (disabled + спиннер) → «Готово» / «Не удалось». Занято — «Идёт работа»:
     * подпись «Всё равно перезапустить», кнопка активна, внизу предупреждение
     * со списком активных сессий; второй клик перезагружает принудительно.
     * В свёрнутой панели — иконка 36×36 по центру.
     */
    function FooterReloadButton(props) {
      const t = (key) => translate(key)
      const wide = props?.wide !== false
      const [status, setStatus] = React.useState('idle')
      const [detail, setDetail] = React.useState('')
      const loading = status === 'loading'
      const label =
        status === 'loading'
          ? t('reloading')
          : status === 'done'
            ? t('reloadDone')
            : status === 'error'
              ? t('reloadFailed')
              : status === 'busy'
                ? t('reloadForce')
                : t('reload')
      const icon = status === 'done' ? '✓' : status === 'error' ? '!' : status === 'busy' ? '⚠' : '↻'
      const title =
        status === 'busy'
          ? t('reloadForceHint')
          : detail === ''
            ? t('reloadHint')
            : t('reloadFailed') + ': ' + detail

      // Финальную подпись не держим вечно: окно обычно уже перезагружается.
      const scheduleReset = (delay = 4000) => {
        const timer = setTimeout(() => {
          hideReloadWarning()
          setStatus('idle')
          setDetail('')
        }, delay)
        if (typeof timer?.unref === 'function') timer.unref()
      }

      /** Показать «идёт работа»: кнопка остаётся активной, спиннера нет. */
      const showBusy = (info) => {
        setStatus('busy')
        setDetail(String(info?.message ?? ''))
        showReloadWarning(info, () => { void runReload(true) })
        scheduleReset(RELOAD_WARNING_MS)
      }

      /** Перезагрузить (force — принудительно) и показать итог. */
      const runReload = (force) => {
        if (loading) return
        hideReloadWarning()
        setStatus('loading')
        setDetail('')
        const startedAt = Date.now()
        return requestAppReload(force === true).then(async (result) => {
          if (result?.busy === true) {
            // Работа началась между проверкой и перезагрузкой — не перезагружаем.
            showBusy(result)
            return
          }
          const left = RELOAD_BUSY_MIN_MS - (Date.now() - startedAt)
          if (left > 0) await wait(left)
          if (result?.ok === true) {
            setStatus('done')
            setDetail('')
          } else {
            setStatus('error')
            setDetail(String(result?.message ?? '').slice(0, 200))
          }
          scheduleReset()
        })
      }

      /** Сначала проверка занятости: занято — предупреждение, свободно — reload. */
      const checkThenReload = async () => {
        if (reloadActivityInFlight) return
        reloadActivityInFlight = true
        try {
          const activity = await requestActivity()
          if (activity?.ok === true && activity.busy === true) {
            showBusy(activity)
            return
          }
          await runReload(false)
        } finally {
          reloadActivityInFlight = false
        }
      }

      const reload = () => {
        if (loading) return
        if (status === 'busy') {
          void runReload(true)
          return
        }
        void checkThenReload()
      }

      const children = [h('span', { 'aria-hidden': true, 'data-dsh-polish-reload-icon': 'icon' }, icon)]
      if (wide) children.push(h('span', { 'data-dsh-polish-reload-label': 'label' }, label))
      return h(
        'button',
        {
          type: 'button',
          'data-dsh-polish-reload': 'button',
          'data-state': status,
          ...(wide ? {} : { 'data-compact': 'true' }),
          'aria-label': status === 'idle' ? t('reloadAria') : label,
          'aria-busy': loading ? 'true' : undefined,
          disabled: loading,
          title,
          onClick: reload,
        },
        ...children,
      )
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
            FooterReloadButton,
          ),
        )
      } catch (error) {
        console.error('[dsh-polish] кнопка обновления недоступна:', error)
      }

      // Меню «Ещё» в левой панели: список видимых-но-не-закреплённых панелей
      // с булавкой у каждой и кнопка «Закрепить все панели (N)».
      try {
        ctx.slots.inject('sidebar.panellist.actions', () =>
          ctx.slots.register(
            {
              name: 'sidebar.panellist.actions',
              id: 'dsh-polish-panellist-actions',
              order: 90,
              locale: NS,
            },
            PanellistActions,
          ),
        )
      } catch (error) {
        console.error('[dsh-polish] кнопка закрепления панелей недоступна:', error)
      }

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

      // Цветные эмодзи вместо одноцветных SVG у всех панелей левой панели.
      applyPanelEmoji(ctx)

      // Список панелей в настройках — проекция слота `sidebar.panellist`:
      // новые плагины появляются в карточке «Панели в левом меню» сами.
      installPanelRegistry(ctx)

      // Своя панель «Оформление интерфейса» по тому же контракту: main всегда,
      // строка — только когда id `polish` закреплён.
      installPolishPanel(ctx)
    }

    exports.apply = apply
    exports.inject = ['slots', 'locale']
    exports.NS = NS
    return module.exports
  },
})
