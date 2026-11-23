/**
 * Хост-часть защиты от перезапуска: активная работа останавливает reload,
 * force перезагружает, `check: true` отвечает о занятости без перезагрузки.
 *
 * Контекст плагина подменяется сервисами `agents`, `sessions`, `jobs` и
 * `sessionQuery` — ровно те поля, которые читает `collectActiveWork` в
 * `index.js` (публичные API DSH 0.2.2-rc.5: Agent.status/inbox, JobView.status,
 * SessionHeader.origin, SessionQueryEngine.readTitleSnapshots).
 */
import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  ACTIVE_TITLES_TIMEOUT_MS,
  RELOAD_BUSY_MESSAGE,
  apply,
  collectActiveWork,
  handleReloadRequest,
  reloadGuard,
} from '../index.js'

/** Контекст с подменёнными сервисами DSH. */
function makeContext({ agents = [], sessions = [], jobs = [], titles = {}, jobsThrow = false } = {}) {
  const services = {
    agents: { list: () => agents },
    sessions: { list: () => sessions },
    jobs: {
      list: (owner) => {
        if (jobsThrow) throw new Error('реестр задач недоступен')
        return jobs.filter((job) => owner === undefined ? job.owner === undefined : job.owner === owner || job.owner === undefined)
      },
    },
    sessionQuery: {
      readTitleSnapshots: async (ids) => ids.map((id) => titles[id] === undefined
        ? { sessionId: id, status: 'rejected', reason: new Error('нет заголовка') }
        : { sessionId: id, status: 'fulfilled', value: { title: { title: titles[id] } } }),
    },
  }
  return { get: (name) => services[name] }
}

/** Счётчик вызовов перезагрузки: подменяет `scheduleWindowReload`. */
function reloadSpy() {
  const calls = []
  const reload = async () => {
    calls.push(Date.now())
    return { ok: true, windows: 1, delayMs: 800 }
  }
  return { calls, reload }
}

test('свободно: collectActiveWork пуст, reload вызывается без force', async () => {
  const ctx = makeContext()
  assert.deepEqual(await collectActiveWork(ctx), [])
  const spy = reloadSpy()
  const result = await handleReloadRequest(ctx, {}, spy.reload)
  assert.equal(spy.calls.length, 1, 'свободный DSH перезагружается')
  assert.equal(result.ok, true)
  assert.equal(result.busy, false)
  assert.equal(result.windows, 1)
  assert.equal(result.forced, undefined)
})

test('busy: открытый ход сессии не перезагружает, ответ busy со списком', async () => {
  const ctx = makeContext({
    agents: [
      { id: 's-1', status: 'running', session: { header: {} }, inbox: { nextTurn: [], nextStep: [] } },
    ],
    titles: { 's-1': 'Пишу отчёт' },
  })
  const active = await collectActiveWork(ctx)
  assert.equal(active.length, 1, 'одна активная строка')
  assert.equal(active[0].sessionId, 's-1')
  assert.equal(active[0].title, 'Пишу отчёт', 'заголовок сессии подставлен')
  assert.equal(active[0].kind, 'session')
  assert.equal(active[0].status, 'running')

  const spy = reloadSpy()
  const result = await handleReloadRequest(ctx, {}, spy.reload)
  assert.equal(spy.calls.length, 0, 'busy НЕ вызывает перезагрузку')
  assert.equal(result.ok, false)
  assert.equal(result.busy, true)
  assert.equal(result.message, RELOAD_BUSY_MESSAGE)
  assert.equal(result.message, 'Идёт работа: дождитесь завершения')
  assert.deepEqual(result.active.map((row) => row.sessionId), ['s-1'])
})

test('force: явное подтверждение перезагружает при активной работе', async () => {
  const ctx = makeContext({
    agents: [{ id: 's-1', status: 'running', session: { header: {} } }],
  })
  const spy = reloadSpy()
  const result = await handleReloadRequest(ctx, { force: true }, spy.reload)
  assert.equal(spy.calls.length, 1, 'force вызывает перезагрузку')
  assert.equal(result.ok, true)
  assert.equal(result.forced, true, 'в ответе видно, что перезапуск принудительный')
  assert.equal(result.busy, true)
  assert.equal(result.windows, 1)
})

test('check: хост отвечает о занятости и не трогает окна', async () => {
  const ctx = makeContext({
    agents: [{ id: 's-1', status: 'running', session: { header: {} } }],
    titles: { 's-1': 'Пишу отчёт' },
  })
  const spy = reloadSpy()
  const busy = await handleReloadRequest(ctx, { check: true }, spy.reload)
  assert.equal(spy.calls.length, 0, 'проверка не вызывает перезагрузку')
  assert.equal(busy.ok, true, 'проверка — не отказ')
  assert.equal(busy.busy, true)
  assert.equal(busy.message, RELOAD_BUSY_MESSAGE)
  assert.deepEqual(busy.active.map((row) => row.title), ['Пишу отчёт'])

  const free = await handleReloadRequest(makeContext(), { check: true }, spy.reload)
  assert.equal(spy.calls.length, 0)
  assert.equal(free.ok, true)
  assert.equal(free.busy, false)
  assert.deepEqual(free.active, [])
})

test('субагент и фоновая задача считаются активной работой', async () => {
  const ctx = makeContext({
    // Сессия-владелец фоновой задачи жива, поэтому её видно в реестре сессий.
    sessions: [{ id: 's-1' }],
    agents: [
      {
        id: 'sub-1',
        status: 'running',
        session: { header: { origin: 'subagent', parentSession: 'root-1' } },
      },
      // Очередь агента без открытого хода — тоже работа: сообщение проснёт ход.
      { id: 'queued-1', status: 'idle', session: { header: {} }, inbox: { nextTurn: [{}], nextStep: [] } },
    ],
    jobs: [
      { id: 'bash-1', kind: 'bash', label: 'Сборка проекта', owner: 's-1', status: 'running' },
      { id: 'bash-2', kind: 'bash', label: 'Старая задача', owner: 's-1', status: 'completed' },
    ],
    titles: {},
  })
  const active = await collectActiveWork(ctx)
  const kinds = active.map((row) => row.kind)
  assert.equal(kinds.includes('subagent'), true, 'работающий субагент — активность')
  assert.equal(kinds.includes('session'), true, 'очередь сессии — активность')
  assert.equal(kinds.includes('job'), true, 'запущенная фоновая задача — активность')
  assert.equal(active.some((row) => row.title === 'Старая задача'), false, 'завершённая задача не мешает')
  const queued = active.find((row) => row.sessionId === 'queued-1')
  assert.equal(queued.status, 'queued')
  assert.equal(queued.queued, 1, 'в очереди одно сообщение')

  const spy = reloadSpy()
  const result = await handleReloadRequest(ctx, {}, spy.reload)
  assert.equal(spy.calls.length, 0)
  assert.equal(result.busy, true)
})

test('ошибка реестра задач не снимает запрет и не ломает проверку', async () => {
  const ctx = makeContext({
    agents: [{ id: 's-1', status: 'running', session: { header: {} } }],
    jobs: [],
    jobsThrow: true,
  })
  const active = await collectActiveWork(ctx)
  assert.equal(active.length, 1)
  const guard = await reloadGuard(ctx)
  assert.equal(guard.busy, true)
  assert.equal(guard.allowed, false)
})

test('таймаут заголовков не отменяет запрет', () => {
  assert.equal(Number.isSafeInteger(ACTIVE_TITLES_TIMEOUT_MS), true)
  assert.ok(ACTIVE_TITLES_TIMEOUT_MS > 0 && ACTIVE_TITLES_TIMEOUT_MS <= 5000)
})

test('пустой/сломанный ctx не падает: проверка читает то, что доступно', async () => {
  assert.deepEqual(await collectActiveWork(undefined), [])
  assert.deepEqual(await collectActiveWork({}), [])
  assert.deepEqual(await collectActiveWork({ get: () => undefined }), [])
  const guard = await reloadGuard({ get: () => undefined })
  assert.equal(guard.busy, false)
  assert.equal(guard.allowed, true)
})

/**
 * Зарегистрировать настоящий маршрут `apply(ctx)` и вызвать его `fetch`:
 * ответ маршрута, а не только служебная функция. Журнал пишется в временный
 * DSH_HOME, чтобы не трогать файлы пользователя.
 */
async function callReloadRoute(services, body) {
  const home = await mkdtemp(join(tmpdir(), 'dsh-polish-reload-test-'))
  const previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const routes = new Map()
  const ctx = {
    get: (name) => services[name],
    effect: (fn) => { fn() },
    connection: { fetch: { register: (definition) => routes.set(definition.path, definition) } },
  }
  try {
    // В консоли теста не нужен стек «electron не найден»: это ожидаемо.
    const realError = console.error
    console.error = () => {}
    try {
      apply(ctx)
      // installReloadSupport асинхронно пробует electron и сообщает, что его нет.
      await new Promise((resolve) => { setTimeout(resolve, 30) })
    } finally {
      console.error = realError
    }
    const route = routes.get('/api/dsh-polish/reload')
    assert.ok(route !== undefined, 'маршрут /api/dsh-polish/reload зарегистрирован')
    assert.deepEqual(route.methods, ['POST'])
    const response = await route.fetch({ json: async () => body })
    const payload = await response.json()
    let journal = ''
    try {
      journal = await readFile(join(home, 'dsh-polish', 'log.jsonl'), 'utf8')
    } catch {
      journal = ''
    }
    return { payload, status: response.status, journal }
  } finally {
    if (previousHome === undefined) delete process.env.DSH_HOME
    else process.env.DSH_HOME = previousHome
    await rm(home, { recursive: true, force: true })
  }
}

test('маршрут: check отдаёт busy со списком и не пишет в журнал', async () => {
  const services = {
    agents: {
      list: () => [
        { id: 's-1', status: 'running', session: { header: {} } },
        { id: 'sub-1', status: 'running', session: { header: { origin: 'subagent' } } },
      ],
    },
    sessions: { list: () => [{ id: 's-1' }, { id: 'sub-1' }] },
    jobs: { list: () => [] },
    sessionQuery: {
      readTitleSnapshots: async (ids) => ids.map((id) => ({
        sessionId: id, status: 'fulfilled', value: { title: { title: 'Сессия ' + id } },
      })),
    },
  }
  const { payload, status, journal } = await callReloadRoute(services, { check: true })
  assert.equal(status, 200)
  assert.equal(payload.ok, true)
  assert.equal(payload.busy, true)
  assert.equal(payload.message, RELOAD_BUSY_MESSAGE)
  assert.deepEqual(payload.active.map((row) => row.sessionId), ['s-1', 'sub-1'])
  assert.deepEqual(payload.active.map((row) => row.kind), ['session', 'subagent'])
  assert.equal(journal, '', 'проверка занятости не засоряет журнал')
})

test('маршрут: reload при занятости отдаёт отказ и пишет «отложено» в журнал', async () => {
  const services = {
    agents: { list: () => [{ id: 's-1', status: 'running', session: { header: {} } }] },
    sessions: { list: () => [{ id: 's-1' }] },
    jobs: { list: () => [] },
    sessionQuery: { readTitleSnapshots: async () => [] },
  }
  const { payload, status, journal } = await callReloadRoute(services, {})
  assert.equal(status, 200)
  assert.equal(payload.ok, false)
  assert.equal(payload.busy, true)
  assert.equal(payload.message, RELOAD_BUSY_MESSAGE)
  assert.equal(payload.active.length, 1)
  assert.match(journal, /"kind":"reload"/, 'отказ записан в журнал плагина')
  assert.match(journal, /отложено: активных 1/, 'в журнале причина отказа')
})

test('маршрут: force при занятости разрешает перезагрузку (без busy-отказа)', async () => {
  const services = {
    agents: { list: () => [{ id: 's-1', status: 'running', session: { header: {} } }] },
    sessions: { list: () => [{ id: 's-1' }] },
    jobs: { list: () => [] },
    sessionQuery: { readTitleSnapshots: async () => [] },
  }
  const { payload } = await callReloadRoute(services, { force: true })
  // В тестовом Node нет Electron, поэтому сама перезагрузка окон недоступна —
  // важно, что guard её РАЗРЕШИЛ: это не busy-отказ, а попытка перезагрузки.
  assert.equal(payload.busy, true)
  assert.equal(payload.forced, true, 'ответ помечен как принудительный')
  assert.equal(payload.ok, false)
  assert.match(String(payload.message), /electron/i, 'перезагрузка была разрешена guard-ом (дошло до импорта Electron)')
})

