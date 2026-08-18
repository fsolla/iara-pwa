/**
 * `bun run agent:file-miss` — file an agent-miss issue (guardrail pipeline).
 *
 * Misses feed the progressive-guardrail harvest: each miss becomes an issue
 * with `kind:agent-miss`; periodically a human/agent harvests them into a
 * programmatic guardrail.
 *
 *   bun run agent:file-miss -- --title "migration merged sem atualizar seed:minimal" \
 *     [--body "contexto..."] [--kind agent-miss|defect]
 *
 * Portado do teqo (scripts/agent-file-miss.mjs) — URL derivada do repo.
 */

import { dieAgent, parseArgs, issueUrl } from './lib/agent-forgejo.mjs'
import { loadProjectEnv } from './lib/load-project-env.mjs'

loadProjectEnv()
const forgejoModule = await import('./lib/forgejo-api.mjs');;
const { forgejoApi: api } = forgejoModule

const die = dieAgent('file-miss')
const { flags } = parseArgs(process.argv.slice(2), new Set(['title', 'body', 'kind']))

if (!flags.title) {
  die(
    'Usage: bun run agent:file-miss -- --title <what went wrong> [--body details] [--kind agent-miss|defect]',
  )
}

const kind = flags.kind === 'defect' ? 'defect' : 'agent-miss'
const body = [
  flags.body ?? '',
  '',
  '_Registrado por `bun run agent:file-miss`. Harvest: avaliar guardrail programático (teste de convenção, lint, check de CI)._',
].join('\n')

const created = await api.createIssue({
  title: flags.title,
  body,
})
const url = issueUrl(created.number)

await api.setLabels(created.number, { add: [`kind:${kind}`, 'prio:P2'] })

console.log(`[agent:file-miss] filed ${url}`)
