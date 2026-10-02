import type { EmailIntegrationFamily } from "./email-integration-director.js";

export type CapabilityStatus = "discovered" | "testing" | "supported" | "restricted" | "retired";

export interface GlobalEmailCapability {
  id: string;
  method: string;
  family: EmailIntegrationFamily;
  regions: string[];
  platforms: string[];
  status: CapabilityStatus;
  requiresAuthorization: boolean;
  lastReviewedAt: string;
}

export class GlobalEmailCapabilityRegistry {
  private readonly capabilities = new Map<string, GlobalEmailCapability>();

  upsert(capability: GlobalEmailCapability) {
    this.capabilities.set(capability.id, {...capability});
  }

  supportedFor(region: string, platform: string) {
    return [...this.capabilities.values()].filter(c =>
      c.status === "supported" &&
      (c.regions.includes("*") || c.regions.includes(region)) &&
      (c.platforms.includes("*") || c.platforms.includes(platform))
    );
  }

  researchQueue() {
    return [...this.capabilities.values()].filter(c =>
      c.status === "discovered" || c.status === "testing" || c.status === "restricted"
    );
  }

  all() {
    return [...this.capabilities.values()];
  }
}
