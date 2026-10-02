export type TransferLifecycleArea =
  | "sender-attachment"
  | "email-integration"
  | "format-knowledge"
  | "chunking"
  | "lane-routing"
  | "encryption"
  | "storage"
  | "bandwidth"
  | "recovery"
  | "receiver-delivery"
  | "integrity-verification"
  | "confirmation";

export interface ImprovementFinding {
  findingId: string;
  area: TransferLifecycleArea;
  source: string;
  summary: string;
  expectedBenefit: string;
  status: "researching" | "candidate" | "validated" | "rejected";
}

export interface UpgradeCandidate {
  findingId: string;
  area: TransferLifecycleArea;
  requiresTesting: true;
  mayModifyUserFileBytes: false;
  mayBypassSecurity: false;
  mayDisruptActiveTransfers: false;
}

export class TransferResearchAgent {
  private readonly findings = new Map<string, ImprovementFinding>();

  record(finding: ImprovementFinding) {
    this.findings.set(finding.findingId, finding);
    return finding;
  }

  proposeUpgrade(findingId: string): UpgradeCandidate {
    const finding = this.findings.get(findingId);
    if (!finding) throw new Error("RESEARCH_FINDING_NOT_FOUND");
    if (finding.status !== "candidate" && finding.status !== "validated") {
      throw new Error("RESEARCH_NOT_READY_FOR_UPGRADE");
    }
    return {
      findingId,
      area: finding.area,
      requiresTesting: true,
      mayModifyUserFileBytes: false,
      mayBypassSecurity: false,
      mayDisruptActiveTransfers: false
    };
  }
}
