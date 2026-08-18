/**
 * Forgejo REST client for the agent ops scripts (`bun run agent:*`, workflow
 * helpers). Zero dependencies — plain Node `fetch` — so it also runs inside
 * Forgejo Actions jobs without `bun install`.
 *
 * Auth: `FORGEJO_API_TOKEN` (PAT) or the native `GITHUB_TOKEN` that Forgejo
 * Actions injects. Base URL: `FORGEJO_API_URL`, else `<GITHUB_SERVER_URL>/api/v1`
 * inside Actions, else `https://git.solla.dev/api/v1`. A browser-ish User-Agent
 * is sent because the instance sits behind Cloudflare.
 *
 * Shapes are normalized to the GitHub-flavored contract the agent scripts
 * already use: `issue.state` ∈ OPEN|CLOSED, `issue.labels = [{ name, color }]`,
 * `createdAt` ISO string.
 *
 * Portado do teqo (scripts/lib/forgejo-api.mjs) — sem alteração de lógica;
 * default de repositório vem do `.forgejo/worktree.env` (load-project-env).
 */

const DEFAULT_BASE_URL = 'https://git.solla.dev/api/v1'
const USER_AGENT = 'iara-agent-scripts/1.0 (forgejo)'

/**
 * @typedef {object} ForgejoApiOptions
 * @property {string} [base]
 * @property {string} [token]
 * @property {string} [repository]
 * @property {(input: string | URL, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<Response>} [fetchImpl]
 */

/**
 * @param {ForgejoApiOptions} [options]
 */
export const createApi = ({ base, token, repository, fetchImpl } = {}) => {
  const baseUrl = (
    base ??
    process.env.FORGEJO_API_URL ??
    (process.env.GITHUB_SERVER_URL ? `${process.env.GITHUB_SERVER_URL}/api/v1` : null) ??
    DEFAULT_BASE_URL
  ).replace(/\/+$/, '')
  const repo =
    repository ??
    process.env.FORGEJO_REPOSITORY ??
    process.env.GITHUB_REPOSITORY ??
    'amana/iara-pwa'
  const fetcher = fetchImpl ?? fetch
  const [owner, name] = repo.split('/')

  const request = async (path, { method = 'GET', body, query } = {}) => {
    const authToken = token ?? process.env.FORGEJO_API_TOKEN ?? process.env.GITHUB_TOKEN
    if (!authToken) {
      throw new Error(
        'Sem token para a API do Forgejo — defina FORGEJO_API_TOKEN (ou rode dentro do Forgejo Actions).',
      )
    }
    const qs = query
      ? '?' +
        Object.entries(query)
          .filter(([, value]) => value !== undefined && value !== null)
          .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
          .join('&')
      : ''
    const response = await fetcher(`${baseUrl}${path}${qs}`, {
      method,
      headers: {
        Authorization: `token ${authToken}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
    const text = await response.text()
    if (!response.ok) {
      throw new Error(`Forgejo API ${method} ${path} → ${response.status}: ${text.slice(0, 400)}`)
    }
    return text ? JSON.parse(text) : null
  }

  const normalizeState = (state) => (String(state).toLowerCase() === 'closed' ? 'CLOSED' : 'OPEN')

  const normalizeIssue = (issue) => ({
    number: issue.number,
    title: issue.title,
    body: issue.body ?? '',
    state: normalizeState(issue.state),
    createdAt: issue.created_at,
    labels: (issue.labels ?? []).map((label) => ({
      name: label.name,
      color: label.color ?? '',
    })),
  })

  const api = {
    /** GET /api/v1/repos/{owner}/{repo}/issues — shape normalized like `gh issue list --json`. */
    listIssues: async ({ state = 'open', labels, limit = 200, page = 1 } = {}) => {
      const issues = await request(`/repos/${owner}/${name}/issues`, {
        query: { state, labels, limit, page, type: 'issues' },
      })
      return (Array.isArray(issues) ? issues : []).map(normalizeIssue)
    },

    getIssue: async (number) => {
      const issue = await request(`/repos/${owner}/${name}/issues/${number}`)
      return normalizeIssue(issue)
    },

    createIssue: async ({ title, body }) => {
      const issue = await request(`/repos/${owner}/${name}/issues`, {
        method: 'POST',
        body: { title, body },
      })
      return normalizeIssue(issue)
    },

    /** Adds labels (never removes). */
    addLabels: (number, labels) =>
      request(`/repos/${owner}/${name}/issues/${number}/labels`, {
        method: 'POST',
        body: { labels },
      }),

    /** Removes labels by name (resolves ids, ignores unknown names). */
    removeLabels: async (number, labels) => {
      const current = await request(`/repos/${owner}/${name}/issues/${number}/labels`)
      for (const label of current ?? []) {
        if (labels.includes(label.name)) {
          await request(`/repos/${owner}/${name}/issues/${number}/labels/${label.id}`, {
            method: 'DELETE',
          })
        }
      }
    },

    /**
     * @param {number} number
     * @param {{ add?: string[], remove?: string[] }} [options]
     */
    setLabels: async (number, { add = [], remove = [] } = {}) => {
      if (remove.length > 0) await api.removeLabels(number, remove)
      if (add.length > 0) await api.addLabels(number, add)
    },

    addComment: (number, body) =>
      request(`/repos/${owner}/${name}/issues/${number}/comments`, {
        method: 'POST',
        body: { body },
      }),

    listIssueComments: async (number) => {
      const comments = await request(`/repos/${owner}/${name}/issues/${number}/comments`)
      return (Array.isArray(comments) ? comments : []).map((comment) => ({
        body: comment.body ?? '',
        user: comment.user?.login ?? '',
      }))
    },

    listPullRequestFiles: async (number) => {
      const files = await request(`/repos/${owner}/${name}/pulls/${number}/files`)
      return (Array.isArray(files) ? files : []).map((file) => ({
        filename: file.filename,
        status: file.status,
      }))
    },

    /** GET /api/v1/repos/{owner}/{repo}/pulls — raw, normalized lightly. */
    listPullRequests: async ({ state = 'open', limit = 100 } = {}) => {
      const pulls = await request(`/repos/${owner}/${name}/pulls`, {
        query: { state, limit },
      })
      return (Array.isArray(pulls) ? pulls : []).map((pr) => ({
        number: pr.number,
        title: pr.title,
        state: normalizeState(pr.state),
        body: pr.body ?? '',
        head: { ref: pr.head?.ref, sha: pr.head?.sha },
        base: { ref: pr.base?.ref },
      }))
    },

    getPullRequest: async (number) => {
      const pr = await request(`/repos/${owner}/${name}/pulls/${number}`)
      return {
        number: pr.number,
        title: pr.title,
        state: normalizeState(pr.state),
        merged: Boolean(pr.merged),
        mergeable: pr.mergeable,
        isDraft: Boolean(pr.is_draft),
        body: pr.body ?? '',
        head: { ref: pr.head?.ref, sha: pr.head?.sha },
        base: { ref: pr.base?.ref },
      }
    },

    /** Marks a draft PR as ready for review (PATCH is_draft=false). */
    markPullRequestReady: (number) =>
      request(`/repos/${owner}/${name}/pulls/${number}`, {
        method: 'PATCH',
        body: { is_draft: false },
      }),

    createPullRequest: async ({ head, base, title, body, draft = false }) => {
      const pr = await request(`/repos/${owner}/${name}/pulls`, {
        method: 'POST',
        body: { head, base, title, body, draft },
      })
      return { number: pr.number, title: pr.title, htmlUrl: pr.html_url, isDraft: Boolean(pr.is_draft) }
    },

    /**
     * Commit statuses of a sha (Forgejo Actions check runs surface here).
     * Returns [{ context, state }] with state ∈ success|failure|pending|error.
     */
    listCommitStatuses: async (sha) => {
      const statuses = await request(`/repos/${owner}/${name}/commits/${sha}/status`)
      const combined = statuses?.statuses ?? []
      return combined.map((entry) => ({ context: entry.context, state: entry.status }))
    },

    /** Merges a PR with rebase (the repo's canonical merge style). */
    mergePullRequest: (number) =>
      request(`/repos/${owner}/${name}/pulls/${number}/merge`, {
        method: 'POST',
        body: { Do: 'rebase' },
      }),

    /** Triggers a workflow via workflow_dispatch. */
    workflowDispatch: (workflowFile, { ref = 'main', inputs = {} } = {}) =>
      request(`/repos/${owner}/${name}/actions/workflows/${workflowFile}/dispatches`, {
        method: 'POST',
        body: { ref, inputs },
      }),

    /** GET /api/v1/repos/{owner}/{repo}/contents/{path}?ref=… — { content, sha } base64-decoded. */
    getFileContents: async (path, ref = 'main') => {
      const file = await request(`/repos/${owner}/${name}/contents/${path}`, {
        query: { ref },
      })
      return {
        content: Buffer.from(file.content ?? '', 'base64').toString('utf8'),
        sha: file.sha,
      }
    },

    /** POST /contents — creates a file on a branch (fails if it exists). */
    createFile: (path, { message, content, branch }) =>
      request(`/repos/${owner}/${name}/contents/${path}`, {
        method: 'POST',
        body: {
          message,
          content: Buffer.from(content, 'utf8').toString('base64'),
          branch,
        },
      }),

    /** PUT /contents — updates an existing file (sha required). */
    updateFile: (path, { message, content, branch, sha }) =>
      request(`/repos/${owner}/${name}/contents/${path}`, {
        method: 'PUT',
        body: {
          message,
          content: Buffer.from(content, 'utf8').toString('base64'),
          branch,
          sha,
        },
      }),

    /** POST /api/v1/repos/{owner}/{repo}/branch_protections (Forgejo rule-based protection). */
    updateBranchProtection: (branch, payload) =>
      request(`/repos/${owner}/${name}/branch_protections`, {
        method: 'POST',
        body: { ...payload, branch_name: branch },
      }),

    /**
     * All required statuses on the PR head are success (or a failure exists).
     * `ignoreContexts` excludes a job's OWN status — a workflow that merges a
     * PR sees itself as `pending` on the head sha and would deadlock waiting
     * for itself. `requiredContext` (default `checks`) must be success.
     */
    waitForChecks: async (
      number,
      { timeoutMs = 30 * 60 * 1000, pollMs = 15000, log, ignoreContexts = [], requiredContext = 'checks' } = {},
    ) => {
      const started = Date.now()
      for (;;) {
        const pr = await api.getPullRequest(number)
        if (!pr || pr.state !== 'OPEN' || pr.merged) return pr
        const statuses = await api.listCommitStatuses(pr.head.sha)
        const relevant = statuses.filter((entry) => !ignoreContexts.some((c) => entry.context.includes(c)))
        const failed = relevant.filter(
          (entry) => entry.state === 'failure' || entry.state === 'error',
        )
        const pending = relevant.filter((entry) => entry.state === 'pending')
        if (failed.length > 0) {
          const names = failed.map((entry) => entry.context).join(', ')
          throw new Error(`Checks falharam no PR #${number}: ${names}`)
        }
        const required = relevant.find((entry) => entry.context === requiredContext)
        if (required && required.state === 'success' && pending.length === 0) return pr
        if (Date.now() - started > timeoutMs) {
          throw new Error(`Timeout esperando checks do PR #${number}.`)
        }
        if (log)
          log(`[pr#${number}] ${statuses.length} status, ${pending.length} pendente — aguardando…`)
        await new Promise((resolve) => setTimeout(resolve, pollMs))
      }
    },

    /** Wait for checks then merge by rebase (the `gh pr merge --auto --rebase` equivalent). */
    autoMerge: async (number, options) => {
      const pr = await api.waitForChecks(number, options)
      if (pr && !pr.merged && pr.state === 'OPEN') {
        return api.mergePullRequest(number)
      }
      return null
    },
  }

  return api
}

/** Default instance bound to the environment. */
export const forgejoApi = createApi({})
