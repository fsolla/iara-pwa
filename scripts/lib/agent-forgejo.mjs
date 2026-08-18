/**
 * Shared helpers for the agent ops scripts (`bun run agent:*`). Everything
 * goes through the Forgejo REST API (scripts/lib/forgejo-api.mjs).
 *
 * Issue contract (spec + status + deps in Forgejo Issues): each trackable
 * issue carries a YAML-ish frontmatter block at the top of the body:
 *
 *   ---
 *   id: I7
 *   depends: [I3]
 *   serializes: []
 *   priority: P1
 *   ---
 *
 * State lives in labels: ready | in-progress | blocked | done (+ in-prod).
 *
 * Portado do teqo (scripts/lib/agent-forgejo.mjs) — só a URL da Issue deixou
 * de ser hardcoded e passou a derivar de FORGEJO_REPOSITORY.
 */

import { dieWithLabel } from './cli.mjs'
import { forgejoApi as api } from './forgejo-api.mjs'

const PRIORITIES = ['P0', 'P1', 'P2', 'P3']
export const priorityRank = (priority) => PRIORITIES.indexOf(priority)

export const dieAgent = (script) => dieWithLabel(`agent:${script}`)

/** URL canônica de uma Issue do projeto (derivada de FORGEJO_REPOSITORY). */
export const issueUrl = (number) => {
  const repo = process.env.FORGEJO_REPOSITORY ?? 'amana/iara-pwa'
  return `https://git.solla.dev/${repo}/issues/${number}`
}

export const parseFrontmatter = (body) => {
  const match = /^---\n([\s\S]*?)\n---\n?/.exec(body ?? '')
  if (!match) return { meta: {}, rest: body ?? '' }
  const meta = {}
  for (const line of match[1].split('\n')) {
    const kv = /^([a-zA-Z]+):\s*(.*)$/.exec(line.trim())
    if (!kv) continue
    const [, key, raw] = kv
    meta[key] = raw.startsWith('[')
      ? raw
          .slice(1, -1)
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : raw
  }
  return { meta, rest: body.slice(match[0].length) }
}

export const serializeFrontmatter = (meta, rest) => {
  const lines = ['---']
  for (const [key, value] of Object.entries(meta)) {
    lines.push(`${key}: ${Array.isArray(value) ? `[${value.join(', ')}]` : value}`)
  }
  lines.push('---', '')
  return lines.join('\n') + (rest ?? '')
}

/** All issues (open or closed) that carry a frontmatter `id`, keyed by id. */
export const issuesById = async () => {
  const issues = await api.listIssues({ state: 'all', limit: 200 })
  const byId = new Map()
  for (const issue of issues) {
    const { meta } = parseFrontmatter(issue.body)
    if (typeof meta.id === 'string' && meta.id.length > 0) byId.set(meta.id, issue)
  }
  return byId
}

export const labelNames = (issue) => issue.labels.map((label) => label.name)

/** Issue ids that count as a satisfied dependency (closed or done/in-prod). */
const doneIdsOf = (byId) =>
  new Set(
    [...byId.entries()]
      .filter(([, issue]) => {
        const labels = labelNames(issue)
        return issue.state === 'CLOSED' || labels.includes('done') || labels.includes('in-prod')
      })
      .map(([id]) => id),
  )

/**
 * Claim-queue entry shape derived from ONE issue: meta, priority and the
 * dependency verdicts. Shared by `buildClaimQueue` (the queue) and
 * `claimQueueEntry` (single-issue contexts like reopening an in-progress
 * session) — one derivation, no drift.
 */
const entryForIssue = (issue, byId, doneIds) => {
  const { meta } = parseFrontmatter(issue.body)
  const depends = Array.isArray(meta.depends) ? meta.depends : []
  // A dep without an issue is a delivered roadmap item — satisfied.
  const satisfiedWithoutIssue = depends.filter((id) => !byId.has(id))
  const blockedBy = depends.filter((id) => byId.has(id) && !doneIds.has(id))
  return {
    issue,
    meta,
    priority: labelNames(issue).find((label) => /^prio:P[0-3]$/.test(label)) ?? 'prio:P2',
    satisfiedWithoutIssue,
    blockedBy,
  }
}

/**
 * Claim queue shared by `agent:claim` and the agent pool: open `ready` issues
 * filtered to UNBLOCKED, ordered by `prio:P0..P3` then oldest first.
 */
export const buildClaimQueue = (openReady, byId) => {
  const doneIds = doneIdsOf(byId)

  return openReady
    .map((issue) => entryForIssue(issue, byId, doneIds))
    .filter((entry) => entry.blockedBy.length === 0)
    .sort((a, b) => {
      const rank =
        priorityRank(a.priority.replace('prio:', '')) -
        priorityRank(b.priority.replace('prio:', ''))
      return rank !== 0 ? rank : a.issue.createdAt.localeCompare(b.issue.createdAt)
    })
}

/** Entry shape for ONE issue regardless of its labels — the reopen path. */
export const claimQueueEntry = (issue, byId) => entryForIssue(issue, byId, doneIdsOf(byId))

/**
 * Pure decision for `worktree next --issue <N>`: `reopen` = already claimed
 * (`in-progress` — no re-claim); `claim` = `ready`; `error` = anything else.
 */
export const claimTargetVerdict = (issue) => {
  if (issue.state !== 'OPEN') {
    return { kind: 'error', message: `Issue não está aberta (${issue.state}).` }
  }
  const names = labelNames(issue)
  if (names.includes('in-progress')) return { kind: 'reopen' }
  if (names.includes('ready')) return { kind: 'claim' }
  return {
    kind: 'error',
    message: `Issue não é claimável (labels: ${names.join(', ') || 'nenhum'}).`,
  }
}

/**
 * Optimistic claim shared by `agent:claim` and `worktree next`: re-reads the
 * issue right before flipping labels, refuses if someone else already took it,
 * then swaps ready→in-progress and leaves a claim comment.
 */
export const claimIssue = async (entry, die) => {
  const fresh = await api.getIssue(entry.issue.number)
  const freshLabels = labelNames(fresh)
  if (
    fresh.state !== 'OPEN' ||
    !freshLabels.includes('ready') ||
    freshLabels.includes('in-progress')
  ) {
    die(
      `Issue #${entry.issue.number} was just claimed or closed by someone else. ` +
        'Re-run `bun run agent:claim` or reopen the session with `bun run worktree next --issue ' +
        `${entry.issue.number}` +
        '`.',
    )
  }

  await setLabels(entry.issue.number, { add: ['in-progress'], remove: ['ready'] })
  await api.addComment(
    entry.issue.number,
    `Claimed by agent run at ${new Date().toISOString()}. Lock otimista: outro claim deve falhar e re-rodar \`bun run agent:claim\`.`,
  )
}

/**
 * Lines of the claim brief (id, priority, model, deps, url, spec body)
 * printed by both claim surfaces (`agent:claim` and `worktree next`).
 */
export const claimBriefLines = (entry) => {
  const { rest } = parseFrontmatter(entry.issue.body)
  const issueId = entry.meta.id ?? null
  let subject = entry.issue.title
  if (issueId) {
    const idPrefix = `${issueId} — `
    if (subject.startsWith(idPrefix)) subject = subject.slice(idPrefix.length)
  }
  const sessionTitle = issueId
    ? `#${entry.issue.number} ${issueId} — ${subject}`
    : `#${entry.issue.number} — ${subject}`

  return [
    `  id: ${issueId ?? '(none)'}  priority: ${entry.priority}`,
    `  rename_chat: ${sessionTitle.slice(0, 200)}`,
    entry.meta.model
      ? `  model: ${entry.meta.model} (metadata consultiva — o work-issue não verifica modelo; ver skill model-selection)`
      : '  model: ausente — registrar slug único na Issue (ver skill model-selection)',
    ...(entry.satisfiedWithoutIssue.length > 0
      ? [
          `  deps sem issue (roadmap entregue, satisfeitas): ${entry.satisfiedWithoutIssue.join(', ')}`,
        ]
      : []),
    `  url: ${issueUrl(entry.issue.number)}`,
    '',
    '--- spec ---',
    '',
    rest.trim() || '(empty body — see linked plan)',
  ]
}

export const setLabels = (number, { add = [], remove = [] }) =>
  api.setLabels(number, { add, remove })

export const nextClaimableIssue = async () => {
  const openReady = await api.listIssues({ state: 'open', labels: 'ready', limit: 200 })
  const queue = buildClaimQueue(openReady, await issuesById())
  return queue[0] ?? null
}

export const parseArgs = (argv, flagsWithValue) => {
  const flags = {}
  const positional = []
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg.startsWith('--')) {
      const name = arg.slice(2)
      if (flagsWithValue.has(name)) {
        const next = argv[index + 1]
        // A following `--flag` is not a value: `--issue --stay` leaves the
        // flag unset instead of silently consuming another flag as its value.
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
