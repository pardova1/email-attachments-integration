export type CodeIssueKind="compile"|"test"|"runtime"|"security"|"dependency"|"compatibility"|"performance"|"integrity";
export type MaintenanceAction="research"|"repair"|"upgrade"|"rollback"|"escalate";

export interface CodeIssue {
 id:string; kind:CodeIssueKind; componentIds:string[]; evidence:string[];
}

export interface MaintenancePlan {
 issueId:string;
 researchAgent:"code-research-agent";
 implementationAgent:"code-repair-agent"|"code-upgrade-agent";
 supervisor:"code-maintenance-supervisor";
 action:MaintenanceAction;
 requiredChecks:string[];
 automaticProductionMerge:false;
 preservePrivateLanes:true;
 preserveVerifiedExact:true;
}

export class CodeMaintenanceSupervisor {
 plan(issue:CodeIssue):MaintenancePlan {
  const upgrade=issue.kind==="dependency"||issue.kind==="compatibility";
  return {
   issueId:issue.id,
   researchAgent:"code-research-agent",
   implementationAgent:upgrade?"code-upgrade-agent":"code-repair-agent",
   supervisor:"code-maintenance-supervisor",
   action:upgrade?"upgrade":"repair",
   requiredChecks:[
    "compile","unit-tests","integration-tests","security-checks",
    "dependency-compatibility","private-lane-isolation",
    "verified-exact-regression","recovery-chain-verification"
   ],
   automaticProductionMerge:false,
   preservePrivateLanes:true,
   preserveVerifiedExact:true
  };
 }
}

export class CodeResearchAgent {
 research(issue:CodeIssue) {
  return {
   issueId:issue.id,
   tasks:[
    "reproduce-or-confirm-error",
    "trace-root-cause",
    "inspect-affected-dependencies",
    "check-current-supported-APIs-and-security-guidance",
    "identify-smallest-safe-change",
    "document-evidence-and-risk"
   ]
  };
 }
}

export class CodeRepairAgent {
 repairScope(issue:CodeIssue) {
  return {issueId:issue.id,principle:"smallest-safe-fix",mustAddOrUpdateTests:true};
 }
}

export class CodeUpgradeAgent {
 upgradeScope(issue:CodeIssue) {
  return {issueId:issue.id,principle:"supported-compatible-upgrade",mustUseSafeUpgradePipeline:true};
 }
}
