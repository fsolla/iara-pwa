/**
 * `bun run issue` — Issues da fila de claim, determinístico e read-only (nunca
 * altera o Forgejo; claim continua `bun run agent:claim`).
 *
 *   bun run issue next   imprime a próxima Issue claimável (topo da fila do claim)
 *   bun run issue all    overview compacto das Issues abertas (contadores + lista)
 *
 * Portado do teqo (scripts/issue.mjs) — URL derivada de FORGEJO_REPOSITORY.
 */

import {
  dieAgent,
  labelNames,
  nextClaimableIssue,
  parseArgs,
  parseFrontmatter,
  priorityRank,
  issueUrl,
} from './lib/agent-forgejo.mjs'
import { loadProjectEnv } from './lib/load-project-env.mjs'

loadProjectEnv()
const forgejoModule = await import('./lib/forgejo-api.mjs');
const { forgejoApi: api } = forgejoModule;

const die = dieAgent('issue')

const cmdNext = async () => {
  const pick = await nextClaimableIssue()
  if (!pick) {
    die('Fila vazia — nada `ready` desbloqueado. Rode `bun run issue all` para a overview.')
  }
  const { issue, meta, priority, satisfiedWithoutIssue } = pick
  const id = typeof meta.id === 'string' ? meta.id : null
  const prefix = id ? `${id} — ` : null
  const subject =
    prefix && issue.title.startsWith(prefix) ? issue.title.slice(prefix.length) : issue.title

  console.log(`#${issue.number} ${id ?? ''} [${priority}]`.trim())
  console.log(subject)
  if (meta.model) console.log(`model: ${meta.model}`)
  if (satisfiedWithoutIssue.length > 0) {
    console.log(`deps satisfeitas (roadmap, sem Issue): ${satisfiedWithoutIssue.join(', ')}`)
  }
  console.log(`url: ${issueUrl(issue.number)}`)
}

const count = (map, key) => map.set(key, (map.get(key) ?? 0) + 1)

const cmdAll = async () => {
  const issues = await api.listIssues({ state: 'open', limit: 200 })

  const rows = []
  for (const issue of issues) {
    const { meta } = parseFrontmatter(issue.body)
    if (typeof meta.id !== 'string' || meta.id.length === 0) continue
    const labels = labelNames(issue)
    rows.push({
      issue,
      id: meta.id,
      state: labels.find((label) => ['ready', 'in-progress', 'blocked'].includes(label)) ?? 'open',
      priority: labels.find((label) => /^prio:P[0-3]$/.test(label))?.replace('prio:', '') ?? 'P2',
      kind: labels.find((label) => label.startsWith('kind:'))?.replace('kind:', '') ?? 'feature',
    })
  }

  const byState = new Map()
  const byPrio = new Map()
  const byKind = new Map()
  for (const row of rows) {
    count(byState, row.state)
    count(byPrio, row.priority)
    count(byKind, row.kind)
  }
  const fmt = (map) =>
    [...map.entries()]
      .sort(([a], [b]) => String(a).localeCompare(String(b)))
      .map(([key, value]) => `${key}=${value}`)
      .join('  ')

  console.log(`Issues abertas: ${rows.length}`)
  console.log(`  por estado: ${fmt(byState) || '(—)'}`)
  console.log(`  por prio:   ${fmt(byPrio) || '(—)'}`)
  console.log(`  por kind:   ${fmt(byKind) || '(—)'}`)
  console.log('')
  const sorted = [...rows].sort((a, b) => {
    const rank = priorityRank(a.priority) - priorityRank(b.priority)
    return rank !== 0 ? rank : a.issue.number - b.issue.number
  })
  for (const row of sorted) {
    console.log(
      `  #${row.issue.number} ${row.id} [${row.state}/${row.priority}] ${row.issue.title}`,
    )
  }
}

const { positional } = parseArgs(process.argv.slice(2), new Set())
const subcommand = positional[0]

if (!subcommand) {
  console.log('Uso: bun run issue next | all')
  console.log('  next  imprime a próxima Issue claimável (topo da fila do claim)')
  console.log('  all   overview compacto das Issues abertas')
  process.exit(1)
}

try {
  if (subcommand === 'next') await cmdNext()
  else if (subcommand === 'all') await cmdAll()
  else die(`subcomando desconhecido: ${subcommand} (esperado: next | all)`)
} catch (error) {
  if (error?.stderr) die(error.stderr.toString().trim())
  die(error?.message ?? String(error))
}
