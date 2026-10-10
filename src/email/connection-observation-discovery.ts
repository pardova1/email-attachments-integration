import { randomUUID } from "node:crypto";
import type { AutomaticConnectionDiscovery, ConnectionDiscoveryPort } from "./automatic-connection-coordinator.js";
import type { ConnectionEnvironment } from "./global-connection-readiness-agent.js";

export interface ConnectionObservation<T> {
  details:T;
  observedAt:string;
  sourceReference:string;
}
export interface ConnectionObservationSources {
  network(signal:AbortSignal):Promise<ConnectionObservation<Partial<Pick<ConnectionEnvironment,"country"|"network">>>>;
  provider(signal:AbortSignal):Promise<ConnectionObservation<Partial<Pick<ConnectionEnvironment,"provider">>>>;
  software(signal:AbortSignal):Promise<ConnectionObservation<Partial<Pick<ConnectionEnvironment,"client"|"platform"|"softwareVersion">>>>;
}
export interface CollectedConnectionDiscovery extends AutomaticConnectionDiscovery {
  fieldSources:Partial<Record<keyof ConnectionEnvironment,string>>;
}
const GROUPS={network:["country","network"],provider:["provider"],software:["client","platform","softwareVersion"]} as const;

// Sources are request-scoped adapters: trusted network lookup, authenticated
// email account metadata, and client-reported software. Reports are routing
// hints until probes verify them. Locale/language is never a country source.
export class ConnectionObservationDiscovery implements ConnectionDiscoveryPort {
  constructor(private readonly sources:ConnectionObservationSources,private readonly clock=()=>new Date(),private readonly sourceTimeoutMs=2_000) {
    if(Object.keys(GROUPS).some(group=>typeof sources[group as keyof ConnectionObservationSources]!=="function"))throw new Error("INVALID_DISCOVERY_SOURCES");
    this.sources={network:sources.network.bind(sources),provider:sources.provider.bind(sources),software:sources.software.bind(sources)};
    if(!Number.isInteger(sourceTimeoutMs)||sourceTimeoutMs<1||sourceTimeoutMs>5_000)throw new Error("INVALID_DISCOVERY_SOURCE_TIMEOUT");
  }
  async discover(signal:AbortSignal):Promise<CollectedConnectionDiscovery> {
    signal.throwIfAborted();
    const started=this.clock();
    if(!Number.isFinite(started.getTime()))throw new Error("INVALID_DISCOVERY_TIME");
    const groups=Object.keys(GROUPS) as (keyof typeof GROUPS)[];
    const observations=await Promise.all(groups.map(async group=>{
      try{return {group,observation:structuredClone(await this.read(group,signal))};}
      catch{signal.throwIfAborted();return undefined;}
    }));
    signal.throwIfAborted();
    const current=this.clock();
    if(!Number.isFinite(current.getTime())||current.getTime()<started.getTime())throw new Error("INVALID_DISCOVERY_TIME");
    const environment:Partial<ConnectionEnvironment>={},fieldSources:CollectedConnectionDiscovery["fieldSources"]={};
    let oldest=current.getTime();
    for(const result of observations){
      if(!result)continue;
      const {group,observation}=result;
      if(!observation||typeof observation.observedAt!=="string"||typeof observation.sourceReference!=="string"||!observation.sourceReference.trim()||!observation.details||typeof observation.details!=="object")continue;
      const observed=Date.parse(observation.observedAt);
      if(!Number.isFinite(observed)||observed>current.getTime()||current.getTime()-observed>5*60*1000)continue;
      let used=false;
      for(const field of GROUPS[group]){
        const value=(observation.details as Partial<ConnectionEnvironment>)[field];
        if(typeof value!=="string"||!value.trim()||value.length>256||/[\x00-\x1f\x7f*]/.test(value))continue;
        if(field==="country"&&!/^[A-Z]{2}$/i.test(value.trim()))continue;
        // A version without an identified app must not be paired with another source.
        if(field==="softwareVersion"&&!environment.client)continue;
        environment[field]=field==="country"?value.trim().toUpperCase():value.trim();
        fieldSources[field]=observation.sourceReference;
        used=true;
      }
      if(used)oldest=Math.min(oldest,observed);
    }
    return {environment,fieldSources,observedAt:new Date(oldest).toISOString(),sourceReference:`automatic-discovery:${randomUUID()}`};
  }

  private async read(group:keyof ConnectionObservationSources,external:AbortSignal) {
    const controller=new AbortController(),signal=AbortSignal.any([external,controller.signal]);
    signal.throwIfAborted();
    let aborted!:()=>void;
    const cancelled=new Promise<never>((_resolve,reject)=>{
      aborted=()=>reject(signal.reason);signal.addEventListener("abort",aborted,{once:true});
    });
    const timer=setTimeout(()=>controller.abort(new Error("DISCOVERY_SOURCE_TIMEOUT")),this.sourceTimeoutMs);
    try{return await Promise.race([this.sources[group](signal),cancelled]);}
    finally{clearTimeout(timer);signal.removeEventListener("abort",aborted);}
  }
}
