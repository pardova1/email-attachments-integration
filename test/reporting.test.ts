import assert from "node:assert/strict";
import test from "node:test";
import { buildMonthlyHealthReport, shouldReportImmediately } from "../src/operations/reporting.js";

test("significant incidents require immediate reporting", () => {
  assert.equal(shouldReportImmediately({
    incidentId: "i1", occurredAt: new Date(), severity: "significant", component: "transport",
    summary: "Repeated transport failure", automaticRecoveryAttempted: true, resolved: false
  }), true);
});

test("healthy month reports normal operation and never counts corrupted delivery", () => {
  const report = buildMonthlyHealthReport({
    period: "2026-09", transfersAttempted: 100, transfersVerifiedIdentical: 100,
    recoveryEvents: 2, significantIncidents: 0
  });
  assert.equal(report.status, "operating-normally");
  assert.equal(report.integrityFailuresDelivered, 0);
});
