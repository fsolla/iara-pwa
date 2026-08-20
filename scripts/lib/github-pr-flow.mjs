/**
 * Pure decision logic for the GitHub PR auto-merge safety net
 * (scripts/github-pr-automerge.mjs) and `bun run pr -- --automerge`
 * (scripts/pr.mjs). Unit-tested in tests/unit/github-pr-flow.test.ts — the
 * OPS57 (draft veto) / OPS64 (never merge on red CI) pins ported to the
 * GitHub mechanism.
 *
 * GitHub's native auto-merge only fires with the required checks green, so
 * the decision is reduced to: skip (non-main base, draft veto, already
 * merged/closed) or arm auto-merge.
 *
 * Unlike the teqo OPS71 port, there is NO `cursor/*` mark-ready path: Iara
 * has no draft-creating flow (`bun run pr` never drafts) — any draft is the
 * actor's veto, always skipped.
 */

/**
 * @param {object|null} pr - normalized PR from github-api (or null)
 * @returns {{ action: 'skip' | 'enable-auto-merge', reason: string }}
 */
export const decideAutomergeAction = (pr) => {
  if (!pr) return { action: 'skip', reason: 'pr-inexistente' }
  if (pr.merged) return { action: 'skip', reason: 'ja-mergeada' }
  if (pr.state !== 'OPEN') return { action: 'skip', reason: 'pr-nao-aberta' }
  if (pr.base?.ref !== 'main') return { action: 'skip', reason: 'base-nao-main' }
  if (pr.draft) return { action: 'skip', reason: 'draft-veto' }
  return { action: 'enable-auto-merge', reason: 'ready' }
}