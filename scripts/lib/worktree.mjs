/**
 * Pure helpers for `scripts/worktree.mjs` — branch naming derived from the
 * claim-queue issue. Naming: `<code>-<slug>` where `code` is the frontmatter
 * `id` and `slug` is the pt-BR title slugified (accents stripped,
 * non-alphanumeric → `-`). Portado do teqo, com slugify em scripts/lib/slug.mjs.
 */

import { slugify } from './slug.mjs'

/**
 * Prefix of every `/plan-issue` planning-worktree branch (`bun run worktree
 * plan`). Lowercase-led `plans/…`, so it can never collide with a `next`
 * branch — `<Code>-<slug>` is always uppercase-led.
 */
export const PLAN_BRANCH_PREFIX = 'plans/plan-issue'

/** Env var the interactive-terminal `worktree()` function sets to request the opencode launch. */
export const WORKTREE_TERMINAL_ENV = 'TEQO_WORKTREE_TERMINAL'

/** Preset model for the opencode launch — change the preset by editing this constant. */
export const OPENCODE_PRESET_MODEL = 'deepseek/deepseek-v4-flash'

/**
 * Skill command sent as the launch's initial message per purpose. `next`
 * sends `/work-issue` (the launch appends `--issue <N>` — the claimed issue);
 * `plan` sends `/plan-issue`; `new` sends nothing ("apenas conversar").
 */
export const OPENCODE_SKILL_COMMAND_BY_PURPOSE = {
  next: '/work-issue',
  plan: '/plan-issue',
  new: null,
}

/**
 * Prefix of every neutral-worktree branch (`bun run worktree new`).
 * Lowercase-led `work/…` — disjoint from `next`'s `<Code>-<slug>` and from
 * `plan`'s `plans/plan-issue-…`.
 */
export const WORK_BRANCH_PREFIX = 'work'

/** Total branch-name budget — mirrors `branchNameForIssue` (60). */
const NAMESPACE_BRANCH_MAX_LENGTH = 60

/** Strip the leading `<code> — ` (or any dash variant) off a title. */
const stripCodePrefix = (title, code) => {
  const escaped = code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return title.replace(new RegExp(`^${escaped}\\s*[—–:-]?\\s*`), '')
}

/**
 * `code` = frontmatter `id` (falls back to the leading `ID — ` token of the
 * title); `subject` = the title with that prefix removed.
 */
export const issueCodeAndSubject = (issue) => {
  const title = issue.title ?? ''
  const code = typeof issue.meta?.id === 'string' && issue.meta.id.length > 0 ? issue.meta.id : null
  const subject = code
    ? stripCodePrefix(title, code)
    : title.replace(/^[A-Za-z0-9+]+\s*[—–:-]?\s*/, '')
  return { code, subject }
}

/**
 * `<code>-<slug>` truncated to `maxLength` total characters (always keeping
 * the code). Throws when the issue has no id — fail loudly, never invent.
 */
export const branchNameForIssue = (issue, maxLength = 60) => {
  const { code, subject } = issueCodeAndSubject(issue)
  if (!code) {
    throw new Error(`Issue sem frontmatter id: #${issue.number} ${issue.title}`)
  }
  const slug = slugify(subject) || 'issue'
  const full = `${code}-${slug}`
  if (full.length <= maxLength) return full
  const keep = Math.max(1, maxLength - code.length - 1)
  return `${code}-${slug.slice(0, keep)}`
}

/**
 * Shared branch naming for namespace worktrees NOT tied to the claim queue
 * (`plan`, `new`). Every invocation must land on a DIFFERENT branch so
 * parallel sessions coexist: with `bag` → `<prefix><slug>` (+ `-2`, `-3` on
 * collision); without → next free sequential `<prefix>1`, `<prefix>2`, …
 */
const namespaceBranchName = ({ prefix, bag = '', taken = new Set(), fallback }) => {
  const hasBag = typeof bag === 'string' && bag.trim().length > 0

  if (!hasBag) {
    for (let n = 1; ; n += 1) {
      const candidate = `${prefix}${n}`
      if (!taken.has(candidate)) return candidate
    }
  }

  const slug = slugify(bag) || fallback
  const base = `${prefix}${slug.slice(0, NAMESPACE_BRANCH_MAX_LENGTH - prefix.length)}`
  if (!taken.has(base)) return base

  for (let n = 2; ; n += 1) {
    const suffix = `-${n}`
    const keep = Math.max(1, NAMESPACE_BRANCH_MAX_LENGTH - prefix.length - suffix.length)
    const candidate = `${prefix}${slug.slice(0, keep)}${suffix}`
    if (!taken.has(candidate)) return candidate
  }
}

/**
 * Launch directive for the opencode TUI, printed by `worktree next`/`plan`
 * right before the `cd <dir>` line when called from the interactive terminal
 * (`WORKTREE_TERMINAL=1`). The shell function applies the `cd` first, then
 * tokenizes and executes this line (xargs — quote-aware, never eval). Returns
 * `null` outside the terminal so the `/worktree` opencode command never
 * launches a nested TUI.
 */
export const opencodeLaunchDirective = ({ dir, purpose, terminal = false, issueNumber = null }) => {
  if (!terminal) return null
  const prompt = OPENCODE_SKILL_COMMAND_BY_PURPOSE[purpose]
  const args = [dir, '--model', OPENCODE_PRESET_MODEL, '--auto']
  if (prompt) {
    const value = purpose === 'next' && issueNumber ? `${prompt} --issue ${issueNumber}` : prompt
    args.push('--prompt', JSON.stringify(value))
  }
  return `launch opencode ${args.join(' ')}`
}

/** Branch for a `/plan-issue` planning worktree — namespace `plans/plan-issue-…`. */
export const planBranchName = ({ bag = '', taken = new Set() }) =>
  namespaceBranchName({ prefix: `${PLAN_BRANCH_PREFIX}-`, bag, taken, fallback: 'plano' })

/** Branch for a neutral worktree (`bun run worktree new`) — namespace `work/…`. */
export const workBranchName = ({ bag = '', taken = new Set() }) =>
  namespaceBranchName({ prefix: `${WORK_BRANCH_PREFIX}/`, bag, taken, fallback: 'work' })
