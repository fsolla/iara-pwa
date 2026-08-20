/**
 * Drift repair for `main` branch protection — GitHub (OPS1). Idempotent:
 * reads the existing rule and creates / updates / no-ops (never duplicates).
 *
 *   bun run configure:branch-protection                # apply
 *   bun run configure:branch-protection -- --dry-run
 *
 * Desired rule: required check-run `checks` (the ci-pr cascade job), 
 * strict=false, 0 reviews, `enforce_admins: true` (nobody, admin included,
 * merges with a red required check). PRs auto-merge when that check is
 * green; the server rule is the final defense against every merge path,
 * manual API merges included.
 */

import { createApi } from './lib/github-api.mjs'
import {
  DESIRED_RULE,
  planBranchProtectionRule,
  ruleMatches,
} from './lib/github-branch-protection.mjs'
import { loadProjectEnv } from './lib/load-project-env.mjs'

loadProjectEnv()

const parseArgs = (argv) => {
  const flags = {}
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg.startsWith('--')) {
      const name = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase())
      const next = argv[index + 1]
      flags[name] = typeof next === 'string' && !next.startsWith('--') ? next : true
      if (typeof next === 'string' && !next.startsWith('--')) index += 1
    }
  }
  return flags
}

const flags = parseArgs(process.argv)
const dryRun = flags.dryRun === true
const branch = 'main'

const api = createApi({})
const repo = process.env.GITHUB_REPOSITORY
const existing = await api.getBranchProtection(branch)
const { action } = planBranchProtectionRule(existing)

console.log(
  `[configure:branch-protection] repo ${repo}${dryRun ? ' (dry-run)' : ''} — regra "${branch}": ${
    action === 'noop'
      ? 'já conforme — nada a fazer'
      : action === 'update'
        ? 'atualizar (drift)'
        : 'criar'
  }`,
)

if (action === 'noop') {
  console.log(`[configure:branch-protection] no-op: ${JSON.stringify(existing)}`)
  process.exit(0)
}

if (dryRun) {
  console.log(
    `[dry-run] PUT /repos/${repo}/branches/${branch}/protection ${JSON.stringify(DESIRED_RULE)}`,
  )
  process.exit(0)
}

await api.updateBranchProtection(DESIRED_RULE, branch)

const after = await api.getBranchProtection(branch)
if (!after || !ruleMatches(after)) {
  console.error(
    `[configure:branch-protection] FALHOU: PUT respondeu mas a regra "${branch}" no servidor não bate com a desejada — ${JSON.stringify(after)}`,
  )
  process.exit(1)
}
console.log(
  `[configure:branch-protection] done — regra verificada no servidor: ${JSON.stringify(after)}`,
)
