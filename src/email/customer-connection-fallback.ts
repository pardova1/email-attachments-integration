import { randomUUID } from "node:crypto";
import type { ConnectionEnvironment } from "./global-connection-readiness-agent.js";

export const CONNECTION_FIELDS = ["country", "network", "provider", "client", "platform", "softwareVersion"] as const;
export type ConnectionField = typeof CONNECTION_FIELDS[number];
export interface ConnectionChoice { id: string; label: string; value: string; }
export interface ConnectionFallbackForm {
  id: string;
  message: string;
  expiresAt: string;
  fields: { key: ConnectionField; label: string; options: ConnectionChoice[] }[];
}
const labels: Record<ConnectionField,string> = { country:"Country",network:"Internet provider or network",provider:"Email provider",client:"Email app or browser",platform:"Device or operating system",softwareVersion:"Software version" };

// Choices come from an application-managed compatibility catalog, not arbitrary
// customer values. Selections are routing hints and still require connection tests.
export class CustomerConnectionFallback {
  private readonly choices: Partial<Record<ConnectionField,ConnectionChoice[]>>;
  private readonly forms = new Map<string,{form:ConnectionFallbackForm;known:Partial<ConnectionEnvironment>}>();
  constructor(choices:Partial<Record<ConnectionField,ConnectionChoice[]>>,private readonly clock=()=>new Date()) {
    for(const key of CONNECTION_FIELDS){
      const ids=new Set<string>();
      for(const option of choices[key]??[]){
        if(!option.id.trim()||!option.label.trim()||!option.value.trim()||ids.has(option.id)||key==="country"&&!/^[A-Z]{2}$/.test(option.value)) throw new Error("INVALID_CONNECTION_CHOICE_CATALOG");
        ids.add(option.id);
      }
    }
    this.choices=structuredClone(choices);
  }

  prepare(known:Partial<ConnectionEnvironment>,missing:ConnectionField[]):ConnectionFallbackForm|undefined {
    const keys=[...new Set(missing)];
    if(!keys.length||keys.some(key=>!CONNECTION_FIELDS.includes(key)||!this.choices[key]?.length))return undefined;
    const now=this.clock();
    if(!Number.isFinite(now.getTime()))throw new Error("INVALID_CONNECTION_FORM_TIME");
    for(const [id,pending] of this.forms)if(Date.parse(pending.form.expiresAt)<=now.getTime())this.forms.delete(id);
    // Do not evict a live customer's form to make room for another request.
    if(this.forms.size>=1000)throw new Error("CONNECTION_FORM_CAPACITY_REACHED");
    const form={id:randomUUID(),message:"We couldn't identify some connection details automatically. Please choose the missing details below so we can check your connection.",expiresAt:new Date(now.getTime()+15*60*1000).toISOString(),fields:keys.map(key=>({key,label:labels[key],options:structuredClone(this.choices[key]!)}))};
    this.forms.set(form.id,{form:structuredClone(form),known:structuredClone(known)});
    return form;
  }

  resolve(id:string,selections:Partial<Record<ConnectionField,string>>):ConnectionEnvironment {
    const pending=this.forms.get(id);
    const now=this.clock().getTime();
    if(!Number.isFinite(now))throw new Error("INVALID_CONNECTION_FORM_TIME");
    if(!pending||Date.parse(pending.form.expiresAt)<=now){
      this.forms.delete(id);throw new Error("CONNECTION_FORM_EXPIRED");
    }
    const required=pending.form.fields;
    if(Object.keys(selections).length!==required.length||Object.keys(selections).some(key=>!required.some(field=>field.key===key)))throw new Error("INVALID_CONNECTION_SELECTION");
    const environment={...pending.known};
    for(const field of required){
      const choice=field.options.find(option=>option.id===selections[field.key]);
      if(!choice)throw new Error("INVALID_CONNECTION_SELECTION");
      environment[field.key]=choice.value;
    }
    if(CONNECTION_FIELDS.some(key=>typeof environment[key]!=="string"||!environment[key]?.trim()))throw new Error("INCOMPLETE_CONNECTION_SELECTION");
    return environment as ConnectionEnvironment;
  }
}

const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));
export function renderConnectionFallback(form:ConnectionFallbackForm,submissionPath:string) {
  if(!/^\/[A-Za-z0-9/_-]*$/.test(submissionPath)||submissionPath.startsWith("//"))throw new Error("INVALID_CONNECTION_FORM_ACTION");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connection details</title></head><body><main><h1>Help us check your connection</h1><p>${escape(form.message)}</p><form method="post" action="${escape(submissionPath)}"><input type="hidden" name="formId" value="${escape(form.id)}">${form.fields.map(field=>`<p><label for="${escape(field.key)}">${escape(field.label)}</label><br><select id="${escape(field.key)}" name="${escape(field.key)}" required><option value="">Choose an option</option>${field.options.map(option=>`<option value="${escape(option.id)}">${escape(option.label)}</option>`).join("")}</select></p>`).join("")}<button type="submit">Check connection</button></form><p>Your choices help us find a connection. We will check it before sending.</p></main></body></html>`;
}
