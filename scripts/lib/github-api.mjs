/**
 * GitHub REST + GraphQL client for the CI/PR scripts (`pr`, `github-pr*`,
 * branch protection). Zero dependencies — plain Node `fetch` — so it also runs
 * inside GitHub Actions jobs without `bun install`.
 *
 * Auth: `GITHUB_TOKEN` (PAT locally; the built-in Actions token in
 * workflows). Base URL: `GITHUB_API_URL`, else `https://api.github.com`.
 * Repository: `GITHUB_REPOSITORY` (set by `loadProjectEnv` from
 * `.forgejo/worktree.env` locally; by the runner in Actions), else the default.
 *
 * Retry (exponential backoff): um fetch que REJEITA a nível de rede
 * (DNS/TCP/reset — provavelmente nunca chegou ao servidor) retrya em
 * QUALQUER método; um 5xx retrya só em GET — resposta 5xx significa que o
 * servidor respondeu, então escritas falham fechado ali (sem duplicar efeito
 * colateral). 4xx nunca retrya. Defaults: 3 retries, base 300 ms ×2,
 * ±20% jitter.
 *
 * Shapes are normalized to the contract the CLI scripts use: `pr.state` ∈
 * OPEN|CLOSED, `pr.draft`, `pr.nodeId` (GraphQL auto-merge), branch
 * protection normalized for drift comparison.
 *
 * Portado do teqo (scripts/lib/github-api.mjs, OPS71) com o default de repo
 * da Iara (`fsolla/iara-pwa`).
 */

const DEFAULT_BASE_URL = 'https://api.github.com'
const DEFAULT_GRAPHQL_URL = 'https://api.github.com/graphql'
const DEFAULT_REPOSITORY = 'fsolla/iara-pwa'
const USER_AGENT = 'iara-agent-scripts/1.0 (github)'
const RETRYABLE_STATUSES = new Set([502, 503, 504])

/**
 * @typedef {object} GithubApiOptions
 * @property {string} [base]
 * @property {string} [graphqlBase]
 * @property {string} [token]
 * @property {string} [repository]
 * @property {(input: string | URL, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<Response>} [fetchImpl]
 * @property {number} [retries] Additional attempts after the first (total = retries + 1). Default 3.
 * @property {number} [backoffMs] Base exponential delay. Default 300.
 * @property {boolean} [jitter] ±20% randomization on each delay. Default true.
 * @property {(ms: number) => Promise<void>} [sleepImpl] Test seam for the backoff delay.
 */

/**
 * @param {GithubApiOptions} [options]
 */
export const createApi = ({
  base,
  graphqlBase,
  token,
  repository,
  fetchImpl,
  retries = 3,
  backoffMs = 300,
  jitter = true,
  sleepImpl = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
} = {}) => {
  const baseUrl = (base ?? process.env.GITHUB_API_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  const graphqlUrl = (graphqlBase ?? process.env.GITHUB_GRAPHQL_URL ?? DEFAULT_GRAPHQL_URL).replace(
    /\/+$/,
    '',
  )
  const repo = repository ?? process.env.GITHUB_REPOSITORY ?? DEFAULT_REPOSITORY
  const fetcher = fetchImpl ?? fetch
  const [owner, name] = repo.split('/')
  if (retries < 0 || backoffMs < 0) {
    throw new Error(
      `Retry inválido: retries=${retries}, backoffMs=${backoffMs} — ambos devem ser >= 0`,
    )
  }
  const attemptCount = retries + 1

  const backoffDelay = (attempt) => {
    const base = backoffMs * 2 ** (attempt - 1)
    return jitter ? Math.round(base * (0.8 + Math.random() * 0.4)) : base
  }

  const warnRetry = (path, method, reason, attempt, delay) =>
    console.warn(
      `[github-api] ${method} ${path} falhou (tentativa ${attempt}/${attemptCount}): ${reason} — retry em ${delay}ms`,
    )

  const headers = () => {
    const authToken = token ?? process.env.GITHUB_TOKEN
    if (!authToken) {
      throw new Error('Sem token para a API do GitHub — defina GITHUB_TOKEN.')
    }
    return {
      Authorization: `Bearer ${authToken}`,
      'User-Agent': USER_AGENT,
      'Content-Type': 'application/json',
    }
  }

  const request = async (path, { method = 'GET', body, query } = {}) => {
    const qs = query
      ? '?' +
        Object.entries(query)
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
          .join('&')
      : ''
    const url = `${baseUrl}${path}${qs}`
    const retryAfter = async (attempt, reason) => {
      const delay = backoffDelay(attempt)
      warnRetry(path, method, reason, attempt, delay)
      await sleepImpl(delay)
    }
    for (let attempt = 1; attempt <= attemptCount; attempt += 1) {
      const isLastAttempt = attempt === attemptCount
      let response
      try {
        response = await fetcher(url, {
          method,
          headers: headers(),
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        })
      } catch (error) {
        if (isLastAttempt) throw error
        await retryAfter(attempt, error.message)
        continue
      }
      if (method === 'GET' && !isLastAttempt && RETRYABLE_STATUSES.has(response.status)) {
        await response.body?.cancel()
        await retryAfter(attempt, `HTTP ${response.status}`)
        continue
      }
      let text
      try {
        text = await response.text()
      } catch (error) {
        if (isLastAttempt || method !== 'GET') throw error
        await retryAfter(attempt, error.message)
        continue
      }
      if (response.status === 404 && method === 'GET') return null
      if (!response.ok) {
        throw new Error(`GitHub API ${method} ${path} → ${response.status}: ${text.slice(0, 400)}`)
      }
      if (!text) return null
      try {
        return JSON.parse(text)
      } catch {
        throw new Error(`GitHub API ${method} ${path}: resposta não-JSON: ${text.slice(0, 80)}`)
      }
    }
  }

  const graphql = async (query, variables) => {
    let response
    try {
      response = await fetcher(graphqlUrl, {
        method: 'POST',
        headers: headers(),
        body: JSON.stringify({ query, variables }),
      })
    } catch (error) {
      throw new Error(`GitHub GraphQL falhou (rede): ${error.message}`)
    }
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`GitHub GraphQL → ${response.status}: ${text.slice(0, 400)}`)
    }
    const parsed = JSON.parse(text)
    const firstError = parsed?.errors?.[0]
    if (firstError) {
      throw new Error(`GitHub GraphQL: ${firstError.message}`)
    }
    return parsed.data ?? null
  }

  const normalizeState = (state) => (String(state).toLowerCase() === 'closed' ? 'CLOSED' : 'OPEN')

  const normalizePullRequest = (pr) => ({
    number: pr.number,
    title: pr.title,
    body: pr.body ?? '',
    state: normalizeState(pr.state),
    merged: Boolean(pr.merged_at || pr.merged),
    draft: Boolean(pr.draft),
    mergeable: pr.mergeable ?? null,
    nodeId: pr.node_id ?? '',
    head: { ref: pr.head?.ref ?? '', sha: pr.head?.sha ?? '' },
    base: { ref: pr.base?.ref ?? '' },
  })

  const api = {
    /**
     * GET /repos/{owner}/{repo}/pulls/{number} — normalized.
     * @param {number} number
     */
    getPullRequest: async (number) => {
      const pr = await request(`/repos/${owner}/${name}/pulls/${number}`)
      return pr ? normalizePullRequest(pr) : null
    },

    /** POST /pulls — creates a PR (never draft — repo rule). */
    createPullRequest: async ({ head, base = 'main', title, body }) => {
      const pr = await request(`/repos/${owner}/${name}/pulls`, {
        method: 'POST',
        body: { head, base, title, body },
      })
      return {
        number: pr.number,
        title: pr.title,
        htmlUrl: pr.html_url,
        nodeId: pr.node_id ?? '',
      }
    },

    /**
     * Enables GitHub's native auto-merge (GraphQL) with the repo's canonical
     * merge style (rebase). The server waits for the required checks — a PR
     * with a red required check can never auto-merge.
     */
    enableAutoMerge: async (nodeId, mergeMethod = 'REBASE') => {
      await graphql(
        `
          mutation EnablePullRequestAutoMerge($id: ID!, $mergeMethod: PullRequestMergeMethod!) {
            enablePullRequestAutoMerge(input: { pullRequestId: $id, mergeMethod: $mergeMethod }) {
              pullRequest {
                number
              }
            }
          }
        `,
        { id: nodeId, mergeMethod },
      )
    },

    /**
     * GET /repos/{owner}/{repo}/branches/{branch}/protection — normalized for
     * drift comparison; `null` when the branch has no protection rule (404).
     * Cobre todos os campos do DESIRED_RULE (ruleMatches os compara), então o
     * drift repair é completo: reviews/restrictions sem exigência viram
     * `null` (o GitHub pode ecoar um objeto com count 0), booleanos são
     * desembrulhados de `{ enabled }`.
     */
    getBranchProtection: async (branch = 'main') => {
      const rule = await request(`/repos/${owner}/${name}/branches/${branch}/protection`)
      if (!rule) return null
      const reviews = rule.required_pull_request_reviews
      return {
        required_status_checks: rule.required_status_checks
          ? {
              strict: Boolean(rule.required_status_checks.strict),
              contexts: (rule.required_status_checks.checks ?? []).map((entry) => entry.context),
            }
          : null,
        enforce_admins: Boolean(rule.enforce_admins?.enabled ?? rule.enforce_admins),
        required_pull_request_reviews:
          !reviews || (reviews.required_approving_review_count ?? 0) === 0 ? null : reviews,
        restrictions: rule.restrictions ?? null,
        required_linear_history: Boolean(rule.required_linear_history),
        allow_force_pushes: Boolean(rule.allow_force_pushes?.enabled ?? rule.allow_force_pushes),
        allow_deletions: Boolean(rule.allow_deletions?.enabled ?? rule.allow_deletions),
        block_creations: Boolean(rule.block_creations),
      }
    },

    /**
     * PUT /repos/{owner}/{repo}/branches/{branch}/protection — replaces the
     * whole rule (GitHub replace semantics: omitted protections are removed).
     */
    updateBranchProtection: (payload, branch = 'main') =>
      request(`/repos/${owner}/${name}/branches/${branch}/protection`, {
        method: 'PUT',
        body: payload,
      }),
  }

  return api
}
