import { BuiltInEmailSoftwareReferences } from "./built-in-email-software-references.js";
import type { ConnectionToolCatalog } from "./automatic-connection-coordinator.js";
import { GlobalConnectionReadinessAgent, REQUIRED_CONNECTION_CHECKS, type ConnectionCheck, type ConnectionEnvironment } from "./global-connection-readiness-agent.js";
import type { ConnectionProbeTool } from "./global-connection-validation-runner.js";

export interface SoftwareConnectionProfile {
  id: string;
  environment: ConnectionEnvironment;
  reviewedAt: string;
  expiresAt: string;
  sourceReference: string;
  tools: Partial<Record<ConnectionCheck, ConnectionProbeTool>>;
}
interface RegisteredProfile extends Omit<SoftwareConnectionProfile,"tools"> {
  tools: Partial<Record<ConnectionCheck, ConnectionProbeTool>>;
}

// Country alone never selects an adapter. Profiles bind exact observed software
// and network metadata to operator-supplied probes, not assumed compatibility.
export class ExactSoftwareConnectionCatalog implements ConnectionToolCatalog {
  private readonly profiles = new Map<string,RegisteredProfile>();
  readonly references = new BuiltInEmailSoftwareReferences();
  private readonly normalizer = new GlobalConnectionReadinessAgent();
  constructor(profiles:SoftwareConnectionProfile[],private readonly clock=()=>new Date()) {
    for(const profile of profiles)this.register(profile);
  }

  private normalized(environment:ConnectionEnvironment) {
    const value=this.normalizer.assess(environment,this.clock()).environment;
    if(Object.values(value).some(part=>part.includes("*")))throw new Error("EXACT_SOFTWARE_ENVIRONMENT_REQUIRED");
    return value;
  }
  private key(environment:ConnectionEnvironment) {
    return JSON.stringify(REQUIRED_ENVIRONMENT_FIELDS.map(field=>environment[field]));
  }
  register(input:SoftwareConnectionProfile) {
    const now=this.clock().getTime(),reviewed=Date.parse(input.reviewedAt),expires=Date.parse(input.expiresAt);
    if(!Number.isFinite(now)||!Number.isFinite(reviewed)||!Number.isFinite(expires)||reviewed>now||expires<=now||expires<=reviewed||expires-reviewed>24*60*60*1000||!input.id.trim()||!input.sourceReference.trim())throw new Error("INVALID_SOFTWARE_PROFILE");
    const environment=this.normalized(input.environment),key=this.key(environment);
    const previous=this.profiles.get(key);
    if(previous&&Date.parse(previous.reviewedAt)>reviewed)throw new Error("STALE_SOFTWARE_PROFILE");
    for(const [otherKey,profile] of this.profiles){
      if(otherKey!==key&&profile.id===input.id)throw new Error("DUPLICATE_SOFTWARE_PROFILE_ID");
    }
    const tools:RegisteredProfile["tools"]={};
    for(const [check,tool] of Object.entries(input.tools)){
      if(!REQUIRED_CONNECTION_CHECKS.includes(check as ConnectionCheck)||!tool||typeof tool.id!=="string"||!tool.id.trim()||typeof tool.run!=="function")throw new Error("INVALID_SOFTWARE_PROFILE_TOOL");
      tools[check as ConnectionCheck]={id:tool.id,run:tool.run.bind(tool)};
    }
    this.profiles.set(key,{id:input.id,environment:structuredClone(environment),reviewedAt:input.reviewedAt,expiresAt:input.expiresAt,sourceReference:input.sourceReference,tools});
  }

  lookup(environment:ConnectionEnvironment) {
    const normalized=this.normalized(environment),profile=this.profiles.get(this.key(normalized));
    if(!profile)return {status:"unknown" as const,environment:normalized,references:this.references.forEnvironment(normalized)};
    const now=this.clock().getTime();
    if(Date.parse(profile.expiresAt)<=now||Date.parse(profile.reviewedAt)>now)return {status:"expired" as const,environment:normalized};
    return {status:"matched" as const,environment:structuredClone(profile.environment),profileId:profile.id,sourceReference:profile.sourceReference,expiresAt:profile.expiresAt};
  }

  async toolsFor(environment:ConnectionEnvironment,signal:AbortSignal) {
    signal.throwIfAborted();
    const match=this.lookup(environment),tools:RegisteredProfile["tools"]={};
    if(match.status!=="matched")return tools;
    const profile=this.profiles.get(this.key(match.environment))!;
    for(const check of REQUIRED_CONNECTION_CHECKS){
      const tool=profile.tools[check];
      if(!tool)continue;
      tools[check]={id:`${profile.id}:${tool.id}`,run:async(actual,probeSignal)=>{
        probeSignal.throwIfAborted();
        const now=this.clock().getTime();
        if(!Number.isFinite(now)||Date.parse(profile.expiresAt)<=now||Date.parse(profile.reviewedAt)>now||this.profiles.get(this.key(profile.environment))!==profile)throw new Error("SOFTWARE_PROFILE_EXPIRED_OR_REPLACED");
        if(this.key(this.normalized(actual))!==this.key(profile.environment))throw new Error("SOFTWARE_PROFILE_ENVIRONMENT_MISMATCH");
        const result=await tool.run(structuredClone(profile.environment),probeSignal);
        probeSignal.throwIfAborted();
        const completed=this.clock().getTime();
        if(!Number.isFinite(completed)||Date.parse(profile.expiresAt)<=completed||Date.parse(profile.reviewedAt)>completed||this.profiles.get(this.key(profile.environment))!==profile)throw new Error("SOFTWARE_PROFILE_EXPIRED_OR_REPLACED");
        return result;
      }};
    }
    return tools;
  }
}
const REQUIRED_ENVIRONMENT_FIELDS=["country","network","provider","client","platform","softwareVersion"] as const;
