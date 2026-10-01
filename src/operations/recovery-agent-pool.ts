import { randomUUID } from "node:crypto";

export interface LabeledTransferIssue {
  issueId: string;
  transferId: string;
  laneId: string;
  label: string;
  detectedAt: Date;
}

export interface RecoveryAgentAssignment {
  agentId: string;
  issueId: string;
  transferId: string;
  laneId: string;
  assignedAt: Date;
  state: "analyzing" | "correcting" | "verifying" | "complete";
}

export interface RecoveryCapacityProvider {
  provision(requiredAgents: number): Promise<number>;
}

/**
 * Coordinates one isolated recovery assignment per affected transfer.
 * Production capacity is elastic: the provider is asked to provision enough
 * workers for all currently unassigned issues instead of serializing repairs
 * through one global repair worker.
 */
export class RecoveryAgentPool {
  private readonly assignments = new Map<string, RecoveryAgentAssignment>();

  constructor(private readonly capacity: RecoveryCapacityProvider) {}

  async assignImmediately(issues: LabeledTransferIssue[]) {
    const unassigned = issues.filter(issue => !this.assignments.has(issue.issueId));
    const available = await this.capacity.provision(unassigned.length);
    if (available < unassigned.length) throw new Error("RECOVERY_CAPACITY_SHORTFALL");

    return unassigned.map(issue => {
      const assignment: RecoveryAgentAssignment = {
        agentId: `RECOVERY-${randomUUID()}`,
        issueId: issue.issueId,
        transferId: issue.transferId,
        laneId: issue.laneId,
        assignedAt: new Date(),
        state: "analyzing"
      };
      this.assignments.set(issue.issueId, assignment);
      return assignment;
    });
  }

  assignment(issueId: string) {
    return this.assignments.get(issueId) ?? null;
  }
}
