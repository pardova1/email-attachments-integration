import type {ConnectionCheckClient,ConnectionCheckInput,ConnectionClientResult} from "./connection-check-client.js";
import {observeConnectionFormLifecycle} from "./connection-form-lifecycle.js";
import {ConnectionFormModel} from "./connection-form-model.js";
import {CONNECTION_TRANSLATIONS,connectionDifficultyNotice,selectPreferredConnectionLanguage,type ConnectionTranslation} from "../email/connection-languages.js";

// Embed in an authenticated app. Values become text nodes, never HTML; the
// client owns authorization and submits JSON rather than exposing tokens in forms.
export function mountConnectionAssistance(container:HTMLElement,client:ConnectionCheckClient,options:{language?:string;translations?:Record<string,ConnectionTranslation>;software?:ConnectionCheckInput["software"];onAssessed?:(result:Extract<ConnectionClientResult,{status:"assessed"}>)=>void}={}) {
 const document=container.ownerDocument,translations=structuredClone(options.translations??CONNECTION_TRANSLATIONS);
 let language=options.language;
 if(language===undefined){
  try{const navigator=document.defaultView?.navigator;language=selectPreferredConnectionLanguage(navigator?.languages?.length?navigator.languages:navigator?.language?[navigator.language]:[],translations);}
  catch{language="en";}
 }
 const model=new ConnectionFormModel(client,language,undefined,translations);
 let expiryTimer:ReturnType<typeof setTimeout>|undefined,disposed=false,assessmentDelivered:string|undefined=undefined;
 const unsubscribe=model.subscribe(state=>{
  const active=document.activeElement;
  const focusName=active&&container.contains(active)?active.getAttribute("name"):undefined;
  if(expiryTimer)clearTimeout(expiryTimer);
  if(state.phase!=="assessed")assessmentDelivered=undefined;
  const text=translations[state.language];container.replaceChildren();container.lang=state.language;container.dir=text.direction;container.setAttribute("aria-busy",String(state.phase==="checking"||state.phase==="submitting"));
  const make=<K extends keyof HTMLElementTagNameMap>(tag:K,content?:string)=>{const node=document.createElement(tag);if(content!==undefined)node.textContent=content;return node;};
  const languageLabel=make("label",text.languageLabel),language=make("select");language.name="connection-language";languageLabel.append(language);language.setAttribute("aria-label",text.languageLabel);
  for(const [tag,translation] of Object.entries(translations)){const option=make("option",translation.language);option.value=tag;option.selected=tag===state.language;language.append(option);}
  language.addEventListener("change",()=>model.setLanguage(language.value));container.append(languageLabel,make("h1",text.title));
  const result=state.result;
  if(state.phase==="choosing"&&result?.status==="customer-input-required"&&!state.expired){
   container.append(make("p",text.message));const form=make("form");
   for(const field of result.form.fields){
    const label=make("label",text.fields[field.key]),select=make("select");select.name=field.key;select.required=true;label.append(select);
    const empty=make("option",text.choose);empty.value="";select.append(empty);
    for(const choice of field.options){const names=field.key==="country"?new Intl.DisplayNames([state.language],{type:"region"}):undefined;const option=make("option",names?.of(choice.value)??choice.label);option.value=choice.id;option.disabled=!model.optionAvailable(choice.requires);option.hidden=option.disabled;option.selected=state.selections[field.key]===choice.id;select.append(option);}
    select.addEventListener("change",()=>model.choose(field.key,select.value));form.append(label);
   }
   const submit=make("button",text.submit);submit.type="submit";submit.disabled=!state.canSubmit;form.append(submit);form.addEventListener("submit",event=>{event.preventDefault();if(model.state().canSubmit)void model.submit();else void model.check(options.software);});container.append(form,make("p",text.note));
   expiryTimer=setTimeout(()=>{if(!disposed)model.refresh();},Math.max(1,Math.min(Date.parse(result.form.expiresAt)-Date.now(),2_147_483_647)));
  }else{
   if(state.phase==="unavailable"||state.phase==="assessed"&&result?.retryRequired){const notice=make("p",connectionDifficultyNotice(state.language,translations));notice.setAttribute("role","alert");container.append(notice);}
   const check=make("button",text.submit);check.type="button";check.disabled=state.phase==="checking"||state.phase==="submitting";check.addEventListener("click",()=>void model.check(options.software));container.append(check);
   if(state.phase==="assessed"&&result?.status==="assessed"){
    const signature=JSON.stringify(result);
    if(assessmentDelivered!==signature){assessmentDelivered=signature;options.onAssessed?.(result);}
    if(!disposed&&result.validation.assessment.status==="verified")expiryTimer=setTimeout(()=>{if(!disposed)model.refresh();},Math.max(1,Math.min(Date.parse(result.validation.assessment.expiresAt!)-Date.now(),2_147_483_647)));
   }
  }
  if(focusName&&/^[a-zA-Z-]+$/.test(focusName))container.querySelector<HTMLElement>(`[name="${focusName}"]`)?.focus();
 });
 const stopLifecycle=observeConnectionFormLifecycle(document,document.defaultView,()=>model.refresh(),()=>model.invalidateConnection());
 void model.check(options.software);
 return {model,dispose(){if(disposed)return;disposed=true;stopLifecycle();if(expiryTimer)clearTimeout(expiryTimer);unsubscribe();model.dispose();container.replaceChildren();}};
}
