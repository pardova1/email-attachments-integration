import assert from "node:assert/strict";
import test from "node:test";
import { TransferResearchAgent } from "../src/research/transfer-research-agent.js";

test("research upgrades preserve permanent transfer safeguards", () => {
  const agent = new TransferResearchAgent();
  agent.record({
    findingId: "finding-1",
    area: "lane-routing",
    source: "validated technical research",
    summary: "Improved routing strategy",
    expectedBenefit: "faster completion",
    status: "candidate"
  });
  const upgrade = agent.proposeUpgrade("finding-1");
  assert.equal(upgrade.requiresTesting, true);
  assert.equal(upgrade.mayModifyUserFileBytes, false);
  assert.equal(upgrade.mayBypassSecurity, false);
  assert.equal(upgrade.mayDisruptActiveTransfers, false);
});
