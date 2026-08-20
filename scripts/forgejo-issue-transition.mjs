/**
 * Plain-Node CLI (no pnpm) — on merge to main, flip Issues cited as
 * `Closes #N` / `Fixes #N` in the PR body to `done` + `in-prod` and comment.
 *
 * OPS1: the PR now lives on GitHub; the ISSUES stay on the Forgejo tracker.
 * The workflow passes the PR body via the `PR_BODY` env (from the GitHub
 * event payload) and the script flips Issues on the Forgejo API — no Forgejo
 * PR read when PR_BODY is present. Without PR_BODY the script falls back to
 * reading the PR from the Forgejo API (the Forgejo-era workflows stay alive
 * until the OPS1 Fase 2 removal).
 *
 * Fail-loud (I10 absorbed): a failed flip exits 1 — the flip is the whole
 * purpose of this workflow, and the era of silent failures proved that a
 * swallowed error ends the job "success" while the status labels lie.
 * Sibling issues are still attempted (the loop does not abort), but the job
 * goes red so the breakage is visible.
 *
 *   node scripts/forgejo-issue-transition.mjs --pr <N>
 *   PR_BODY='Closes #17' node scripts/forgejo-issue-transition.mjs --pr <N>
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
  console.error('Usage: node scripts/forgejo-issue-transition.mjs --pr <N>')
  process.exit(1)
}

const api = createApi({})
const bodyFromEnv = process.env.PR_BODY
const pr =
  typeof bodyFromEnv === 'string'
    ? { merged: true, body: bodyFromEnv }
    : await api.getPullRequest(prNumber)
if (!pr) {
  console.error(`[forgejo-issue-transition] PR #${prNumber} não encontrada`)
  process.exit(1)
}
if (!pr.merged) {
  console.log(`[forgejo-issue-transition] PR #${prNumber} não mergeada — skip`)
  process.exit(0)
}

const numbers = [
  ...new Set([...pr.body.matchAll(/(?:closes|fixes)\s+#(\d+)/gi)].map((match) => Number(match[1]))),
]

if (numbers.length === 0) {
  console.log(`[forgejo-issue-transition] PR #${prNumber}: nenhum Closes/Fixes #N — nada a fazer`)
  process.exit(0)
}

let flipFailed = false
for (const number of numbers) {
  try {
    await api.setLabels(number, { add: ['done', 'in-prod'], remove: ['in-progress'] })
    await api.addComment(
      number,
      `Merged em main via PR #${prNumber} — \`done\` + \`in-prod\`. Deploy de produção é manual (workflow_dispatch no GitHub Actions).`,
    )
    console.log(`[forgejo-issue-transition] #${number}: done + in-prod`)
  } catch (error) {
    flipFailed = true
    console.error(
      `[forgejo-issue-transition] #${number}: FLIP FALHOU — ${error instanceof Error ? error.message : error}`,
    )
  }
}
if (flipFailed) {
  console.error(
    `[forgejo-issue-transition] PR #${prNumber}: ${numbers.length} Issue(s) citada(s), pelo menos 1 flip falhou — os labels de status podem estar mentindo.`,
  )
  process.exit(1)
}
