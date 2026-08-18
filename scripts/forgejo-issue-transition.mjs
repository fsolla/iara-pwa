/**
 * Plain-Node CLI (no pnpm) — on merge to main, flip Issues cited as
 * `Closes #N` / `Fixes #N` in the PR body to `done` + `in-prod` and comment.
 * Replacement for the `gh issue edit/comment` loop of issue-done-on-main-merge.
 * The PR body comes from the API (Forgejo's PR webhook payload is not relied
 * on), so the workflow only needs the PR number.
 *
 *   node scripts/forgejo-issue-transition.mjs --pr <N>
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
const pr = await api.getPullRequest(prNumber)
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

for (const number of numbers) {
  try {
    await api.setLabels(number, { add: ['done', 'in-prod'], remove: ['in-progress'] })
    await api.addComment(
      number,
      `Merged em main via PR #${prNumber} — \`done\` + \`in-prod\`. Deploy de produção segue o verificador \`ci.yml\` (gated).`,
    )
    console.log(`[forgejo-issue-transition] #${number}: done + in-prod`)
  } catch (error) {
    console.log(
      `[forgejo-issue-transition] #${number}: skip (${error instanceof Error ? error.message : error})`,
    )
  }
}
