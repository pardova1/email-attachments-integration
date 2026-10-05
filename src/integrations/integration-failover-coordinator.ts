import { IntegrationAdapter,IntegrationCapability } from "./integration-capability-gateway.js";

export interface IntegrationFailoverRequest {
  capability:IntegrationCapability;
  failedAdapterId:string;
  transferId?:string;
  laneId?:string;
  candidates:IntegrationAdapter[];
}

export interface IntegrationFailoverDecision {
  action:"switch-adapter"|"escalate";
  selectedAdapterId?:string;
  preserveTransferIdentity:true;
  preservePrivateLane:true;
  preserveExpiration:true;
  requireVerifiedExact:true;
  notifyAgents:string[];
}

export class IntegrationFailoverCoordinator {
  decide(request:IntegrationFailoverRequest):IntegrationFailoverDecision {
    const selected=request.candidates
      .filter(a=>a.id!==request.failedAdapterId)
      .filter(a=>a.capability===request.capability)
      .filter(a=>a.authorized&&a.operating)
      .sort((a,b)=>b.priority-a.priority)[0];

    return {
      action:selected?"switch-adapter":"escalate",
      selectedAdapterId:selected?.id,
      preserveTransferIdentity:true,
      preservePrivateLane:true,
      preserveExpiration:true,
      requireVerifiedExact:true,
      notifyAgents:[
        "system-coordination-supervisor",
        "infrastructure-knowledge-agent",
        "code-maintenance-supervisor",
        ...(selected?[]:["recovery-agent-pool"])
      ]
    };
  }
}
