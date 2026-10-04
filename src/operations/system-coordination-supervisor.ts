export type ComponentState="operating"|"degraded"|"unavailable"|"updating";
export type DependencyState="operating"|"degraded"|"broken";

export interface ComponentObservation {
  componentId:string;
  state:ComponentState;
  version?:string;
}

export interface DependencyObservation {
  from:string;
  to:string;
  state:DependencyState;
}

export interface CoordinationAssessment {
  overall:"operating"|"degraded"|"incident";
  affectedComponents:string[];
  brokenDependencies:string[];
  preserveUnaffectedLanes:true;
  requiresRecovery:boolean;
  reason:string;
}

export class SystemCoordinationSupervisor {
  assess(components:ComponentObservation[],dependencies:DependencyObservation[]):CoordinationAssessment {
    const affected=components.filter(c=>c.state!=="operating").map(c=>c.componentId);
    const broken=dependencies.filter(d=>d.state!=="operating").map(d=>`${d.from}->${d.to}`);
    const unavailable=components.some(c=>c.state==="unavailable");
    const brokenLink=dependencies.some(d=>d.state==="broken");
    const degraded=affected.length>0||broken.length>0;

    return {
      overall: unavailable||brokenLink ? "incident" : degraded ? "degraded" : "operating",
      affectedComponents:affected,
      brokenDependencies:broken,
      preserveUnaffectedLanes:true,
      requiresRecovery:degraded,
      reason: degraded
        ? "One or more components or hand-in-hand dependencies require coordinated recovery."
        : "Components and observed dependencies are operating together."
    };
  }
}
