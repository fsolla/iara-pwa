/**
 * `bun run agent:claim` — claim the next trackable issue for this agent run.
 *
 * Queue: open issues labeled `ready`, filtered to UNBLOCKED (every frontmatter
 * `depends` id is closed or labeled `done`/`in-prod`), ordered by `prio:P0..P3`
 * then oldest first. `--dry-run` prints the queue without claiming.
 *
 * Lock otimista: re-reads the issue right before flipping labels, refuses if
 * someone else already took it (`in-progress` present / `ready` gone), then
 * swaps ready→in-progress and leaves a claim comment with the run timestamp.
 *
 * Portado do teqo (scripts/agent-claim.mjs).
 */

import {
  buildClaimQueue,
  claimBriefLines,
  claimIssue,
  dieAgent,
  issuesById,
  parseArgs,
} from './lib/agent-forgejo.mjs'
import { loadProjectEnv } from './lib/load-project-env.mjs'

loadProjectEnv()
const forgejoModule = await import('./lib/forgejo-api.mjs');
const { forgejoApi: api } = forgejoModule;

const die = dieAgent('claim')
const { flags } = parseArgs(process.argv.slice(2), new Set(['issue']))

const openReady = await api.listIssues({ state: 'open', labels: 'ready', limit: 200 })

const queue = buildClaimQueue(openReady, await issuesById())

if (flags['dry-run'] || flags['dryrun']) {
  console.log(`[agent:claim] ${queue.length} unblocked ready issue(s):`)
  for (const entry of queue) {
    const model = entry.meta.model ? ` model:${entry.meta.model}` : ''
    console.log(`  #${entry.issue.number} [${entry.priority}]${model} ${entry.issue.title}`)
  }
  process.exit(0)
}

const pick = flags.issue
  ? queue.find((entry) => entry.issue.number === Number(flags.issue))
  : queue[0]

if (!pick) {
  die(
    flags.issue
      ? `Issue #${flags.issue} is not claimable (missing, not ready, or blocked by deps).`
      : 'Nothing to claim — no unblocked issues labeled `ready`. Run with --dry-run to inspect.',
  )
}

await claimIssue(pick, die)

console.log(`\n[agent:claim] Claimed #${pick.issue.number} — ${pick.issue.title}`)
for (const line of claimBriefLines(pick)) console.log(line)
console.log(
  '\n[agent:claim] Fluxo: claim feito fora da sessão → abra a sessão de trabalho no worktree (skill `work-issue`) → gates → PR Ready --base main (Closes #' +
    `${pick.issue.number}) → auto-merge.`,
)
