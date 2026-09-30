export type IncidentSeverity = "warning" | "significant" | "critical";

export interface IncidentReport {
  incidentId: string;
  occurredAt: Date;
  severity: IncidentSeverity;
  component: string;
  summary: string;
  automaticRecoveryAttempted: boolean;
  resolved: boolean;
}

export interface MonthlyHealthReport {
  period: string;
  transfersAttempted: number;
  transfersVerifiedIdentical: number;
  recoveryEvents: number;
  significantIncidents: number;
  integrityFailuresDelivered: 0;
  status: "operating-normally" | "attention-required";
}

export function shouldReportImmediately(incident: IncidentReport) {
  return incident.severity === "significant" || incident.severity === "critical";
}

export function buildMonthlyHealthReport(input: Omit<MonthlyHealthReport, "status" | "integrityFailuresDelivered">): MonthlyHealthReport {
  return {
    ...input,
    integrityFailuresDelivered: 0,
    status: input.significantIncidents === 0 ? "operating-normally" : "attention-required"
  };
}
