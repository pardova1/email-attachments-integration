import type { IntegrityViolation } from "../integrity/violation-registry.js";

export type StaffRole = "administrator" | "support-staff" | "operations-staff";

export interface StaffIncidentView {
  audience: "staff-only";
  violation: IntegrityViolation;
}

export function staffIncidentView(role: StaffRole, violation: IntegrityViolation): StaffIncidentView {
  if (!role) throw new Error("STAFF_AUTHORIZATION_REQUIRED");
  return { audience: "staff-only", violation };
}

// Public sender/receiver APIs must never serialize this view.
