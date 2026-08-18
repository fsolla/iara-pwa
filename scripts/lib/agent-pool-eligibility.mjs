/**
 * Autonomous-claim eligibility (pool) — portado do teqo. A Iara ainda não usa
 * pool de agentes; mantido para compatibilidade com `agent-plan-lifecycle`.
 */

import { labelNames } from './agent-forgejo.mjs'

export const POOL_CIRCUIT_BREAKER_FAILURES = 2

const EXCLUDED_STATE_LABELS = ['in-progress', 'blocked', 'done', 'in-prod']
export const HUMAN_GATE_LABELS = ['requirements-changed', 'needs:consent']

export const isAutonomousClaimable = (
  entry,
  { migrationBusy = false, poolFailureCount = 0 } = {},
) => {
  const labels = labelNames(entry.issue)
  if (entry.issue.state !== 'OPEN') return { ok: false, reason: 'not-open' }
  if (!labels.includes('ready')) return { ok: false, reason: 'not-ready' }
  if (EXCLUDED_STATE_LABELS.some((label) => labels.includes(label))) {
    return { ok: false, reason: 'state-label' }
  }
  if (HUMAN_GATE_LABELS.some((label) => labels.includes(label))) {
    return { ok: false, reason: 'needs-human' }
  }
  if ((entry.blockedBy ?? []).length > 0) return { ok: false, reason: 'blocked-by-deps' }
  if (poolFailureCount >= POOL_CIRCUIT_BREAKER_FAILURES) {
    return { ok: false, reason: 'circuit-breaker' }
  }
  const serializes = Array.isArray(entry.meta?.serializes) ? entry.meta.serializes : []
  const touchesSchema = labels.includes('needs:migration') || serializes.includes('migrations')
  if (touchesSchema && migrationBusy) return { ok: false, reason: 'migration-busy' }
  return { ok: true }
}

/** Plan link is a preference for claim/pool status (warn), never a claim blocker. */
export const issueHasPlanLink = (issue) => /docs\/plans\//.test(issue?.body ?? '')

export const buildPoolQueue = (
  claimQueue,
  { migrationBusy = false, failureCountsByIssue = new Map() } = {},
) => {
  const eligible = []
  const excluded = []
  for (const entry of claimQueue) {
    const verdict = isAutonomousClaimable(entry, {
      migrationBusy,
      poolFailureCount: failureCountsByIssue.get(entry.issue.number) ?? 0,
    })
    if (verdict.ok) {
      eligible.push({ entry, hasPlan: issueHasPlanLink(entry.issue) })
    } else {
      excluded.push({ entry, reason: verdict.reason })
    }
  }
  return { eligible, excluded }
}
