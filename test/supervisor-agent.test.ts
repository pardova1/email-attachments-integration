import assert from "node:assert/strict";
import test from "node:test";
import { OperationsSupervisorAgent } from "../src/operations/supervisor-agent.js";

test("supervisor delegates recovery behind the scenes without file mutation", () => {
  const decision = new OperationsSupervisorAgent().delegate({ transferId: "t1", kind: "recover" });
  assert.equal(decision.specialist, "recovery");
  assert.equal(decision.runBehindScenes, true);
  assert.equal(decision.fileMutationAllowed, false);
});

test("supervisor does not hide tasks requiring user authorization", () => {
  const decision = new OperationsSupervisorAgent().delegate({
    transferId: "t1", kind: "secure", requiresUserAuthorization: true
  });
  assert.equal(decision.runBehindScenes, false);
});
