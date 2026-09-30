import assert from "node:assert/strict";
import test from "node:test";
import { RecipientAccessService } from "../src/services/recipient-access.js";

test("recipient token is scoped to one transfer", () => {
  const service = new RecipientAccessService("test-secret");
  const token = service.issue("transfer-a", new Date(Date.now() + 60_000));
  assert.equal(service.verify(token, "transfer-a").transferId, "transfer-a");
  assert.throws(() => service.verify(token, "transfer-b"), /TOKEN_TRANSFER_MISMATCH/);
});
