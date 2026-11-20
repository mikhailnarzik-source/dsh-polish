/**
 * Host-часть `dsh-polish`.
 *
 * Кроме оформления умеет одно дело: проверять, не вышли ли новые версии наших
 * плагинов на GitHub. Проверка живёт здесь, а не в каждом плагине, чтобы не
 * дублировать код и запросы.
 */
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

export const name = 'dsh-polish'
export const inject = ['connection']

const UPDATES_PATH = '/api/dsh-polish/updates'

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
  { name: 'dsh-plugin-whale-pet', repo: 'mikhailnarzik-source/dsh-whale-pet', as: 'dsh-plugin-whale-pet-ru' },
]

/** Каталог профиля: оттуда читаем установленные версии. */
function profileDir() {
  // DSH_HOME уже указывает на каталог .dsh, поэтому второй раз его не добавляем.
  const explicit = process.env.DSH_HOME
  const base = typeof explicit === 'string' && explicit !== '' ? explicit : join(process.env.USERPROFILE ?? process.env.HOME ?? '', '.dsh')
  return join(base, 'profiles', 'desktop')
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
              rows.push({ name: item.name, installed, error: remote.error ?? 'версия не прочитана' })
              continue
            }
            rows.push({
              name: item.name,
              installed,
              latest: remote.version,
              behind: compareVersions(remote.version, installed) > 0,
            })
          }
          return json({ ok: true, rows })
        },
      })
    }, 'dsh-polish: updates route')
  } catch (error) {
    console.error('[dsh-polish] маршрут обновлений недоступен:', error)
  }
}
