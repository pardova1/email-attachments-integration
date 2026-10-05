import { CodeIssue,CodeIssueKind,CodeMaintenanceSupervisor } from "./code-maintenance-agents.js";

export type CiStage="build"|"test"|"security"|"dependency"|"compatibility";

export interface CiFailure {
 runId:string;
 stage:CiStage;
 componentIds:string[];
 summary:string;
 evidence:string[];
}

const kindByStage:Record<CiStage,CodeIssueKind>={
 build:"compile",
 test:"test",
 security:"security",
 dependency:"dependency",
 compatibility:"compatibility"
};

export class CiErrorIntakeCoordinator {
 constructor(private readonly supervisor=new CodeMaintenanceSupervisor()) {}

 intake(failure:CiFailure) {
  const issue:CodeIssue={
   id:`ci-${failure.runId}-${failure.stage}`,
   kind:kindByStage[failure.stage],
   componentIds:[...failure.componentIds],
   evidence:[failure.summary,...failure.evidence]
  };
  return {issue,maintenancePlan:this.supervisor.plan(issue)};
 }
}
