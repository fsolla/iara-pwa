import { describe, expect, test } from "bun:test";
import { createApi } from "../../scripts/lib/github-api.mjs";

const ok = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const apiWith = (handler: (url: string, init?: Record<string, unknown>) => Response) =>
  createApi({
    token: "t",
    repository: "fsolla/iara-pwa",
    retries: 0,
    fetchImpl: async (url: string | URL, init?: Record<string, unknown>) =>
      handler(String(url), init),
  });

describe("github-api", () => {
  test("getPullRequest normaliza o shape do PR", async () => {
    let seen = "";
    const api = apiWith((url) => {
      seen = url;
      return ok({
        number: 7,
        title: "t",
        body: "Closes #1",
        state: "open",
        draft: false,
        mergeable: true,
        merged_at: null,
        node_id: "PR_kwDO",
        head: { ref: "OPS1-x", sha: "abc" },
        base: { ref: "main" },
      });
    });

    const pr = await api.getPullRequest(7);

    expect(seen).toBe("https://api.github.com/repos/fsolla/iara-pwa/pulls/7");
    expect(pr).toEqual({
      number: 7,
      title: "t",
      body: "Closes #1",
      state: "OPEN",
      merged: false,
      draft: false,
      mergeable: true,
      nodeId: "PR_kwDO",
      head: { ref: "OPS1-x", sha: "abc" },
      base: { ref: "main" },
    });
  });

  test("getPullRequest: estado fechado (caixa baixa, como o GitHub envia) e merged_at", async () => {
    const api = apiWith(() =>
      ok({
        number: 8,
        title: "t",
        body: "",
        state: "closed",
        draft: false,
        merged_at: "2026-08-20T00:00:00Z",
        node_id: "PR_2",
        head: { ref: "b", sha: "s" },
        base: { ref: "main" },
      }),
    );

    const pr = await api.getPullRequest(8);

    expect(pr?.state).toBe("CLOSED");
    expect(pr?.merged).toBe(true);
  });

  test("getPullRequest 404 → null", async () => {
    const api = apiWith(() => ok({ message: "Not Found" }, 404));
    expect(await api.getPullRequest(999)).toBeNull();
  });

  test("createPullRequest POST /pulls e devolve nodeId (para auto-merge)", async () => {
    let body: Record<string, unknown> = {};
    const api = apiWith((_url, init) => {
      if (!init || init.method !== "POST") throw new Error("esperava POST");
      body = JSON.parse(String(init.body)) as Record<string, unknown>;
      return ok({ number: 7, title: "t", html_url: "https://github.com/x/7", node_id: "PR_1" });
    });

    const pr = await api.createPullRequest({ head: "OPS1-x", title: "t", body: "Closes #1" });

    expect(body).toEqual({ head: "OPS1-x", base: "main", title: "t", body: "Closes #1" });
    expect(pr).toEqual({ number: 7, title: "t", htmlUrl: "https://github.com/x/7", nodeId: "PR_1" });
  });

  test("getBranchProtection normaliza para drift completo (reviews count 0 → null, booleanos)", async () => {
    let seen = "";
    const api = apiWith((url) => {
      seen = url;
      return ok({
        required_status_checks: { strict: false, checks: [{ context: "checks" }] },
        enforce_admins: { enabled: true },
        required_pull_request_reviews: {
          required_approving_review_count: 0,
          dismiss_stale_reviews: false,
          require_code_owner_reviews: false,
        },
        restrictions: null,
        required_linear_history: false,
        allow_force_pushes: { enabled: false },
        allow_deletions: { enabled: true },
        block_creations: false,
      });
    });

    const rule = await api.getBranchProtection("main");

    expect(seen).toBe("https://api.github.com/repos/fsolla/iara-pwa/branches/main/protection");
    expect(rule).toEqual({
      required_status_checks: { strict: false, contexts: ["checks"] },
      enforce_admins: true,
      required_pull_request_reviews: null,
      restrictions: null,
      required_linear_history: false,
      allow_force_pushes: false,
      allow_deletions: true,
      block_creations: false,
    });

    const api404 = apiWith(() => ok({}, 404));
    expect(await api404.getBranchProtection("main")).toBeNull();
  });

  test("enableAutoMerge envia mutation GraphQL com mergeMethod REBASE", async () => {
    let payload: { query?: string; variables?: Record<string, unknown> } = {};
    const api = apiWith((url, init) => {
      if (!url.includes("graphql")) throw new Error(`esperava GraphQL, vi ${url}`);
      payload = JSON.parse(String(init?.body)) as { query?: string; variables?: Record<string, unknown> };
      return ok({ data: { enablePullRequestAutoMerge: { pullRequest: { number: 7 } } } });
    });

    await api.enableAutoMerge("PR_1");

    expect(payload?.query).toContain("enablePullRequestAutoMerge");
    expect(payload?.variables).toEqual({ id: "PR_1", mergeMethod: "REBASE" });
  });

  test("enableAutoMerge propaga erro do GraphQL (exit 1 no CLI)", async () => {
    const api = apiWith(() => ok({ errors: [{ message: "auto-merge disabled" }] }));
    await expect(api.enableAutoMerge("PR_1")).rejects.toThrow("auto-merge disabled");
  });
});

describe("github-api retry", () => {
  const retryApi = (handler: (url: string, init?: Record<string, unknown>) => Response | never) =>
    createApi({
      token: "t",
      repository: "fsolla/iara-pwa",
      retries: 2,
      backoffMs: 0,
      jitter: false,
      sleepImpl: async () => {},
      fetchImpl: async (url: string | URL, init?: Record<string, unknown>) =>
        handler(String(url), init),
    });

  test("GET 5xx (503) retrya até sucesso", async () => {
    let calls = 0;
    const api = retryApi(() => {
      calls += 1;
      if (calls === 1) return ok({ message: "Service Unavailable" }, 503);
      return ok({
        number: 7,
        title: "t",
        body: "",
        state: "open",
        draft: false,
        merged_at: null,
        node_id: "PR_1",
        head: { ref: "b", sha: "s" },
        base: { ref: "main" },
      });
    });

    const pr = await api.getPullRequest(7);

    expect(calls).toBe(2);
    expect(pr?.number).toBe(7);
  });

  test("escrita com 5xx não retrya (fail-closed — servidor respondeu)", async () => {
    let calls = 0;
    const api = retryApi(() => {
      calls += 1;
      return ok({ message: "boom" }, 503);
    });

    await expect(api.createPullRequest({ head: "x", title: "t", body: "b" })).rejects.toThrow();
    expect(calls).toBe(1);
  });

  test("rejeição de rede retrya em qualquer método (não chegou ao servidor)", async () => {
    let calls = 0;
    const api = retryApi(() => {
      calls += 1;
      throw new Error("ECONNRESET");
    });

    await expect(api.getPullRequest(1)).rejects.toThrow("ECONNRESET");
    expect(calls).toBe(3);
  });
});
