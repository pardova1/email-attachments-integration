import assert from "node:assert/strict";
import test from "node:test";
import { capacityDecision } from "../src/scaling/transfer-work-queue.js";
import { IdempotencyRegistry } from "../src/scaling/idempotency.js";

test("traffic spike requests scale-out instead of blocking transfers", () => {
  assert.equal(capacityDecision({ queueDepth: 1000, activeWorkers: 20, availableWorkers: 10, storageHealthy: true, databaseHealthy: true }), "scale-out");
});

test("dependency failure applies backpressure rather than accepting unsafe work", () => {
  assert.equal(capacityDecision({ queueDepth: 10, activeWorkers: 20, availableWorkers: 10, storageHealthy: false, databaseHealthy: true }), "throttle");
});

test("idempotency prevents accidental duplicate transaction identity", () => {
  const ids = new IdempotencyRegistry();
  ids.remember("email-send-1", "transfer-1");
  assert.equal(ids.lookup("email-send-1"), "transfer-1");
  assert.throws(() => ids.remember("email-send-1", "transfer-2"), /IDEMPOTENCY_KEY_CONFLICT/);
});
