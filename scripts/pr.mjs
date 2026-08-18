/**
 * `bun run pr` — cria PR para `main` (Ready ou draft) e, opcionalmente, aguarda
 * os checks e mergea por rebase. Equivalente local do `gh pr create` +
 * `gh pr merge --auto --rebase` do fluxo do teqo, sem depender do `gh`.
 *
 *   bun run pr -- --head <branch> [--title "…"] [--body "…"] [--draft] [--automerge]
 *
 * Defaults: head = branch atual, base = main, title = primeiro commit, body vazio.
 * Com `--automerge`, espera o status check `checks` ficar green e mergea
 * (rebase). `--no-pr` não é suportado — criação é o objetivo.
 */

import { execFileSync } from 'node:child_process'
import { loadProjectEnv } from './lib/load-project-env.mjs'
import { dieAgent, parseArgs } from './lib/agent-forgejo.mjs'

loadProjectEnv()
const forgejoModule = await import('./lib/forgejo-api.mjs');;
const { createApi } = forgejoModule

const die = dieAgent('pr')
const api = createApi({})
const { flags, positional } = parseArgs(process.argv.slice(2), new Set(['head', 'title', 'body']))

const currentBranch = () =>
  execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim()
const firstCommitSubject = () =>
  execFileSync('git', ['log', '-1', '--format=%s'], { encoding: 'utf8' }).trim()

const head = flags.head ?? positional[0] ?? currentBranch()
if (!head) die('Não consegui detectar a branch atual (detached?) — use --head <branch>.')
if (head === 'main') die('PR para main não faz sentido a partir de main.')

const title = flags.title ?? firstCommitSubject()
const body = flags.body ?? ''

console.log(`[pr] criando PR ${head} → main: ${title}`)
const pr = await api.createPullRequest({
  head,
  base: 'main',
  title,
  body,
  draft: Boolean(flags.draft),
})
console.log(`[pr] PR #${pr.number} criado: ${pr.htmlUrl}${pr.isDraft ? ' (draft)' : ''}`)

if (flags.automerge) {
  console.log(`[pr] aguardando checks do PR #${pr.number} e mergeando…`)
  const merged = await api.autoMerge(pr.number, {
    log: (line) => console.log(`[pr] ${line}`),
  })
  console.log(
    merged
      ? `[pr] PR #${pr.number} mergeado (rebase)`
      : `[pr] PR #${pr.number} já mergeado ou fechado`,
  )
}
