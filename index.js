/**
 * Host-часть `dsh-polish`.
 *
 * Три дела:
 *   1. Проверка версий наших плагинов на GitHub.
 *   2. Экран «Состояние»: семь проверок окружения в одном ответе.
 *   3. Исправления того, что можно починить без человека.
 */
import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { connect } from 'node:net'
import { dirname, join } from 'node:path'


/** Файл с последними замеченными версиями плагинов. */
function versionsFile() {
  return join(dshHome(), 'dsh-polish', 'versions.json')
}

/** Сравнить версии с прошлым прогоном и записать изменения в журнал. */
async function noteVersionChanges(rows) {
  let previous = {}
  try {
    previous = JSON.parse(await readFile(versionsFile(), 'utf8'))
  } catch {
    previous = {}
  }
  const next = {}
  for (const row of rows) {
    if (typeof row.installed !== 'string') continue
    next[row.name] = row.installed
    const before = previous[row.name]
    if (typeof before === 'string' && before !== row.installed) {
      await appendLog({ kind: 'update', ok: true, text: `${row.name}: ${before} → ${row.installed}` })
    }
    if (row.behind === true && (before === undefined || before === row.installed)) {
      await appendLog({ kind: 'update-available', ok: true, text: `${row.name}: ${row.installed} → ${row.latest}` })
    }
  }
  try {
    await mkdir(dirname(versionsFile()), { recursive: true })
    await writeFile(versionsFile(), JSON.stringify(next, null, 2) + '\n', 'utf8')
  } catch {
    // снимок версий необязателен
  }
}


/** Путь к CLI DeepSeek Harness. */
function cliPath() {
  const candidates = [
    join(process.env.LOCALAPPDATA ?? '', 'Programs/DeepSeek Harness/resources/runtime/cli/bin/dsh.cmd'),
    join(process.env.PROGRAMFILES ?? '', 'DeepSeek Harness/resources/runtime/cli/bin/dsh.cmd'),
  ]
  return candidates.find((candidate) => candidate !== '' && existsSync(candidate))
}

/** Обновить наши плагины через CLI. Возвращает по каждому результат. */
async function updateAll(apply) {
  const rows = []
  for (const item of REPOS) {
    const installed = await installedVersion(item.name)
    if (installed === undefined) continue
    const remote = await remoteVersion(item.repo)
    if (remote.version === undefined) continue
    if (compareVersions(remote.version, installed) <= 0) continue
    rows.push({ name: item.name, repo: item.repo, from: installed, to: remote.version })
  }

  if (rows.length === 0) return { ok: true, updated: 0, rows, message: 'все плагины актуальны' }

  const commands = rows.flatMap((row) => [
    'dsh plugin --profile desktop remove ' + row.name,
    'dsh plugin --profile desktop add github:' + row.repo,
  ])
  if (apply !== true) return { ok: true, applied: false, rows, commands, message: 'готово к обновлению: ' + rows.length }

  const cli = cliPath()
  if (cli === undefined) {
    return { ok: false, rows, commands, message: 'CLI DeepSeek Harness не найден — выполни команды вручную' }
  }

  const results = []
  for (const row of rows) {
    // Установка поверх установленного плагина отклоняется — сначала удаляем.
    await execute(cli, ['plugin', '--profile', 'desktop', 'remove', row.name], 120_000)
    const run = await execute(cli, ['plugin', '--profile', 'desktop', 'add', 'github:' + row.repo], 180_000)
    results.push({ name: row.name, to: row.to, ok: run.ok, output: run.output.slice(-300) })
  }
  const failed = results.filter((item) => item.ok !== true)
  await appendLog({
    kind: 'update-all',
    ok: failed.length === 0,
    text: failed.length === 0
      ? 'обновлено плагинов: ' + results.length
      : 'не удалось обновить: ' + failed.map((item) => item.name).join(', '),
  })
  return {
    ok: failed.length === 0,
    applied: true,
    results,
    message: failed.length === 0
      ? 'обновлено: ' + results.map((item) => item.name + (item.to ? ' → ' + item.to : '')).join(', ') + ' — перезапусти DSH'
      : 'часть плагинов не обновилась: ' + failed.map((item) => item.name).join(', '),
  }
}

/** Запустить команду и вернуть вывод.
 *
 * .cmd на Windows нельзя запускать напрямую с путём, где есть пробелы:
 * вызываем через cmd.exe с кавычками вокруг пути.
 */
function execute(command, args, timeout) {
  return new Promise((resolve) => {
    const isScript = /\.(cmd|bat)$/i.test(command)
    const program = isScript ? (process.env.ComSpec ?? 'cmd.exe') : command
    // cmd.exe получает путь и аргументы отдельными элементами — тогда
    // пробелы в пути не ломают разбор.
    const argv = isScript ? ['/c', command, ...args] : args
    execFile(program, argv, { timeout, windowsHide: true }, (error, stdout, stderr) => {
      resolve({ ok: error === null, output: String(stdout ?? '') + String(stderr ?? '') })
    })
  })
}

export const name = 'dsh-polish'
export const inject = ['connection']

const UPDATES_PATH = '/api/dsh-polish/updates'
const HEALTH_PATH = '/api/dsh-polish/health'
const FIX_PATH = '/api/dsh-polish/fix'
const LOG_PATH = '/api/dsh-polish/log'
const UPDATE_ALL_PATH = '/api/dsh-polish/update-all'

/** Файл журнала: короткая история того, что проверяли и исправляли. */
function logFile() {
  return join(dshHome(), 'dsh-polish', 'log.jsonl')
}

/** Записать событие в журнал; сбои журнала не должны ломать работу. */
async function appendLog(entry) {
  try {
    const file = logFile()
    await mkdir(join(dshHome(), 'dsh-polish'), { recursive: true })
    await appendFile(file, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n', 'utf8')
  } catch {
    // журнал необязателен
  }
}

/** Прочитать один файл журнала. */
async function readLogFile(file) {
  try {
    const text = await readFile(file, 'utf8')
    return text.split('\n').filter((line) => line.trim() !== '').map((line) => {
      try {
        return JSON.parse(line)
      } catch {
        return undefined
      }
    }).filter(Boolean)
  } catch {
    return []
  }
}

/** Последние записи журнала: все плагины вместе, новые сверху. */
async function readLog(limit = 40) {
  const rows = []
  try {
    const { readdirSync } = await import('node:fs')
    for (const entry of readdirSync(dshHome(), { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      for (const line of await readLogFile(join(dshHome(), entry.name, 'log.jsonl'))) {
        rows.push({ ...line, plugin: line.plugin ?? entry.name })
      }
    }
  } catch {
    // каталог профиля недоступен — вернём пустой список
  }
  rows.sort((a, b) => String(b.at ?? '').localeCompare(String(a.at ?? '')))
  return rows.slice(0, limit)
}

/** Наши плагины и их репозитории на GitHub. */
const REPOS = [
  { name: 'dsh-sessions', repo: 'mikhailnarzik-source/dsh-sessions-plugin' },
  { name: 'dsh-team', repo: 'mikhailnarzik-source/dsh-team' },
  { name: 'dsh-polish', repo: 'mikhailnarzik-source/dsh-polish' },
  { name: 'dsh-cards', repo: 'mikhailnarzik-source/dsh-cards' },
  { name: 'dsh-review', repo: 'mikhailnarzik-source/dsh-review' },
  { name: 'dsh-compact', repo: 'mikhailnarzik-source/dsh-compact' },
  { name: 'dsh-expenses', repo: 'mikhailnarzik-source/dsh-expenses' },
  { name: 'dsh-github-safe', repo: 'mikhailnarzik-source/dsh-github-safe' },
  { name: 'dsh-notify', repo: 'mikhailnarzik-source/dsh-notify' },
  { name: 'dsh-browser-launcher', repo: 'mikhailnarzik-source/dsh-browser-launcher' },
  { name: 'dsh-plugin-whale-pet', repo: 'mikhailnarzik-source/dsh-whale-pet', as: 'dsh-plugin-whale-pet-ru' },
]

/** Каталог `.dsh` — там настройки, профили и секреты. */
function dshHome() {
  const explicit = process.env.DSH_HOME
  if (typeof explicit === 'string' && explicit !== '') return explicit
  return join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh')
}

/** Каталог профиля: оттуда читаем установленные версии. */
function profileDir() {
  return join(dshHome(), 'profiles', 'desktop')
}

/** Сравнить версии вида 1.2.3; -1/0/1. */
function compareVersions(a, b) {
  const left = String(a).split(/[.-]/).map((part) => Number(part) || 0)
  const right = String(b).split(/[.-]/).map((part) => Number(part) || 0)
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const diff = (left[index] ?? 0) - (right[index] ?? 0)
    if (diff !== 0) return diff > 0 ? 1 : -1
  }
  return 0
}

/** Версия установленного пакета или undefined. */
async function installedVersion(name) {
  try {
    const manifest = JSON.parse(await readFile(join(profileDir(), 'node_modules', name, 'package.json'), 'utf8'))
    return typeof manifest.version === 'string' ? manifest.version : undefined
  } catch {
    return undefined
  }
}

/** Версия из GitHub (main). */
async function remoteVersion(repo) {
  try {
    // Кэш CDN держит файл несколько минут: подмешиваем метку времени.
    const response = await fetch(`https://raw.githubusercontent.com/${repo}/main/package.json?t=${Date.now()}`, {
      signal: AbortSignal.timeout(15_000),
      headers: { 'user-agent': 'dsh-polish' },
    })
    if (!response.ok) return { error: `HTTP ${response.status}` }
    const manifest = await response.json()
    return { version: typeof manifest.version === 'string' ? manifest.version : undefined }
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) }
  }
}

function json(payload) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  })
}

/** Выполнить команду и вернуть её вывод; ошибки не бросаем. */
function run(command, args, timeout = 15_000) {
  return new Promise((resolve) => {
    execFile(command, args, { timeout, windowsHide: true }, (error, stdout) => {
      resolve({ ok: error === null, output: String(stdout ?? '').trim(), error })
    })
  })
}

/** Занят ли порт: используется для проверки браузера агента. */
function portOpen(port, host = '127.0.0.1', timeout = 1200) {
  return new Promise((resolve) => {
    const socket = connect({ port, host })
    const finish = (value) => {
      socket.destroy()
      resolve(value)
    }
    socket.setTimeout(timeout)
    socket.once('connect', () => finish(true))
    socket.once('timeout', () => finish(false))
    socket.once('error', () => finish(false))
  })
}

/** Путь к Chrome на этой платформе. */
function chromePath() {
  const candidates = [
    join(process.env.PROGRAMFILES ?? '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env['PROGRAMFILES(X86)'] ?? '', 'Google/Chrome/Application/chrome.exe'),
    join(process.env.LOCALAPPDATA ?? '', 'Google/Chrome/Application/chrome.exe'),
  ]
  return candidates.find((candidate) => candidate !== '' && existsSync(candidate))
}

/** Настройки синхронизации сессий, если плагин стоит. */
async function syncConfig() {
  try {
    return JSON.parse(await readFile(join(dshHome(), 'dsh-sync.json'), 'utf8'))
  } catch {
    return undefined
  }
}

/**
 * Состояние резерва.
 *
 * Учёт прогресса хранит карту «файл → размер», процент из неё не выводится.
 * Надёжнее читать итоговый статус, который пишет dsh-sessions после выгрузки.
 */
async function backupSummary() {
  try {
    const status = JSON.parse(await readFile(join(dshHome(), 'dsh-sync', 'secondary-status.json'), 'utf8'))
    let total = 0
    try {
      const progress = JSON.parse(await readFile(join(dshHome(), 'dsh-sync', 'upload-progress.json'), 'utf8'))
      total = Object.keys(progress?.files ?? {}).length
    } catch {
      total = 0
    }
    const percent = Number.isFinite(status?.percent)
      ? Math.round(status.percent)
      : typeof status?.message === 'string' && /100%/.test(status.message)
        ? 100
        : 0
    return {
      ok: status?.ok === true,
      percent,
      total,
      message: typeof status?.message === 'string' ? status.message : '',
      at: typeof status?.at === 'string' ? status.at : '',
    }
  } catch {
    return undefined
  }
}

/** Есть ли MCP-сервер playwright в профиле. */
async function mcpConfigured() {
  try {
    const patch = await readFile(join(profileDir(), 'cordis.patch.yml'), 'utf8')
    return /^\s+playwright:/m.test(patch)
  } catch {
    return false
  }
}

/** Токен GitHub из хранилища секретов. */
async function githubToken(ctx) {
  try {
    const hit = await ctx?.get?.('credentials')?.resolve?.('GITHUB_TOKEN')
    return typeof hit?.value === 'string' && hit.value !== ''
  } catch {
    return false
  }
}

/** Собрать состояние окружения: только чтение. */
async function collectHealth(ctx) {
  const checks = []

  checks.push({
    id: 'node',
    title: 'Node.js',
    ok: Number(process.versions.node.split('.')[0]) >= 22,
    detail: `v${process.versions.node}`,
  })

  const git = await run('git', ['--version'])
  checks.push({ id: 'git', title: 'git', ok: git.ok, detail: git.output.replace(/^git version\s*/, '') || 'не найден' })

  const config = await syncConfig()
  if (config === undefined) {
    checks.push({ id: 'sync', title: 'Синхронизация сессий', ok: false, detail: 'плагин не настроен', fix: 'sync' })
  } else {
    const remote = config.remote ?? config.secondary?.remote ?? ''
    const probe = remote === '' ? { ok: false, output: 'адрес не задан' } : await run('git', ['ls-remote', '--heads', remote], 20_000)
    checks.push({
      id: 'sync',
      title: 'Репозиторий сессий',
      ok: probe.ok && probe.output.includes('refs/heads'),
      detail: probe.ok ? 'доступен' : 'нет доступа — войдите в GitHub',
      fix: 'sync',
    })

    const backup = await backupSummary()
    if (config.secondary?.backend === undefined || config.secondary.backend === 'none') {
      checks.push({ id: 'backup', title: 'Резерв', ok: true, detail: 'не используется' })
    } else {
      checks.push({
        id: 'backup',
        title: 'Резерв',
        ok: backup !== undefined && backup.ok === true && backup.percent >= 100,
        detail: backup === undefined
          ? 'нет данных'
          : backup.ok === true
            ? `${backup.percent}%${backup.total > 0 ? ` · ${backup.total} файлов` : ''}`
            : backup.message || 'последняя выгрузка не удалась',
        fix: 'backup',
      })
    }
  }

  const tokenOk = await githubToken(ctx)
  checks.push({
    id: 'token',
    title: 'Токен GitHub',
    ok: tokenOk,
    detail: tokenOk ? 'сохранён' : 'не задан — Настройки → Плагины → GitHub',
    fix: 'token',
  })

  const chrome = chromePath()
  const browserUp = await portOpen(9222)
  checks.push({
    id: 'chrome',
    title: 'Chrome',
    ok: chrome !== undefined,
    detail: chrome ?? 'не найден',
    fix: 'chrome',
  })
  checks.push({
    id: 'port',
    title: 'Порт отладки 9222',
    ok: browserUp,
    detail: browserUp ? 'браузер агента запущен' : 'не слушает — нажми «Запустить браузер»',
    fix: 'browser',
  })

  // Файл секретов браузера: он существует и в нём есть хотя бы одна строка.
  const secretsPath = join(dshHome(), 'browser-secrets.env')
  let secretsLines = -1
  try {
    secretsLines = (await readFile(secretsPath, 'utf8'))
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^[A-Za-z0-9_]+=.+$/.test(line)).length
  } catch {
    secretsLines = -1
  }
  checks.push({
    id: 'secrets',
    title: 'Секреты браузера',
    ok: secretsLines > 0,
    detail: secretsLines === -1
      ? 'нет файла browser-secrets.env'
      : secretsLines === 0
        ? 'файл пуст — впиши логины сайтов'
        : `заполнен: ${secretsLines} строк`,
    fix: 'secrets',
  })

  const mcp = await mcpConfigured()
  checks.push({
    id: 'mcp',
    title: 'MCP-сервер Playwright',
    ok: mcp,
    detail: mcp ? 'настроен' : 'не прописан в профиле',
    fix: 'mcp',
  })

  // Версии: показываем только итог, подробности — в маршруте обновлений.
  const versions = []
  for (const item of REPOS) {
    const installed = await installedVersion(item.name)
    if (installed === undefined) continue
    const remote = await remoteVersion(item.repo)
    versions.push({ name: item.name, installed, latest: remote.version, behind: remote.version !== undefined && compareVersions(remote.version, installed) > 0 })
  }
  const behind = versions.filter((row) => row.behind)
  checks.push({
    id: 'versions',
    title: 'Версии плагинов',
    ok: behind.length === 0,
    detail: behind.length === 0 ? 'все актуальны' : `отстают: ${behind.map((row) => row.name).join(', ')}`,
    fix: 'versions',
  })

  return { ok: true, checks, versions, at: new Date().toISOString() }
}

/** Дописать MCP-сервер playwright в профиль, если его нет. */
async function fixMcp() {
  const patchPath = join(profileDir(), 'cordis.patch.yml')
  if (!existsSync(patchPath)) return { ok: false, message: 'профиль не найден' }
  const original = await readFile(patchPath, 'utf8')
  if (/^\s+playwright:/m.test(original)) return { ok: true, message: 'уже настроен' }

  const secrets = join(dshHome(), 'browser-secrets.env')
  const block = [
    '      playwright:',
    '        transport: stdio',
    '        command: cmd',
    '        args:',
    '          - /c',
    '          - npx',
    '          - -y',
    '          - "@playwright/mcp@0.0.86"',
    '          - --cdp-endpoint',
    '          - http://127.0.0.1:9222',
    '          - --secrets',
    `          - '${secrets}'`,
    '        enabled: true',
    '        startupTimeoutMs: 121000',
  ].join('\n')

  let updated
  if (/^- id: mcp-manager\s*$/m.test(original)) {
    const lines = original.split('\n')
    const start = lines.findIndex((line) => /^- id: mcp-manager\s*$/.test(line))
    let end = lines.length
    for (let index = start + 1; index < lines.length; index += 1) {
      if (/^- /.test(lines[index])) { end = index; break }
    }
    const serversAt = lines.slice(start, end).findIndex((line) => /^\s+servers:\s*$/.test(line))
    const insertAt = start + (serversAt >= 0 ? serversAt + 1 : end - start)
    lines.splice(insertAt, 0, ...block.split('\n'))
    updated = lines.join('\n')
  } else {
    updated = `${original.replace(/\s*$/, '')}\n\n- id: mcp-manager\n  name: "@deepseek-ai/dsh-mcp-manager"\n  config:\n    servers:\n${block}\n`
  }

  await writeFile(`${patchPath}.bak-mcp-${Date.now()}`, original, 'utf8')
  await writeFile(patchPath, updated, 'utf8')
  return { ok: true, message: 'сервер добавлен, перезапусти DSH' }
}

/** Создать шаблон файла секретов браузера. */
async function fixSecrets() {
  const path = join(dshHome(), 'browser-secrets.env')
  if (existsSync(path)) return { ok: true, message: 'файл уже есть' }
  await mkdir(dshHome(), { recursive: true })
  const template = [
    '# Логины и пароли для сайтов, куда агент заходит через браузер.',
    '# Формат: имя=значение, по одному на строку. Файл не попадает в git.',
    '',
    '# EXAMPLE_LOGIN=user@example.com',
    '# EXAMPLE_PASSWORD=secret',
    '',
  ].join('\n')
  await writeFile(path, template, 'utf8')
  return { ok: true, message: 'шаблон создан: browser-secrets.env' }
}

/** Первая проверка после старта DSH и период повторных проверок. */
export const AUTO_UPDATE_DELAY_MS = 90_000
export const AUTO_UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1_000

export function apply(ctx) {
  try {
    ctx.effect(() => {
      ctx.connection.fetch.register({
        path: UPDATES_PATH,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async () => {
          const rows = []
          for (const item of REPOS) {
            const installed = await installedVersion(item.name)
            if (installed === undefined) continue
            const remote = await remoteVersion(item.repo)
            if (remote.version === undefined) {
              rows.push({ name: item.name, repo: item.repo, installed, error: remote.error ?? 'версия не прочитана' })
              continue
            }
            rows.push({
              name: item.name,
              repo: item.repo,
              installed,
              latest: remote.version,
              behind: compareVersions(remote.version, installed) > 0,
            })
          }
          await noteVersionChanges(rows)
          return json({ ok: true, rows })
        },
      })

      ctx.connection.fetch.register({
        path: HEALTH_PATH,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async () => {
          try {
            const health = await collectHealth(ctx)
            const bad = health.checks.filter((check) => check.ok !== true)
            await appendLog({ kind: 'health', ok: bad.length === 0, text: bad.length === 0 ? 'все проверки пройдены' : 'требуют внимания: ' + bad.map((check) => check.title).join(', ') })
            return json(health)
        
    // Фон: проверяем версии и сами ставим новые, чтобы не нажимать кнопку.
    ctx.effect(() => {
      let stopped = false
      const tick = async () => {
        if (stopped) return
        if (process.env.DSH_AUTO_UPDATE === 'off') return
        try {
          const result = await updateAll(true)
          const updated = Number(result?.updated ?? 0)
          if (updated > 0) await appendLog({ kind: 'auto-update', ok: true, text: 'обновлено плагинов: ' + updated })
        } catch (error) {
          await appendLog({ kind: 'auto-update', ok: false, text: String(error?.message ?? error).slice(0, 200) })
        }
      }
      const first = setTimeout(() => { void tick() }, AUTO_UPDATE_DELAY_MS)
      const periodic = setInterval(() => { void tick() }, AUTO_UPDATE_INTERVAL_MS)
      if (typeof first.unref === 'function') first.unref()
      if (typeof periodic.unref === 'function') periodic.unref()
      return () => {
        stopped = true
        clearTimeout(first)
        clearInterval(periodic)
      }
    }, 'dsh-polish: auto update')
  } catch (error) {
            return json({ ok: false, message: error instanceof Error ? error.message : String(error) })
          }
        },
      })

      ctx.connection.fetch.register({
        path: LOG_PATH,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async () => json({ ok: true, rows: await readLog() }),
      })

      ctx.connection.fetch.register({
        path: UPDATE_ALL_PATH,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          let body = {}
          try {
            body = await request.json()
          } catch {
            body = {}
          }
          return json(await updateAll(body?.apply === true))
        },
      })

      ctx.connection.fetch.register({
        path: FIX_PATH,
        methods: ['POST'],
        requestBody: 'buffered',
        fetch: async (request) => {
          let body = {}
          try {
            body = await request.json()
          } catch {
            body = {}
          }
          const action = typeof body?.action === 'string' ? body.action : ''
          if (action === 'mcp') {
            const result = await fixMcp()
            await appendLog({ kind: 'fix', ok: result.ok === true, text: 'MCP: ' + result.message })
            return json(result)
          }
          if (action === 'secrets') {
            const result = await fixSecrets()
            await appendLog({ kind: 'fix', ok: result.ok === true, text: 'секреты: ' + result.message })
            return json(result)
          }
          return json({ ok: false, message: 'неизвестное действие' })
        },
      })
    }, 'dsh-polish: routes')
  } catch (error) {
    console.error('[dsh-polish] маршруты недоступны:', error)
  }
}
