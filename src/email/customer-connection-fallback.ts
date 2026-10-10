import { CONNECTION_TRANSLATIONS, selectConnectionLanguage, type ConnectionTranslation } from "./connection-languages.js";
import { randomUUID } from "node:crypto";
import type { ConnectionEnvironment } from "./global-connection-readiness-agent.js";

export const CONNECTION_FIELDS = ["country", "network", "provider", "client", "platform", "softwareVersion"] as const;
export type ConnectionField = typeof CONNECTION_FIELDS[number];
export interface ConnectionChoice { id: string; label: string; value: string; requires?: Partial<ConnectionEnvironment>; }
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
  private readonly forms = new Map<string,{form:ConnectionFallbackForm;known:Partial<ConnectionEnvironment>;customerScope:string}>();
  constructor(choices:Partial<Record<ConnectionField,ConnectionChoice[]>>,private readonly clock=()=>new Date()) {
    for(const key of CONNECTION_FIELDS){
      const ids=new Set<string>();
      for(const option of choices[key]??[]){
        if(!option.id.trim()||!option.label.trim()||!option.value.trim()||ids.has(option.id)||key==="country"&&!/^[A-Z]{2}$/.test(option.value)) throw new Error("INVALID_CONNECTION_CHOICE_CATALOG");
        for(const [dependency,value] of Object.entries(option.requires??{})) {
          // Dependencies only point to earlier fields, keeping dropdown updates acyclic.
          if(CONNECTION_FIELDS.indexOf(dependency as ConnectionField)<0||CONNECTION_FIELDS.indexOf(dependency as ConnectionField)>=CONNECTION_FIELDS.indexOf(key)||typeof value!=="string"||!value.trim())throw new Error("INVALID_CONNECTION_CHOICE_CATALOG");
        }
        ids.add(option.id);
      }
    }
    this.choices=structuredClone(choices);
  }

  prepare(customerScope:string,known:Partial<ConnectionEnvironment>,missing:ConnectionField[]):ConnectionFallbackForm|undefined {
    requireConnectionCustomerScope(customerScope);
    const keys=CONNECTION_FIELDS.filter(key=>missing.includes(key));
    if(missing.some(key=>!CONNECTION_FIELDS.includes(key)))return undefined;
    if(!keys.length||keys.some(key=>!CONNECTION_FIELDS.includes(key)||!this.choices[key]?.length))return undefined;
    const options=new Map(keys.map(key=>[key,(this.choices[key]??[]).flatMap(option=>{
      const remaining:Partial<ConnectionEnvironment>={};
      for(const [dependency,value] of Object.entries(option.requires??{})) {
        const field=dependency as ConnectionField;
        if(keys.includes(field))remaining[field]=value;
        else if(known[field]!==value)return [];
      }
      return [{...structuredClone(option),requires:remaining}];
    })]));
    if(keys.some(key=>!options.get(key)?.length))return undefined;
    const now=this.clock();
    if(!Number.isFinite(now.getTime()))throw new Error("INVALID_CONNECTION_FORM_TIME");
    for(const [id,pending] of this.forms)if(Date.parse(pending.form.expiresAt)<=now.getTime())this.forms.delete(id);
    // Do not evict a live customer's form to make room for another request.
    if(this.forms.size>=1000)throw new Error("CONNECTION_FORM_CAPACITY_REACHED");
    const form={id:randomUUID(),message:"We couldn't identify some connection details automatically. Please choose the missing details below so we can check your connection.",expiresAt:new Date(now.getTime()+15*60*1000).toISOString(),fields:keys.map(key=>({key,label:labels[key],options:structuredClone(options.get(key)!)}))};
    this.forms.set(form.id,{form:structuredClone(form),known:structuredClone(known),customerScope});
    return form;
  }

  resolve(customerScope:string,id:string,selections:Partial<Record<ConnectionField,string>>):ConnectionEnvironment {
    requireConnectionCustomerScope(customerScope);
    const pending=this.forms.get(id);
    if(!pending||pending.customerScope!==customerScope)throw new Error("CONNECTION_FORM_UNAVAILABLE");
    const now=this.clock().getTime();
    if(!Number.isFinite(now))throw new Error("INVALID_CONNECTION_FORM_TIME");
    if(Date.parse(pending.form.expiresAt)<=now){
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
    for(const field of required){
      const choice=field.options.find(option=>option.id===selections[field.key])!;
      if(Object.entries(choice.requires??{}).some(([key,value])=>environment[key as ConnectionField]!==value))throw new Error("INCOMPATIBLE_CONNECTION_SELECTION");
    }
    return environment as ConnectionEnvironment;
  }
}

// Scope comes from authenticated server context, never a submitted form field.
export function requireConnectionCustomerScope(value:unknown):asserts value is string {
  if(typeof value!=="string"||!value.trim()||value!==value.trim()||value.length>256||/[\x00-\x1f\x7f]/.test(value))throw new Error("CONNECTION_CUSTOMER_SCOPE_REQUIRED");
}

const escape=(value:string)=>value.replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!));
export function renderConnectionFallback(form:ConnectionFallbackForm,submissionPath:string,requestedLanguage="en",translations:Record<string,ConnectionTranslation>=CONNECTION_TRANSLATIONS) {
  if(!/^\/[A-Za-z0-9/_-]*$/.test(submissionPath)||submissionPath.startsWith("//"))throw new Error("INVALID_CONNECTION_FORM_ACTION");
  const language=selectConnectionLanguage(requestedLanguage,translations),text=translations[language];
  const countryNames=new Intl.DisplayNames([language],{type:"region"});
  return `<!doctype html><html lang="${escape(language)}" dir="${text.direction}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(text.title)}</title></head><body><main><label id="language-label" for="connection-language">${escape(text.languageLabel)}</label> <select id="connection-language" aria-labelledby="language-label">${Object.entries(translations).map(([tag,pack])=>`<option value="${escape(tag)}"${tag===language?" selected":""}>${escape(pack.language)}</option>`).join("")}</select><h1>${escape(text.title)}</h1><p id="connection-message">${escape(text.message)}</p><form method="post" action="${escape(submissionPath)}"><input type="hidden" name="formId" value="${escape(form.id)}"><input type="hidden" name="language" value="${escape(language)}">${form.fields.map(field=>`<p><label for="${escape(field.key)}">${escape(text.fields[field.key])}</label><br><select id="${escape(field.key)}" name="${escape(field.key)}" required><option value="">${escape(text.choose)}</option>${field.options.map(option=>`<option value="${escape(option.id)}" data-connection-value="${escape(option.value)}"${field.key==="country"?` data-country="${escape(option.value)}"`:""} data-requires="${escape(JSON.stringify(option.requires??{}))}">${escape(field.key==="country"?countryNames.of(option.value)??option.label:option.label)}</option>`).join("")}</select></p>`).join("")}<button type="submit">${escape(text.submit)}</button></form><p id="connection-note">${escape(text.note)}</p></main><div id="connection-translations" hidden data-packs="${escape(JSON.stringify(translations))}"></div><script type="module">
const form=document.querySelector("form");
function updateChoices(){
  const selected={};
  for(const select of form.querySelectorAll("select")){
    for(const option of select.options){
      const requirements=JSON.parse(option.dataset.requires||"{}");
      const available=Object.entries(requirements).every(([key,value])=>selected[key]===value);
      option.disabled=!available;option.hidden=!available;
      if(!available&&option.selected)select.value="";
    }
    selected[select.name]=select.selectedOptions[0]?.dataset.connectionValue;
  }
}
form.addEventListener("change",updateChoices);updateChoices();
const packs=JSON.parse(document.getElementById("connection-translations").dataset.packs);
document.getElementById("connection-language").addEventListener("change",event=>{
  const language=event.target.value,text=packs[language];
  if(!text)return;
  document.documentElement.lang=language;document.documentElement.dir=text.direction;
  document.title=text.title;document.querySelector("h1").textContent=text.title;
  document.getElementById("connection-message").textContent=text.message;
  document.getElementById("connection-note").textContent=text.note;
  document.getElementById("language-label").textContent=text.languageLabel;
  form.elements.language.value=language;form.querySelector("button").textContent=text.submit;
  const countryNames=new Intl.DisplayNames([language],{type:"region"});
  for(const select of form.querySelectorAll("select")){
    document.querySelector('label[for="'+select.id+'"]').textContent=text.fields[select.name];
    select.options[0].textContent=text.choose;
    for(const option of select.options)if(option.dataset.country)option.textContent=countryNames.of(option.dataset.country);
  }
});
</script></body></html>`;
}
