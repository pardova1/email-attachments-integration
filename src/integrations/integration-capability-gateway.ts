export type IntegrationCapability =
  | "email"
  | "storage"
  | "database"
  | "queue"
  | "repository"
  | "monitoring"
  | "payment"
  | "deployment";

export type IntegrationInterface="api"|"mcp"|"protocol"|"sdk";

export interface IntegrationAdapter {
  id:string;
  capability:IntegrationCapability;
  interfaceType:IntegrationInterface;
  authorized:boolean;
  operating:boolean;
  priority:number;
}

export interface CapabilityRequest {
  agentId:string;
  capability:IntegrationCapability;
  allowedAdapterIds:string[];
}

export class IntegrationCapabilityGateway {
  private readonly adapters=new Map<string,IntegrationAdapter>();

  register(adapter:IntegrationAdapter) {
    this.adapters.set(adapter.id,structuredClone(adapter));
  }

  resolve(request:CapabilityRequest) {
    const candidates=[...this.adapters.values()]
      .filter(a=>a.capability===request.capability)
      .filter(a=>a.authorized&&a.operating)
      .filter(a=>request.allowedAdapterIds.includes(a.id))
      .sort((a,b)=>b.priority-a.priority);

    const selected=candidates[0];
    if(!selected) throw new Error("NO_AUTHORIZED_OPERATING_INTEGRATION");
    return structuredClone(selected);
  }

  status() {
    return [...this.adapters.values()].map(a=>structuredClone(a));
  }
}
