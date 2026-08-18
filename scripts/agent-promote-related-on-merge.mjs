/**
 * OPS18 safety net — on PR merge to `main`, promote plan-issue Issues cited as
 * `Related #N` from `blocked` → `ready` when they are still awaiting a plan.
 *
 * Soft-skips ineligible Issues (already ready, product-blocked without a plan
 * link, needs:*, etc.). Flip/comment failures for one Issue are logged and do
 * not abort siblings. Idempotent with `pnpm agent:ready`.
 *
 *   node scripts/agent-promote-related-on-merge.mjs --pr 123
 *   PR_BODY='Related #296' node scripts/agent-promote-related-on-merge.mjs --pr 123
 *
 * Env: GITHUB_TOKEN (Forgejo Actions) / FORGEJO_API_TOKEN; optional PR_BODY skips the PR read.
 */

import { dieAgent, parseArgs, setLabels } from './lib/agent-forgejo.mjs'
import { canPromotePlanIssue, parseRelatedIssueNumbers } from './lib/agent-plan-lifecycle.mjs'
import { forgejoApi as api } from './lib/forgejo-api.mjs'

const die = dieAgent('promote-related')
const { flags } = parseArgs(process.argv.slice(2), new Set(['pr']))

if (!flags.pr || !/^\d+$/.test(String(flags.pr))) {
  die('Usage: node scripts/agent-promote-related-on-merge.mjs --pr <N>')
}

const prNumber = Number(flags.pr)
const bodyFromEnv = process.env.PR_BODY
const body =
  typeof bodyFromEnv === 'string' ? bodyFromEnv : (await api.getPullRequest(prNumber)).body
const numbers = parseRelatedIssueNumbers(body)

if (numbers.length === 0) {
  console.log(`[agent:promote-related] PR #${prNumber}: no Related #N — nothing to do`)
  process.exit(0)
}

console.log(
  `[agent:promote-related] PR #${prNumber}: Related → ${numbers.map((n) => `#${n}`).join(', ')}`,
)

for (const number of numbers) {
  let issue
  try {
    issue = await api.getIssue(number)
  } catch (error) {
    console.log(
      `[agent:promote-related] #${number}: skip (issue view failed: ${
        error instanceof Error ? error.message : String(error)
      })`,
    )
    continue
  }

  const verdict = canPromotePlanIssue(issue)
  if (!verdict.ok) {
    if (verdict.reason === 'already-ready') {
      console.log(`[agent:promote-related] #${number}: already ready — skip`)
      continue
    }
    console.log(`[agent:promote-related] #${number}: skip (${verdict.reason})`)
    continue
  }

  try {
    await setLabels(number, { add: ['ready'], remove: ['blocked'] })
    await api.addComment(
      number,
      `Promovido a \`ready\` via Action OPS18 — plano de intenção em \`main\` (PR #${prNumber} com \`Related #${number}\`).`,
    )
    console.log(`[agent:promote-related] #${number}: blocked → ready`)
  } catch (error) {
    console.log(
      `[agent:promote-related] #${number}: promote failed (${
        error instanceof Error ? error.message : String(error)
      })`,
    )
  }
}
