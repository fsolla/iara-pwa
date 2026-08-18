/**
 * Plain-Node CLI (no pnpm) — agent PR safety net: wait for checks and merge by
 * rebase (the Forgejo equivalent of `gh pr merge --auto --rebase`, which the
 * Forgejo API does not offer as a scheduled operation). Idempotent: already
 * merged → no-op success.
 *
 *   node scripts/forgejo-pr-automerge.mjs --pr <N>
 */

import { createApi } from './lib/forgejo-api.mjs'

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
  console.error('Usage: node scripts/forgejo-pr-automerge.mjs --pr <N>')
  process.exit(1)
}

const api = createApi({})
try {
  const pr = await api.getPullRequest(prNumber)
  if (!pr || pr.state !== 'OPEN') {
    console.log(
      `[forgejo-pr-automerge] PR #${prNumber} não está aberto (${pr?.state ?? 'inexistente'}) — skip`,
    )
    process.exit(0)
  }
  if (pr.isDraft) {
    console.log(`[forgejo-pr-automerge] PR #${prNumber} é draft — marcando Ready`)
    await api.markPullRequestReady(prNumber)
  } else {
    console.log(`[forgejo-pr-automerge] PR #${prNumber} já Ready`)
  }
  const merged = await api.autoMerge(prNumber, {
    // The workflow job that runs this script reports its own status on the
    // PR head sha — ignoring it avoids the self-wait deadlock. The required
    // `checks` context is enforced by waitForChecks.
    ignoreContexts: ['ready-automerge'],
    log: (line) => console.log(`[forgejo-pr-automerge] ${line}`),
  })
  console.log(
    merged
      ? `[forgejo-pr-automerge] PR #${prNumber} mergeado (rebase)`
      : `[forgejo-pr-automerge] PR #${prNumber} já mergeado`,
  )
} catch (error) {
  console.error(`[forgejo-pr-automerge] falhou: ${error instanceof Error ? error.message : error}`)
  process.exit(1)
}
