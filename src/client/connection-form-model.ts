import {completeConnectionChoiceIds} from "../email/connection-choice-paths.js";
import type {ConnectionCheckClient,ConnectionClientResult,ConnectionCheckInput,ConnectionSelectionInput} from "./connection-check-client.js";
import {selectConnectionLanguage,CONNECTION_TRANSLATIONS,validateConnectionFormTranslations,type ConnectionTranslation} from "../email/connection-languages.js";
type Field=keyof ConnectionSelectionInput["selections"];
const fields:Field[]=["country","network","provider","client","platform","softwareVersion"];
export interface ConnectionFormRetryPolicy {maxAttempts:number;delayMs:number;}
export interface ConnectionFormState {
 phase:"idle"|"checking"|"choosing"|"submitting"|"assessed"|"unavailable";
 language:string;
 result?:ConnectionClientResult;
 selections:ConnectionSelectionInput["selections"];
 expired:boolean;
 canSubmit:boolean;
}
export class ConnectionFormModel {
 private phase:ConnectionFormState["phase"]="idle";
 private language:string;
 private result?:ConnectionClientResult;
 private selections:ConnectionSelectionInput["selections"]={};
 private readonly choiceCache=new Map<Field,Set<string>>();
 private generation=0;
 private controller?:AbortController;
 private disposed=false;
 private readinessWithdrawalReason?:string;
 private readonly listeners=new Set<(state:ConnectionFormState)=>void>();
 private readonly retry:ConnectionFormRetryPolicy;
 private readonly translations:Record<string,ConnectionTranslation>;
 constructor(private readonly client:Pick<ConnectionCheckClient,"check"|"submit">,language="en",private readonly clock=()=>new Date(),translations:Record<string,ConnectionTranslation>=CONNECTION_TRANSLATIONS,retry:ConnectionFormRetryPolicy={maxAttempts:2,delayMs:250}) {
  if(!retry||!Number.isInteger(retry.maxAttempts)||retry.maxAttempts<1||retry.maxAttempts>3||!Number.isInteger(retry.delayMs)||retry.delayMs<0||retry.delayMs>1000)throw new Error("INVALID_CONNECTION_FORM_RETRY_POLICY");
  this.retry={...retry};
  this.translations=structuredClone(translations);validateConnectionFormTranslations(this.translations);this.language=selectConnectionLanguage(language,this.translations);
 }
 state():ConnectionFormState {
  const form=this.result?.status==="customer-input-required"?this.result.form:undefined,now=this.clock().getTime();
  const expired=!!form&&(!Number.isFinite(now)||Date.parse(form.expiresAt)<=now||!Number.isFinite(Date.parse(form.expiresAt)));
  const complete=!!form&&form.fields.every(field=>field.options.some(option=>option.id===this.selections[field.key]&&this.choiceAvailable(field.key,option.id)));
  const result=structuredClone(this.result);
  if(result?.status==="assessed"&&result.validation.assessment.status==="verified"){
   const assessment=result.validation.assessment,deadline=Date.parse(assessment.expiresAt??"");
   if(this.readinessWithdrawalReason||!Number.isFinite(now)||!Number.isFinite(deadline)||deadline<=now){
    this.readinessWithdrawalReason??="EVIDENCE_EXPIRED";
    assessment.status="unverified";assessment.requiredChecks=["application-installation","dns-tls","email-delivery","attachment-integration","upload","recipient-download","file-integrity"];
    assessment.reasons=[this.readinessWithdrawalReason];result.retryRequired=true;
   }
  }
  return structuredClone({phase:this.phase,language:this.language,result,selections:this.selections,expired,canSubmit:this.phase==="choosing"&&!expired&&complete});
 }
 subscribe(listener:(state:ConnectionFormState)=>void){this.active();this.listeners.add(listener);listener(this.state());return ()=>this.listeners.delete(listener);}
 setLanguage(language:string){this.active();this.language=selectConnectionLanguage(language,this.translations);this.emit();}
 choose(field:Field,id:string){
  this.active();if(this.phase!=="choosing"||this.state().expired||this.result?.status!=="customer-input-required")throw new Error("CONNECTION_FORM_NOT_READY");
  const offered=this.result.form.fields.find(item=>item.key===field),option=offered?.options.find(item=>item.id===id);
  if(id!==""&&(!option||!this.choiceAvailable(field,id)))throw new Error("INVALID_CONNECTION_CHOICE");
  if(!offered)throw new Error("INVALID_CONNECTION_CHOICE");
  if(id)this.selections[field]=id;else delete this.selections[field];
  this.choiceCache.clear();
  for(const key of fields){
   const options=this.result.form.fields.find(item=>item.key===key)?.options;
   if(this.selections[key]&&!options?.some(item=>item.id===this.selections[key]&&this.choiceAvailable(key,item.id))){delete this.selections[key];this.choiceCache.clear();}
  }
  this.emit();
 }
 choiceAvailable(field:Field,id:string){
  if(this.result?.status!=="customer-input-required")return false;
  const offered=this.result.form.fields,option=offered.find(item=>item.key===field)?.options.find(item=>item.id===id);
  if(!option||!this.available(option.requires))return false;
  if(!this.choiceCache.has(field)){
   const fixed:ConnectionSelectionInput["selections"]={};
   for(const item of offered){if(item.key===field)break;if(this.selections[item.key])fixed[item.key]=this.selections[item.key];}
   const paths=completeConnectionChoiceIds(offered.map(item=>item.key),new Map(offered.map(item=>[item.key,item.options])),fixed);
   this.choiceCache.set(field,paths?.get(field)??new Set());
  }
  return this.choiceCache.get(field)!.has(id);
 }
 optionAvailable(requires?:Partial<Record<Field,string>>){return this.available(requires);}
 async check(software?:ConnectionCheckInput["software"]){
  this.active();const token=this.begin("checking");this.result=undefined;this.selections={};this.emit();
  const input=structuredClone({language:this.language,...(software?{software}:{})});
  try{const result=await this.retryInternal(token,signal=>this.client.check(structuredClone(input),signal));this.finish(token,result);}
  catch{if(this.current(token)){this.phase="unavailable";this.emit();}}
 }
 async submit(software?:ConnectionCheckInput["software"]){
  this.active();if(!this.state().canSubmit||this.result?.status!=="customer-input-required")throw new Error("CONNECTION_FORM_NOT_READY");
  const formId=this.result.form.id,expiresAt=Date.parse(this.result.form.expiresAt),selections=structuredClone(this.selections),token=this.begin("submitting");this.emit();
  const input=structuredClone({formId,selections,language:this.language,...(software?{software}:{})});
  try{const result=await this.retryInternal(token,signal=>this.client.submit(structuredClone(input),signal),()=>{const now=this.clock().getTime();return Number.isFinite(now)&&now<expiresAt;});this.finish(token,result);}
  catch{if(this.current(token)){this.phase="unavailable";this.emit();}}
 }
 invalidateConnection(){
  this.active();this.generation++;this.controller?.abort();this.readinessWithdrawalReason="CONNECTION_CHANGED";this.selections={};
  if(this.result?.status==="assessed")this.phase="assessed";
  else {this.result=undefined;this.phase="unavailable";}
  this.emit();
 }
 resetAuthentication(){
  this.active();this.generation++;this.controller?.abort();this.result=undefined;this.selections={};this.readinessWithdrawalReason=undefined;this.phase="unavailable";this.emit();
 }
 refresh(){this.active();this.emit();}
 dispose(){if(this.disposed)return;this.disposed=true;this.generation++;this.controller?.abort();this.listeners.clear();}
 private async retryInternal(token:number,operation:(signal:AbortSignal)=>Promise<ConnectionClientResult>,valid=()=>true){
  const signal=this.controller!.signal;
  for(let attempt=1;attempt<=this.retry.maxAttempts;attempt++){
   signal.throwIfAborted();
   if(!this.current(token))throw new Error("CONNECTION_OPERATION_SUPERSEDED");
   const result=await operation(signal);
   signal.throwIfAborted();
   if(result.status!=="pending-internal-retry"||attempt===this.retry.maxAttempts||!this.current(token)||!valid())return result;
   await this.retryDelay(signal);
   if(!this.current(token)||!valid())return result;
  }
  throw new Error("CONNECTION_RETRY_EXHAUSTED");
 }
 private async retryDelay(signal:AbortSignal){
  signal.throwIfAborted();
  await new Promise<void>((resolve,reject)=>{
   const aborted=()=>{clearTimeout(timer);signal.removeEventListener("abort",aborted);reject(signal.reason);};
   const timer=setTimeout(()=>{signal.removeEventListener("abort",aborted);resolve();},this.retry.delayMs);
   signal.addEventListener("abort",aborted,{once:true});
  });
  signal.throwIfAborted();
 }
 private available(requires?:Partial<Record<Field,string>>){
  const result=this.result;
  if(result?.status!=="customer-input-required")return false;
  return Object.entries(requires??{}).every(([key,value])=>result.form.fields.find(field=>field.key===key)?.options.find(option=>option.id===this.selections[key as Field])?.value===value);
 }
 private begin(phase:ConnectionFormState["phase"]){this.choiceCache.clear();this.controller?.abort();this.controller=new AbortController();this.phase=phase;return ++this.generation;}
 private current(token:number){return !this.disposed&&this.generation===token;}
 private finish(token:number,result:ConnectionClientResult){if(!this.current(token))return;this.result=structuredClone(result);this.choiceCache.clear();this.readinessWithdrawalReason=undefined;this.selections={};this.phase=result.status==="customer-input-required"?"choosing":result.status==="assessed"?"assessed":"unavailable";this.emit();}
 private active(){if(this.disposed)throw new Error("CONNECTION_FORM_DISPOSED");}
 private emit(){for(const listener of this.listeners)listener(this.state());}
}
