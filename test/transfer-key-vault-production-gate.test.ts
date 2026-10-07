import assert from "node:assert/strict";
import test from "node:test";
import { createTransferKeyVault } from "../src/config/transfer-key-vault-factory.js";

test("development uses isolated in-memory transfer key references", async () => {
  const vault = createTransferKeyVault({ NODE_ENV: "development" });
  const reference = await vault.createKey({ transferId: "t1", laneId: "l1" });
  assert.match(reference, /^dev-key-/);
  await vault.destroyKey(reference);
});

test("production fails closed until a managed transfer key vault is configured", () => {
  assert.throws(() => createTransferKeyVault({ NODE_ENV: "production" }), /TRANSFER_KEY_VAULT_NOT_CONFIGURED/);
});
