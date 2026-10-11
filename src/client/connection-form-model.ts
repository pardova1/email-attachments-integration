import type {ConnectionCheckClient,ConnectionClientResult,ConnectionCheckInput,ConnectionSelectionInput} from "./connection-check-client.js";
import {selectConnectionLanguage,CONNECTION_TRANSLATIONS,validateConnectionFormTranslations,type ConnectionTranslation} from "../email/connection-languages.js";
type Field=keyof ConnectionSelectionInput["selections"];
const fields:Field[]=["country","network","provider","client","platform","softwareVersion"];
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
 private generation=0;
 private controller?:AbortController;
 private disposed=false;
 private readinessWithdrawalReason?:string;
 private readonly listeners=new Set<(state:ConnectionFormState)=>void>();
 private readonly translations:Record<string,ConnectionTranslation>;
 constructor(private readonly client:Pick<ConnectionCheckClient,"check"|"submit">,language="en",private readonly clock=()=>new Date(),translations:Record<string,ConnectionTranslation>=CONNECTION_TRANSLATIONS) {
  this.translations=structuredClone(translations);validateConnectionFormTranslations(this.translations);this.language=selectConnectionLanguage(language,this.translations);
 }
 state():ConnectionFormState {
  const form=this.result?.status==="customer-input-required"?this.result.form:undefined,now=this.clock().getTime();
  const expired=!!form&&(!Number.isFinite(now)||Date.parse(form.expiresAt)<=now||!Number.isFinite(Date.parse(form.expiresAt)));
  const complete=!!form&&form.fields.every(field=>field.options.some(option=>option.id===this.selections[field.key]&&this.available(option.requires)));
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
  if(id!==""&&(!option||!this.available(option.requires)))throw new Error("INVALID_CONNECTION_CHOICE");
  if(!offered)throw new Error("INVALID_CONNECTION_CHOICE");
  if(id)this.selections[field]=id;else delete this.selections[field];
  for(const key of fields){
   const options=this.result.form.fields.find(item=>item.key===key)?.options;
   if(this.selections[key]&&!options?.some(item=>item.id===this.selections[key]&&this.available(item.requires)))delete this.selections[key];
  }
  this.emit();
 }
 optionAvailable(requires?:Partial<Record<Field,string>>){return this.available(requires);}
 async check(software?:ConnectionCheckInput["software"]){
  this.active();const token=this.begin("checking");this.result=undefined;this.selections={};this.emit();
  try{const result=await this.client.check({language:this.language,...(software?{software}:{})},this.controller!.signal);this.finish(token,result);}
  catch{if(this.current(token)){this.phase="unavailable";this.emit();}}
 }
 async submit(software?:ConnectionCheckInput["software"]){
  this.active();if(!this.state().canSubmit||this.result?.status!=="customer-input-required")throw new Error("CONNECTION_FORM_NOT_READY");
  const formId=this.result.form.id,selections=structuredClone(this.selections),token=this.begin("submitting");this.emit();
  try{const result=await this.client.submit({formId,selections,language:this.language,...(software?{software}:{})},this.controller!.signal);this.finish(token,result);}
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
 private available(requires?:Partial<Record<Field,string>>){
  const result=this.result;
  if(result?.status!=="customer-input-required")return false;
  return Object.entries(requires??{}).every(([key,value])=>result.form.fields.find(field=>field.key===key)?.options.find(option=>option.id===this.selections[key as Field])?.value===value);
 }
 private begin(phase:ConnectionFormState["phase"]){this.controller?.abort();this.controller=new AbortController();this.phase=phase;return ++this.generation;}
 private current(token:number){return !this.disposed&&this.generation===token;}
 private finish(token:number,result:ConnectionClientResult){if(!this.current(token))return;this.result=structuredClone(result);this.readinessWithdrawalReason=undefined;this.selections={};this.phase=result.status==="customer-input-required"?"choosing":result.status==="assessed"?"assessed":"unavailable";this.emit();}
 private active(){if(this.disposed)throw new Error("CONNECTION_FORM_DISPOSED");}
 private emit(){for(const listener of this.listeners)listener(this.state());}
}
