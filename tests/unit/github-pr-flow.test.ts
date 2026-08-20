import { describe, expect, test } from "bun:test";
import { decideAutomergeAction } from "../../scripts/lib/github-pr-flow.mjs";

const pr = (overrides: Record<string, unknown> = {}) => ({
  number: 7,
  title: "t",
  body: "",
  state: "OPEN",
  merged: false,
  draft: false,
  mergeable: true,
  nodeId: "PR_1",
  head: { ref: "OPS1-x", sha: "abc" },
  base: { ref: "main" },
  ...overrides,
});

describe("github-pr-flow", () => {
  test("skip: PR inexistente", () => {
    expect(decideAutomergeAction(null)).toEqual({ action: "skip", reason: "pr-inexistente" });
  });

  test("skip: já mergeada", () => {
    expect(decideAutomergeAction(pr({ merged: true }))).toEqual({
      action: "skip",
      reason: "ja-mergeada",
    });
  });

  test("skip: PR fechada", () => {
    expect(decideAutomergeAction(pr({ state: "CLOSED" }))).toEqual({
      action: "skip",
      reason: "pr-nao-aberta",
    });
  });

  test("skip: base não é main", () => {
    expect(decideAutomergeAction(pr({ base: { ref: "release" } }))).toEqual({
      action: "skip",
      reason: "base-nao-main",
    });
  });

  test("skip: draft é veto do ator (qualquer branch)", () => {
    expect(decideAutomergeAction(pr({ draft: true }))).toEqual({
      action: "skip",
      reason: "draft-veto",
    });
  });

  test("enable-auto-merge: PR open, não-draft, base main", () => {
    expect(decideAutomergeAction(pr())).toEqual({ action: "enable-auto-merge", reason: "ready" });
  });
});
