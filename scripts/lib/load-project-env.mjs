/**
 * Project env loader — lê `.forgejo/worktree.env` do repo (subindo do CWD) e
 * aplica em `process.env` quando as variáveis ainda não estão setadas. É o que
 * permite que os scripts rodem por qualquer caminho (comando `/worktree` do
 * opencode, `bun run issue`, roteador de terminal) sem depender de exportação
 * global. Arquivo commitado, sem segredos.
 */

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

const parseEnvFile = (text) => {
  const out = {}
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (line === '' || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).trim()
    const value = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '')
    if (key) out[key] = value
  }
  return out
}

/** Caminho do `.forgejo/worktree.env` do projeto dono do CWD (ou null). */
export const findProjectEnvFile = (from = process.cwd()) => {
  let dir = resolve(from)
  for (;;) {
    const candidate = join(dir, '.forgejo', 'worktree.env')
    if (existsSync(candidate)) return candidate
    const parent = dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

/** Expande um `~` inicial (ex. `~/.worktrees/iara`) para o homedir. */
export const expandHome = (value) => {
  if (typeof value !== 'string' || !value.startsWith('~')) return value
  return join(process.env.HOME ?? '', value.slice(1))
}

/**
 * Carrega o `.forgejo/worktree.env` do projeto do CWD (se existir) em
 * process.env — só preenche o que ainda não está definido. Retorna o config
 * resolvido: { repo, worktreesRoot }.
 */
export const loadProjectEnv = (from = process.cwd()) => {
  const file = findProjectEnvFile(from)
  const parsed = file ? parseEnvFile(readFileSync(file, 'utf8')) : {}

  const repo =
    process.env.FORGEJO_REPOSITORY ?? parsed.FORGEJO_REPOSITORY ?? process.env.GITHUB_REPOSITORY ?? 'amana/iara-pwa'
  const worktreesRoot = expandHome(
    process.env.WORKTREES_ROOT ?? parsed.WORKTREES_ROOT ?? `~/.worktrees/${repo.split('/')[1] ?? 'work'}`,
  )

  if (!process.env.FORGEJO_REPOSITORY) process.env.FORGEJO_REPOSITORY = repo
  if (!process.env.WORKTREES_ROOT) process.env.WORKTREES_ROOT = worktreesRoot

  return { repo, worktreesRoot, envFile: file }
}
