import { resolutionNotice } from "./public-incident-notification.js";
import type { AffectedPartyRegistry } from "./affected-party-registry.js";

export interface IncidentNotificationPort {
  notify(userId: string, message: string): Promise<void>;
}

export class ResolutionNotificationService {
  constructor(
    private readonly incidents: AffectedPartyRegistry,
    private readonly notifications: IncidentNotificationPort
  ) {}

  async resolveAndNotify(incidentId: string) {
    const incident = this.incidents.resolve(incidentId);
    const deliveries = [];
    for (const party of incident.affected) {
      const notice = resolutionNotice(party.role);
      await this.notifications.notify(party.userId, notice.message);
      deliveries.push({ userId: party.userId, role: party.role, delivered: true });
    }
    return { incidentId, status: incident.status, resolvedAt: incident.resolvedAt, deliveries };
  }
}
