import type { ConnectionEnvironment } from "./global-connection-readiness-agent.js";
import type { EmailIntegrationFamily } from "./email-integration-director.js";

export interface EmailSoftwareReference {
  id:string;
  name:string;
  providerIds:string[];
  family:EmailIntegrationFamily;
  documentation:string[];
  requirements:string[];
  reviewedOn:string;
}
// Documentation seeds discovery/research; it never supplies credentials, installs
// an adapter, establishes regional availability, or substitutes for live probes.
function references():EmailSoftwareReference[] {
 const reviewedOn="2026-10-10";
 return [
  {id:"gmail-api",name:"Gmail / Google Workspace",providerIds:["gmail","google-workspace"],family:"provider-api",documentation:["https://developers.google.com/workspace/gmail/api/guides/sending","https://developers.google.com/workspace/gmail/api/guides/uploads","https://support.google.com/mail/answer/6584"],requirements:["Authorized Gmail API adapter","Account-specific attachment limits","Separate large-file bridge transport"],reviewedOn},
  {id:"microsoft-graph-mail",name:"Outlook / Microsoft 365",providerIds:["outlook","microsoft-365"],family:"provider-api",documentation:["https://learn.microsoft.com/en-us/graph/outlook-large-attachments"],requirements:["Authorized Microsoft Graph mail adapter","Tenant and mailbox policies","Separate large-file bridge transport"],reviewedOn},
  {id:"apple-mail-drop",name:"Apple Mail / iCloud Mail",providerIds:["icloud","apple-mail"],family:"mobile-share-compose-integration",documentation:["https://support.apple.com/en-us/108329"],requirements:["Test the actual Apple Mail compose integration","Mail Drop has its own size and retention limits","Separate large-file bridge transport"],reviewedOn},
  {id:"yahoo-mail",name:"Yahoo Mail",providerIds:["yahoo"],family:"smtp-submission",documentation:["https://help.yahoo.com/kb/SLN4075.html"],requirements:["Authorized authenticated SMTP adapter","Verify account authentication and attachment policies"],reviewedOn},
  {id:"aol-mail",name:"AOL Mail",providerIds:["aol"],family:"smtp-submission",documentation:["https://help.aol.com/articles/how-do-i-use-other-email-applications-to-send-and-receive-my-aol-mail"],requirements:["Authorized authenticated mail adapter","Verify account authentication and attachment policies"],reviewedOn},
  {id:"proton-mail",name:"Proton Mail",providerIds:["proton"],family:"smtp-submission",documentation:["https://proton.me/support/smtp-submission","https://proton.me/support/imap-smtp-and-pop3-setup"],requirements:["Check paid-plan and custom-domain SMTP eligibility","Desktop Bridge is distinct from mobile integration","Recipient bridge download must not require Proton Bridge"],reviewedOn},
  {id:"fastmail-jmap",name:"Fastmail",providerIds:["fastmail"],family:"jmap-submission",documentation:["https://www.fastmail.com/dev/"],requirements:["Authorized JMAP adapter","Verify actual account and attachment policies"],reviewedOn},
  {id:"smtp-standard",name:"SMTP message submission",providerIds:[],family:"smtp-submission",documentation:["https://www.rfc-editor.org/rfc/rfc6409","https://www.rfc-editor.org/rfc/rfc8314"],requirements:["Discover and verify provider-specific submission configuration","Authentication and TLS","Never infer a provider from a country"],reviewedOn},
  {id:"android-share",name:"Android sharing integration",providerIds:[],family:"mobile-share-compose-integration",documentation:["https://developer.android.com/develop/ui/compose/sharing/send"],requirements:["Test installed app and MIME/URI handling","Sharing does not prove a normal attachment-button hook","Separate app installation check"],reviewedOn},
  {id:"ios-share",name:"iOS sharing integration",providerIds:[],family:"mobile-share-compose-integration",documentation:["https://developer.apple.com/documentation/uikit/uiactivityviewcontroller"],requirements:["Test installed app and share-sheet handling","Sharing does not prove a normal attachment-button hook","Separate app installation check"],reviewedOn}
 ];
}
export class BuiltInEmailSoftwareReferences {
 forCountry(country:string) {
  const normalized=country.trim().toUpperCase();
  if(!/^[A-Z]{2}$/.test(normalized))throw new Error("INVALID_REFERENCE_COUNTRY");
  return {country:normalized,status:"reference-only" as const,countryAvailability:"unverified" as const,entries:references()};
 }
 forEnvironment(environment:ConnectionEnvironment) {
  const catalog=this.forCountry(environment.country),provider=environment.provider.trim().toLowerCase();
  return {...catalog,entries:catalog.entries.filter(entry=>entry.providerIds.includes(provider)||entry.id==="smtp-standard"||environment.platform==="android"&&entry.id==="android-share"||environment.platform==="ios"&&entry.id==="ios-share")};
 }
}
