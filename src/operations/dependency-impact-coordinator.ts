export interface SystemDependency {
  from:string;
  to:string;
  critical:boolean;
}

export interface DependencyImpact {
  sourceComponent:string;
  directlyAffected:string[];
  transitivelyAffected:string[];
  isolateSource:boolean;
  preserveUnaffectedLanes:true;
  notifyAgents:string[];
}

export class DependencyImpactCoordinator {
  constructor(private readonly dependencies:SystemDependency[]) {}

  assess(sourceComponent:string):DependencyImpact {
    const direct=this.dependencies.filter(d=>d.from===sourceComponent).map(d=>d.to);
    const visited=new Set<string>([sourceComponent]);
    const queue=[...direct];
    const transitive=new Set<string>();

    while(queue.length) {
      const current=queue.shift()!;
      if(visited.has(current)) continue;
      visited.add(current);
      transitive.add(current);
      for(const next of this.dependencies.filter(d=>d.from===current).map(d=>d.to)) {
        if(!visited.has(next)) queue.push(next);
      }
    }

    return {
      sourceComponent,
      directlyAffected:[...new Set(direct)],
      transitivelyAffected:[...transitive],
      isolateSource:true,
      preserveUnaffectedLanes:true,
      notifyAgents:[
        "system-coordination-supervisor",
        "infrastructure-knowledge-agent",
        "recovery-agent-pool",
        ...transitive
      ].filter((v,i,a)=>a.indexOf(v)===i)
    };
  }
}
