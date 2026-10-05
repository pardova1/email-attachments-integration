export type IntegrationOperatingState="operating"|"degraded"|"unavailable";

export interface IntegrationSignal {
 adapterId:string;
 sampledAt:string;
 successRate:number;
 latencyMs:number;
 consecutiveFailures:number;
 rateLimited:boolean;
 authenticated:boolean;
}

export interface IntegrationAssessment {
 adapterId:string;
 state:IntegrationOperatingState;
 reasons:string[];
 triggerFailover:boolean;
 notifyAgents:string[];
}

export class IntegrationOperatingMonitor {
 assess(signal:IntegrationSignal):IntegrationAssessment {
  const reasons:string[]=[];
  if(!signal.authenticated) reasons.push("authentication-failed");
  if(signal.consecutiveFailures>=3) reasons.push("repeated-failures");
  if(signal.successRate<0.90) reasons.push("low-success-rate");
  if(signal.rateLimited) reasons.push("rate-limited");
  if(signal.latencyMs>=5000) reasons.push("high-latency");

  const unavailable=!signal.authenticated||signal.consecutiveFailures>=5||signal.successRate<0.50;
  const state:IntegrationOperatingState=unavailable?"unavailable":reasons.length?"degraded":"operating";

  return {
   adapterId:signal.adapterId,
   state,
   reasons,
   triggerFailover:state==="unavailable",
   notifyAgents:state==="operating"?[]:[
    "system-coordination-supervisor",
    "infrastructure-knowledge-agent",
    "integration-failover-coordinator"
   ]
  };
 }
}
