import { describe, expect, test } from "bun:test";
import {
  DESIRED_RULE,
  REQUIRED_CHECK_CONTEXT,
  planBranchProtectionRule,
  ruleMatches,
} from "../../scripts/lib/github-branch-protection.mjs";

const compliant = () => ({
  required_status_checks: { strict: false, contexts: [REQUIRED_CHECK_CONTEXT] },
  enforce_admins: true,
  required_pull_request_reviews: null,
});

describe("github-branch-protection", () => {
  test("REQUIRED_CHECK_CONTEXT é o literal do check-run (nome do job `checks`)", () => {
    expect(REQUIRED_CHECK_CONTEXT).toBe("checks");
  });

  test("ruleMatches: regra conforme → true", () => {
    expect(ruleMatches(compliant())).toBe(true);
  });

  test("ruleMatches: sem regra → false", () => {
    expect(ruleMatches(null)).toBe(false);
  });

  test("ruleMatches: enforce_admins false → false", () => {
    expect(ruleMatches({ ...compliant(), enforce_admins: false })).toBe(false);
  });

  test("ruleMatches: context extra → false (drift)", () => {
    expect(
      ruleMatches({
        ...compliant(),
        required_status_checks: { strict: false, contexts: [REQUIRED_CHECK_CONTEXT, "outro"] },
      }),
    ).toBe(false);
  });

  test("ruleMatches: strict true → false", () => {
    expect(
      ruleMatches({
        ...compliant(),
        required_status_checks: { strict: true, contexts: [REQUIRED_CHECK_CONTEXT] },
      }),
    ).toBe(false);
  });

  test("plan: sem regra → create; conforme → noop; drift → update", () => {
    expect(planBranchProtectionRule(null)).toEqual({ action: "create" });
    expect(planBranchProtectionRule(compliant())).toEqual({ action: "noop" });
    expect(
      planBranchProtectionRule({ ...compliant(), required_status_checks: { strict: false, contexts: [] } }),
    ).toEqual({ action: "update" });
  });

  test("DESIRED_RULE usa apenas `checks` moderno (sem `contexts` legacy)", () => {
    expect(DESIRED_RULE.required_status_checks.checks).toEqual([
      { context: REQUIRED_CHECK_CONTEXT },
    ]);
    expect("contexts" in DESIRED_RULE.required_status_checks).toBe(false);
    expect(DESIRED_RULE.enforce_admins).toBe(true);
    expect(DESIRED_RULE.required_pull_request_reviews).toBeNull();
  });
});
