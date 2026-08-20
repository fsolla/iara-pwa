/**
 * Plain-Node CLI (no bun) — GitHub PR safety net: arm GitHub's native
 * auto-merge (rebase) for same-repo PRs to main. Runs in
 * .github/workflows/agent-pr-ready-automerge.yml with the built-in
 * GITHUB_TOKEN (permissions: contents + pull-requests write).
 *
 * Unlike the Forgejo-era automerger, there is NO poll loop:
 * `enablePullRequestAutoMerge` is server-side — GitHub only merges when every
 * required check (incl. `checks`) is green and the PR is mergeable. The
 * OPS64 "never trust the rollup" pin is structural here: a single sequential
 * job posts one honest check-run, and the server enforces it. Draft policy
 * preserved: any draft is the actor's veto (skip, exit 0).
 *
 * Idempotent: already merged / closed / non-main base / draft → no-op success.
 * A GraphQL error (e.g. repo auto-merge disabled, PR in conflict) exits 1 so
 * the job goes red and the situation is visible.
 *
 *   node scripts/github-pr-automerge.mjs --pr <N>
 */

import { createApi } from './lib/github-api.mjs'
import { decideAutomergeAction } from './lib/github-pr-flow.mjs'

const parseArgs = (argv) => {
  const flags = {}
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg.startsWith('--')) {
      const name = arg.slice(2)
      const next = argv[index + 1]
      flags[name] = typeof next === 'string' && !next.startsWith('--') ? next : true
      if (typeof next === 'string' && !next.startsWith('--')) index += 1
    }
  }
  return flags
}

const flags = parseArgs(process.argv)
const prNumber = Number(flags.pr)
if (!Number.isInteger(prNumber) || prNumber <= 0) {
  console.error('Usage: node scripts/github-pr-automerge.mjs --pr <N>')
  process.exit(1)
}

const api = createApi({})
try {
  const pr = await api.getPullRequest(prNumber)
  const verdict = decideAutomergeAction(pr)

  if (verdict.action === 'skip') {
    console.log(`[github-pr-automerge] PR #${prNumber}: skip (${verdict.reason})`)
    process.exit(0)
  }

  console.log(`[github-pr-automerge] PR #${prNumber}: armando auto-merge (rebase)`)
  await api.enableAutoMerge(pr.nodeId)
  console.log(
    `[github-pr-automerge] PR #${prNumber}: auto-merge armado — o GitHub mergea quando o required check "checks" fica verde`,
  )
} catch (error) {
  console.error(`[github-pr-automerge] falhou: ${error instanceof Error ? error.message : error}`)
  process.exit(1)
}
