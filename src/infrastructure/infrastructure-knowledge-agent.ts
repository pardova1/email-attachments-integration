export type InfrastructureDomain =
  | "digital-storage"
  | "router"
  | "network"
  | "protocol"
  | "operating-system"
  | "runtime"
  | "database"
  | "queue"
  | "security"
  | "email-integration"
  | "observability";

export type KnowledgeStatus="current"|"review-required"|"upgrade-candidate"|"incompatible"|"unavailable";

export interface InfrastructureKnowledgeRecord {
  id:string;
  domain:InfrastructureDomain;
  technology:string;
  version?:string;
  status:KnowledgeStatus;
  lastReviewedAt:string;
  notes?:string;
}

export interface InfrastructureIssue {
  issueId:string;
  domain:InfrastructureDomain;
  affectedComponentIds:string[];
  severity:"information"|"degraded"|"critical";
  description:string;
  recommendedAction:string;
  requiresUpgradeValidation:boolean;
}

export interface AgentReport {
  issue:InfrastructureIssue;
  recipients:string[];
  preservePrivateLanes:true;
  preserveVerifiedExact:true;
}

export class InfrastructureKnowledgeAgent {
  private readonly knowledge=new Map<string,InfrastructureKnowledgeRecord>();

  upsert(record:InfrastructureKnowledgeRecord) {
    this.knowledge.set(record.id,structuredClone(record));
  }

  all() {
    return [...this.knowledge.values()].map(v=>structuredClone(v));
  }

  reviewQueue() {
    return this.all().filter(v=>v.status!=="current");
  }

  report(issue:InfrastructureIssue):AgentReport {
    const specialists=new Set<string>(["system-coordination-supervisor"]);
    for(const component of issue.affectedComponentIds) specialists.add(component);
    if(issue.domain==="digital-storage") specialists.add("storage-director-agent");
    if(issue.domain==="router"||issue.domain==="network"||issue.domain==="protocol") {
      specialists.add("network-protocol-intelligence-agent");
      specialists.add("transfer-routing-agent");
    }
    if(issue.requiresUpgradeValidation) {
      specialists.add("transfer-research-improvement-agent");
      specialists.add("safe-upgrade-pipeline");
    }
    if(issue.domain==="security") specialists.add("security-operations");
    return {
      issue:structuredClone(issue),
      recipients:[...specialists],
      preservePrivateLanes:true,
      preserveVerifiedExact:true
    };
  }
}
