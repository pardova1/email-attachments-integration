export interface RolloutObservation {
  version:string;
  compilePassed:boolean;
  testsPassed:boolean;
  securityPassed:boolean;
  dependenciesOperating:boolean;
  privateLaneIsolationPassed:boolean;
  fourHourExpirationPassed:boolean;
  verifiedExactPassed:boolean;
  recoveryChainPassed:boolean;
}

export interface RolloutDecision {
  action:"continue"|"rollback";
  targetVersion:string;
  reasons:string[];
  notifyAgents:string[];
  preserveUnaffectedLanes:true;
}

export class RolloutGuard {
  evaluate(candidate:RolloutObservation,lastKnownGoodVersion:string):RolloutDecision {
    const checks:Record<string,boolean>={
      compile:candidate.compilePassed,
      tests:candidate.testsPassed,
      security:candidate.securityPassed,
      dependencies:candidate.dependenciesOperating,
      "private-lane-isolation":candidate.privateLaneIsolationPassed,
      "four-hour-expiration":candidate.fourHourExpirationPassed,
      "verified-exact":candidate.verifiedExactPassed,
      "recovery-chain":candidate.recoveryChainPassed
    };
    const reasons=Object.entries(checks).filter(([,ok])=>!ok).map(([name])=>name);
    const rollback=reasons.length>0;
    return {
      action:rollback?"rollback":"continue",
      targetVersion:rollback?lastKnownGoodVersion:candidate.version,
      reasons,
      notifyAgents:[
        "code-maintenance-supervisor",
        "system-coordination-supervisor",
        "infrastructure-knowledge-agent",
        ...(rollback?["recovery-agent-pool"]:[])
      ],
      preserveUnaffectedLanes:true
    };
  }
}
