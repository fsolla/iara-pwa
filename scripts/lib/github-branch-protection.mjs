/**
 * Pure decision for the GitHub `main` branch protection rule (OPS1).
 *
 * The desired rule is the repo contract: main requires the ci-pr cascade
 * check-run as the only status check (strict=false, 0 reviews) and
 * `enforce_admins: true` so even repo admins cannot merge with a red required
 * check (the Forgejo-era "no server-side protection" invariant is replaced:
 * on GitHub the rule IS the final defense against every merge path, manual
 * API merges included).
 *
 * Context literal (verified live on the teqo PR #742, 2026-08-19 — same
 * GitHub infra): the required-check matching uses the CHECK-RUN NAME — the
 * bare JOB name (`checks`), NOT the UI display `<workflow name> / <job
 * name>`. The latter never matches and leaves the PR mergeable_state
 * "blocked" forever.
 */

export const REQUIRED_CHECK_CONTEXT = 'checks'

/**
 * GitHub PUT /branches/{branch}/protection replace-semantics payload. Only
 * `checks` (modern) is sent — `contexts` is legacy-derived and GitHub's API
 * rejects the two together (422 anyOf). The GET normalization reads the
 * check-run contexts from `checks`, so drift comparison is unaffected.
 */
export const DESIRED_RULE = Object.freeze({
  required_status_checks: {
    strict: false,
    checks: [{ context: REQUIRED_CHECK_CONTEXT }],
  },
  enforce_admins: true,
  required_pull_request_reviews: null,
  restrictions: null,
  required_linear_history: false,
  allow_force_pushes: false,
  allow_deletions: false,
  block_creations: false,
})

const sameStrings = (have, want) =>
  have.length === want.length &&
  want.every((value) => have.includes(value)) &&
  have.every((value) => want.includes(value))

/**
 * True when the existing rule (from `getBranchProtection`, already
 * normalized) matches the desired rule on every compared field — array
 * fields as sets.
 */
export const ruleMatches = (existing) => {
  if (!existing) return false
  const wantStatus = DESIRED_RULE.required_status_checks
  if (existing.enforce_admins !== DESIRED_RULE.enforce_admins) return false
  if (existing.required_pull_request_reviews !== null) return false
  const haveStatus = existing.required_status_checks
  if (!haveStatus) return false
  if (haveStatus.strict !== wantStatus.strict) return false
  return sameStrings(
    haveStatus.contexts,
    wantStatus.checks.map((entry) => entry.context),
  )
}

/**
 * What to do with the rule: `create` (no rule), `update` (rule exists with
 * drift), `noop` (already compliant). Idempotent re-runs land on `noop`.
 *
 * @param {object|null} existing - normalized rule from the API, or null
 * @returns {{ action: 'create' | 'update' | 'noop' }}
 */
export const planBranchProtectionRule = (existing) => {
  if (ruleMatches(existing)) return { action: 'noop' }
  return { action: existing ? 'update' : 'create' }
}