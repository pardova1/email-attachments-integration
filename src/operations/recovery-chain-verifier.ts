export type VerificationState="passed"|"failed"|"not-checked";

export interface RecoveryCheck {
  componentId:string;
  componentState:VerificationState;
  inboundDependencyState:VerificationState;
  outboundDependencyState:VerificationState;
}

export interface RecoveryVerificationResult {
  resolved:boolean;
  failedChecks:string[];
  mayResumeAffectedTransfers:boolean;
  preserveUnaffectedLanes:true;
  requireVerifiedExact:true;
}

export class RecoveryChainVerifier {
  verify(checks:RecoveryCheck[]):RecoveryVerificationResult {
    const failed:string[]=[];
    for(const check of checks) {
      if(check.componentState!=="passed") failed.push(`${check.componentId}:component`);
      if(check.inboundDependencyState!=="passed") failed.push(`${check.componentId}:inbound`);
      if(check.outboundDependencyState!=="passed") failed.push(`${check.componentId}:outbound`);
    }
    return {
      resolved:failed.length===0,
      failedChecks:failed,
      mayResumeAffectedTransfers:failed.length===0,
      preserveUnaffectedLanes:true,
      requireVerifiedExact:true
    };
  }
}
