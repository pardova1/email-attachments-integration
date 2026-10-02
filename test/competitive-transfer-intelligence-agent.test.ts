import assert from "node:assert/strict";
import test from "node:test";
import { CompetitiveTransferIntelligenceAgent } from "../src/research/competitive-transfer-intelligence-agent.js";

test("original-byte preservation alone is not considered unique", () => {
  const result = new CompetitiveTransferIntelligenceAgent().assess([{
    product:"example", observedAt:new Date().toISOString(), patterns:["share-link"],
    requiresSeparateTransferSurface:true, recipientUsesDownloadLink:true,
    preservesOriginalBytes:true, notes:[]
  }]);
  assert.equal(result.exactIntegrityAloneDistinct,false);
  assert.equal(result.emailNativeAttachmentBridgeDistinct,true);
});
