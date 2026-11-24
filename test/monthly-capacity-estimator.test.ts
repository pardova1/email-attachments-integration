import assert from "node:assert/strict";
import test from "node:test";
import { estimateMonthlyCapacity } from "../src/scaling/monthly-capacity-estimator.js";

const input = {
  customers: 100000,
  transfersPerCustomer: 10,
  averageFileGB: 1,
  averageDownloads: 1,
  averageRetentionHours: 4,
  storageCostPerGBMonth: 0.02,
  egressCostPerGB: 0.01,
  fixedMonthlyCost: 100
};

test("estimates one million monthly transfers without assuming all bytes remain stored", () => {
  const result = estimateMonthlyCapacity(input);
  assert.equal(result.transfers, 1000000);
  assert.equal(result.downloadedGB, 1000000);
  assert.equal(result.averageStoredGB, 4000000 / 730);
  assert.equal(result.estimatedMonthlyCost, 100 + (4000000 / 730) * 0.02 + 10000);
});

test("rejects invalid cost assumptions", () => {
  assert.throws(() => estimateMonthlyCapacity({...input, egressCostPerGB: -1}), /INVALID_CAPACITY_INPUT/);
});
