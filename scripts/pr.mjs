/**
 * `bun run pr` — cria PR para `main` no GitHub (Ready, nunca draft) e,
 * opcionalmente, arma o auto-merge nativo. Equivalente local do
 * `gh pr create` + `gh pr merge --auto --rebase` do fluxo do teqo, sem
 * depender do `gh` (plain Node zero-dep sobre a REST/GraphQL do GitHub).
 *
 *   bun run pr -- --head <branch> [--title "…"] [--body "…"] [--automerge]
 *
 * Defaults: head = branch atual, base = main, title = primeiro commit, body vazio.
 * Com `--automerge`, o PR nasce com o auto-merge armado (GraphQL, rebase) —
 * o servidor mergea quando o required check `checks` ficar verde (sem poll
 * local; a semântica "cria e mergea quando os checks passarem" é preservada
 * pela garantia do servidor). `--draft` foi REMOVIDO — PR nunca draft é regra
 * do repo (estrutural, como no teqo OPS71).
 */

import { execFileSync } from 'node:child_process'
import { dieWithLabel } from './lib/cli.mjs'
import { createApi } from './lib/github-api.mjs'
import { loadProjectEnv } from './lib/load-project-env.mjs'

loadProjectEnv()
const api = createApi({})

const die = dieWithLabel('pr')

const parseArgs = (argv, flagsWithValue) => {
  const flags = {}
  const positional = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg.startsWith('--')) {
      const name = arg.slice(2)
      if (flagsWithValue.has(name)) {
        const next = argv[index + 1]
        flags[name] = typeof next === 'string' && next.startsWith('--') ? undefined : next
        index += 1
      } else {
        flags[name] = true
      }
    } else {
      positional.push(arg)
    }
  }
  return { flags, positional }
}

const currentBranch = () =>
  execFileSync('git', ['branch', '--show-current'], { encoding: 'utf8' }).trim()
const firstCommitSubject = () =>
  execFileSync('git', ['log', '-1', '--format=%s'], { encoding: 'utf8' }).trim()

const { flags, positional } = parseArgs(process.argv.slice(2), new Set(['head', 'title', 'body']))

const head = flags.head ?? positional[0] ?? currentBranch()
if (!head) die('Não consegui detectar a branch atual (detached?) — use --head <branch>.')
if (head === 'main') die('PR para main não faz sentido a partir de main.')
if (flags.draft) die('`--draft` foi removido — PR da Iara é sempre Ready (regra do repo).')

const title = flags.title ?? firstCommitSubject()
const body = flags.body ?? ''

console.log(`[pr] criando PR ${head} → main: ${title}`)
const pr = await api.createPullRequest({ head, base: 'main', title, body })
console.log(`[pr] PR #${pr.number} criado (Ready): ${pr.htmlUrl}`)

if (flags.automerge) {
  console.log(`[pr] armando auto-merge do PR #${pr.number} (rebase)…`)
  await api.enableAutoMerge(pr.nodeId)
  console.log(
    `[pr] auto-merge armado — o GitHub mergea quando o required check "checks" ficar verde`,
  )
}