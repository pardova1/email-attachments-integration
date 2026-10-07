import assert from "node:assert/strict";
import test from "node:test";
import { PrePostChangeEvaluationGuard, type ChangeLifecyclePort } from "../src/operations/pre-post-change-evaluation-guard.js";

const good = () => ({ compatible: true, integrityVerified: true, issues: [] });

test("requires evaluation before execution and evaluation after execution", async () => {
  const order: string[] = [];
  const port: ChangeLifecyclePort = {
    async evaluateBefore() { order.push("before"); return good(); },
    async execute() { order.push("execute"); },
    async evaluateAfter() { order.push("after"); return good(); }
  };
  const result = await new PrePostChangeEvaluationGuard().run(port);
  assert.deepEqual(order, ["before", "execute", "after"]);
  assert.equal(result.status, "approved");
  assert.equal(result.stage, "complete");
});

test("blocks change when pre-change compatibility or integrity evaluation fails", async () => {
  let executed = false;
  const port: ChangeLifecyclePort = {
    async evaluateBefore() { return { compatible: false, integrityVerified: true, issues: ["PRE_CHANGE_INCOMPATIBLE"] }; },
    async execute() { executed = true; },
    async evaluateAfter() { return good(); }
  };
  const result = await new PrePostChangeEvaluationGuard().run(port);
  assert.equal(executed, false);
  assert.deepEqual(result, { status: "blocked", stage: "pre-change", issues: ["PRE_CHANGE_INCOMPATIBLE"] });
});

test("never approves when execution fails", async () => {
  let after = false;
  const port: ChangeLifecyclePort = {
    async evaluateBefore() { return good(); },
    async execute() { throw new Error("install failed"); },
    async evaluateAfter() { after = true; return good(); }
  };
  const result = await new PrePostChangeEvaluationGuard().run(port);
  assert.equal(after, false);
  assert.deepEqual(result, { status: "blocked", stage: "execution", issues: ["CHANGE_EXECUTION_FAILED"] });
});

test("blocks success when post-change compatibility or integrity verification fails", async () => {
  const port: ChangeLifecyclePort = {
    async evaluateBefore() { return good(); },
    async execute() {},
    async evaluateAfter() { return { compatible: true, integrityVerified: false, issues: ["POST_CHANGE_INTEGRITY_FAILED"] }; }
  };
  const result = await new PrePostChangeEvaluationGuard().run(port);
  assert.deepEqual(result, { status: "blocked", stage: "post-change", issues: ["POST_CHANGE_INTEGRITY_FAILED"] });
});
