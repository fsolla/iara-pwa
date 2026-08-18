/**
 * `pnpm agent:status` — read-only overview of the trackable-issue graph.
 *
 * Sections: overview counters (state/prio/kind), current claim queue (same
 * ordering as `agent:claim --dry-run`, with `model:`), mermaid dependency
 * graph of open issues, blockers with reasons, and consolidation suggestions
 * (merge / break-down candidates). Never touches issues labeled
 * `in-progress` — read-only over `gh issue list --state all`.
 */

import {
  dieAgent,
  issuesById,
  labelNames,
  parseFrontmatter,
  priorityRank,
} from './lib/agent-forgejo.mjs'
import { forgejoApi as api } from './lib/forgejo-api.mjs'

const die = dieAgent('status')

let issues
try {
  issues = await api.listIssues({ state: 'all', limit: 200 })
} catch (error) {
  die(`Forgejo issue list failed: ${error.message}`)
}

const rows = issues
  .map((issue) => {
    const { meta } = parseFrontmatter(issue.body)
    if (typeof meta.id !== 'string' || meta.id.length === 0) return null
    const labels = labelNames(issue)
    const stateLabel = labels.find((label) =>
      ['ready', 'in-progress', 'blocked', 'done', 'in-prod'].includes(label),
    )
    return {
      issue,
      meta,
      labels,
      state:
        issue.state === 'CLOSED'
          ? (stateLabel ?? 'done')
          : (stateLabel ?? (issue.state === 'OPEN' ? 'open' : 'done')),
      priority: labels.find((label) => /^prio:P[0-3]$/.test(label))?.replace('prio:', '') ?? 'P2',
      kind: labels.find((label) => label.startsWith('kind:'))?.replace('kind:', '') ?? 'feature',
      needs: labels.filter((label) => label.startsWith('needs:')),
      depends: Array.isArray(meta.depends) ? meta.depends : [],
      model: typeof meta.model === 'string' ? meta.model : null,
    }
  })
  .filter(Boolean)

const open = rows.filter((row) => row.issue.state === 'OPEN')
const doneIds = new Set(
  rows
    .filter(
      (row) => row.issue.state === 'CLOSED' || row.state === 'done' || row.state === 'in-prod',
    )
    .map((row) => row.meta.id),
)

// --- Overview ----------------------------------------------------------------

console.log('## Overview\n')
const countBy = (fn) => {
  const counts = new Map()
  for (const row of rows) {
    const key = fn(row)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return [...counts.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0])))
}
console.log(`Total rastreáveis: ${rows.length} (${open.length} abertas)`)
console.log(
  'Por estado: ' +
    countBy((row) => row.state)
      .map(([state, count]) => `${state}=${count}`)
      .join(' '),
)
console.log(
  'Abertas por prio: ' +
    countBy((row) => (row.issue.state === 'OPEN' ? row.priority : null))
      .filter(([prio]) => prio !== null)
      .map(([prio, count]) => `${prio}=${count}`)
      .join(' '),
)
console.log(
  'Abertas por kind: ' +
    countBy((row) => (row.issue.state === 'OPEN' ? row.kind : null))
      .filter(([kind]) => kind !== null)
      .map(([kind, count]) => `${kind}=${count}`)
      .join(' '),
)

const needsAttention = open.filter((row) => row.needs.length > 0)
if (needsAttention.length > 0) {
  console.log('\nneeds:* abertas:')
  for (const row of needsAttention) {
    console.log(
      `  #${row.issue.number} ${row.meta.id} [${row.needs.join(', ')}] ${row.issue.title}`,
    )
  }
}

const recentDone = rows.filter((row) => row.state === 'done' || row.state === 'in-prod').slice(-5)
if (recentDone.length > 0) {
  console.log('\nÚltimas concluídas:')
  for (const row of recentDone) {
    console.log(`  #${row.issue.number} ${row.meta.id} [${row.state}] ${row.issue.title}`)
  }
}

// --- Fila atual (mesma ordem do agent:claim --dry-run) ------------------------

console.log('\n## Fila atual (ordem do agent:claim)\n')
const byId = await issuesById()
const queue = open
  .filter((row) => row.state === 'ready')
  .map((row) => ({
    row,
    blockedBy: row.depends.filter((id) => byId.has(id) && !doneIds.has(id)),
  }))
  .filter((entry) => entry.blockedBy.length === 0)
  .sort((a, b) => {
    const rank = priorityRank(a.row.priority) - priorityRank(b.row.priority)
    return rank !== 0 ? rank : a.row.issue.createdAt.localeCompare(b.row.issue.createdAt)
  })

if (queue.length === 0) {
  console.log('(vazia — nada `ready` desbloqueado)')
} else {
  queue.forEach(({ row }, index) => {
    const top = index === 0 ? ' ← topo' : ''
    const model = row.model ? ` model:${row.model}` : ' model:—'
    console.log(
      `  #${row.issue.number} ${row.meta.id} [${row.priority}]${model} ${row.issue.title}${top}`,
    )
  })
}

// --- Bloqueios ---------------------------------------------------------------

const blocked = open.filter(
  (row) => row.state === 'blocked' || row.depends.some((id) => byId.has(id) && !doneIds.has(id)),
)
console.log('\n## Bloqueios\n')
if (blocked.length === 0) {
  console.log('(nenhum)')
} else {
  for (const row of blocked) {
    const depBlockers = row.depends.filter((id) => byId.has(id) && !doneIds.has(id))
    const reasons = []
    if (depBlockers.length > 0) reasons.push(`dep aberta: ${depBlockers.join(', ')}`)
    for (const need of row.needs) reasons.push(need)
    if (row.labels.includes('requirements-changed')) reasons.push('requirements-changed')
    if (row.state === 'blocked' && reasons.length === 0)
      reasons.push('label blocked (motivo no body)')
    console.log(
      `  #${row.issue.number} ${row.meta.id} [${row.priority}] ${row.issue.title} — ${reasons.join('; ')}`,
    )
  }
}

// --- Mermaid -----------------------------------------------------------------

console.log('\n## Grafo (abertas)\n')
console.log('```mermaid')
console.log('graph LR')
for (const row of open) {
  const label = `${row.meta.id} ${row.state}/${row.priority}`
  console.log(`  ${row.meta.id}["${label}"]`)
}
for (const row of open) {
  for (const dep of row.depends) {
    if (byId.has(dep)) console.log(`  ${dep} --> ${row.meta.id}`)
  }
}
console.log('```')

// --- Sugestões de consolidação (nunca toca in-progress) -----------------------

console.log('\n## Sugestões de consolidação (só leitura — decisão é humana)\n')
const candidates = open.filter((row) => row.state !== 'in-progress')
const mergeCandidates = []
const byPrefix = new Map()
for (const row of candidates) {
  // Domain proxy: the first two significant words of the title (after the
  // "ID — " prefix). Items sharing domain + prio with no execution are the
  // merge-review candidates; a bare same-track grouping is too noisy.
  const words = row.issue.title
    .replace(/^[A-Z0-9+]+\s*—\s*/, '')
    .split(/[\s/—-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .join(' ')
    .toLowerCase()
  const key = `${words}/${row.priority}`
  byPrefix.set(key, [...(byPrefix.get(key) ?? []), row])
}
for (const [key, group] of byPrefix) {
  if (group.length >= 2 && group.length <= 6) {
    mergeCandidates.push(
      `mesmo domínio/prio (${key}), ${group.length} abertas sem execução: ${group.map((row) => row.meta.id).join(', ')} — avaliar merge`,
    )
  }
}
const dependentCount = new Map()
for (const row of candidates) {
  for (const dep of row.depends) dependentCount.set(dep, (dependentCount.get(dep) ?? 0) + 1)
}
const breakdownCandidates = candidates.filter((row) => (dependentCount.get(row.meta.id) ?? 0) >= 3)

if (mergeCandidates.length === 0 && breakdownCandidates.length === 0) {
  console.log('(nenhuma heurística disparou)')
} else {
  for (const line of mergeCandidates) console.log(`  merge? ${line}`)
  for (const row of breakdownCandidates) {
    console.log(
      `  break-down? #${row.issue.number} ${row.meta.id} bloqueia ${dependentCount.get(row.meta.id)} itens — avaliar fatiar (título guarda-chuva?)`,
    )
  }
}
