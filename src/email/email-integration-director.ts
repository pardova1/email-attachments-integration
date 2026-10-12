import {GlobalConnectionReadinessAgent,type ConnectionEnvironment} from "./global-connection-readiness-agent.js";

export type EmailIntegrationFamily =
  | "smtp-submission"
  | "jmap-submission"
  | "provider-api"
  | "desktop-client-extension"
  | "browser-compose-extension"
  | "mobile-share-compose-integration"
  | "enterprise-mail-gateway"
  | "future-standard";

export interface EmailIntegrationCord {
  id: string;
  family: EmailIntegrationFamily;
  providerOrStandard: string;
  available: boolean;
  authorized: boolean;
  supportsComposeAttachmentHook: boolean;
  priority: number;
  // Explicit routing coverage only; live readiness still requires probes.
  compatibleEnvironments?: ConnectionEnvironment[];
}

export type EmailEnvironment = ConnectionEnvironment;

export class EmailIntegrationDirector {
  private readonly cords=new Map<string,EmailIntegrationCord>();
  private readonly normalizer=new GlobalConnectionReadinessAgent();

  constructor(cords:EmailIntegrationCord[]) {
    for(const cord of cords)this.registerCord(cord);
  }

  private normalize(environment:ConnectionEnvironment) {
    const value=this.normalizer.assess(environment).environment;
    if(Object.values(value).some(field=>field.includes("*")))throw new Error("CONNECTION_ENVIRONMENT_REQUIRED");
    return value;
  }

  private key(environment:ConnectionEnvironment) {
    const value=this.normalize(environment);
    return JSON.stringify([value.country,value.network,value.provider,value.client,value.platform,value.softwareVersion]);
  }

  select(environment:EmailEnvironment):EmailIntegrationCord {
    const key=this.key(environment);
    const eligible=[...this.cords.values()]
      .filter(c=>c.available&&c.authorized)
      .filter(c=>c.compatibleEnvironments?.some(known=>this.key(known)===key))
      .sort((a,b)=>Number(b.supportsComposeAttachmentHook)-Number(a.supportsComposeAttachmentHook)||b.priority-a.priority);
    if(!eligible.length)throw new Error("NO_AUTHORIZED_EMAIL_INTEGRATION_CORD");
    return structuredClone(eligible[0]);
  }

  registerCord(cord:EmailIntegrationCord) {
    if(!cord||typeof cord.id!=="string"||!cord.id.trim()||cord.id!==cord.id.trim()||cord.id.length>256||/[\x00-\x1f\x7f]/.test(cord.id)||typeof cord.available!=="boolean"||typeof cord.authorized!=="boolean"||typeof cord.supportsComposeAttachmentHook!=="boolean"||!Number.isFinite(cord.priority))throw new Error("INVALID_EMAIL_INTEGRATION_CORD");
    if(this.cords.has(cord.id))throw new Error("EMAIL_INTEGRATION_CORD_EXISTS");
    if(cord.compatibleEnvironments!==undefined&&!Array.isArray(cord.compatibleEnvironments))throw new Error("INVALID_EMAIL_INTEGRATION_CORD");
    const snapshot=structuredClone(cord);
    if(snapshot.compatibleEnvironments)snapshot.compatibleEnvironments=snapshot.compatibleEnvironments.map(environment=>this.normalize(environment));
    this.cords.set(snapshot.id,snapshot);
  }

  unregisterCord(id:string) {
    return this.cords.delete(id);
  }

  coverage() {
    return [...this.cords.values()].map(cord=>structuredClone(cord));
  }
}
