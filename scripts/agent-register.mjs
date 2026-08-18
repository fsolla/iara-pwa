/**
 * `bun run agent:register` — create a trackable issue (spec + prio + deps).
 *
 *   bun run agent:register -- --id I7 --title "Ações rápidas — X" \
 *     --prio P1 --depends I3 --kind feature --plan docs/plans/x.md [--body "..."]
 *
 * Body = frontmatter (id/depends/priority) + spec (linked plan + --body text).
 * Starts life labeled `ready`, or `blocked` when `--blocked` / `--plan`
 * (plan-linked Issues are not claimable until the plan is on `main` and
 * `bun run agent:ready` promotes them).
 *
 * Portado do teqo (scripts/agent-register.mjs) — URL derivada do repo.
 */

import {
  dieAgent,
  issuesById,
  parseArgs,
  serializeFrontmatter,
  issueUrl,
} from './lib/agent-forgejo.mjs'
import { resolveRegisterStateLabel } from './lib/agent-plan-lifecycle.mjs'
import { loadProjectEnv } from './lib/load-project-env.mjs'

loadProjectEnv()
const forgejoModule = await import('./lib/forgejo-api.mjs');;
const { forgejoApi: api } = forgejoModule

const die = dieAgent('register')
const { flags } = parseArgs(
  process.argv.slice(2),
  new Set(['id', 'title', 'prio', 'depends', 'kind', 'plan', 'body', 'labels', 'model']),
)

if (!flags.id || !flags.title)
  die(
    'Usage: bun run agent:register -- --id <ID> --title <title> [--prio P2] [--depends A,B] [--kind feature] [--plan path] [--body text] [--labels extra,labels] [--model slug] [--blocked]',
  )

const priority = /^P[0-3]$/.test(flags.prio ?? 'P2')
  ? (flags.prio ?? 'P2')
  : die(`Invalid --prio "${flags.prio}" (P0..P3).`)
const depends = (flags.depends ?? '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean)

const existing = (await issuesById()).get(flags.id)
if (existing)
  die(`An issue with id ${flags.id} already exists: #${existing.number} — ${existing.title}`)

const body = serializeFrontmatter(
  {
    id: flags.id,
    depends,
    serializes: [],
    priority,
    ...(flags.model ? { model: flags.model } : {}),
  },
  [flags.plan ? `Plano: [\`${flags.plan}\`](${flags.plan})` : null, flags.body ?? '']
    .filter((chunk) => chunk !== null)
    .join('\n\n'),
)

const stateLabel = resolveRegisterStateLabel({
  hasPlan: Boolean(flags.plan),
  explicitBlocked: Boolean(flags.blocked),
})
const labels = [
  stateLabel,
  `prio:${priority}`,
  `kind:${flags.kind ?? 'feature'}`,
  ...(flags.labels ?? '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean),
]

const created = await api.createIssue({
  title: `${flags.id} — ${flags.title}`,
  body,
})
await api.setLabels(created.number, { add: labels })
const url = issueUrl(created.number)

const hint =
  stateLabel === 'blocked' && flags.plan && !flags.blocked
    ? ' (blocked até plano em main — depois: bun run agent:ready -- --issue <N>)'
    : ''
console.log(`[agent:register] created ${url}${hint}`)
