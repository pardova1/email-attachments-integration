import assert from "node:assert/strict";
import test from "node:test";
import { CustomerConnectionFallback, renderConnectionFallback } from "../src/email/customer-connection-fallback.js";
import { AutomaticConnectionCoordinator } from "../src/email/automatic-connection-coordinator.js";
import { GlobalConnectionReadinessAgent, REQUIRED_CONNECTION_CHECKS, type ConnectionCheck, type ConnectionEnvironment } from "../src/email/global-connection-readiness-agent.js";
import type { ConnectionProbeTool } from "../src/email/global-connection-validation-runner.js";
const now=new Date("2026-10-10T00:00:00Z");
const known={network:"test-network",provider:"test-provider",client:"test-client",platform:"android",softwareVersion:"1.0"};
const choices={country:[{id:"norway",label:"Norway",value:"NO"},{id:"sweden",label:"Sweden",value:"SE"}]};
const observation={environment:known,observedAt:now.toISOString(),sourceReference:"automatic:1"};
function toolset(){
 const tools={} as Record<ConnectionCheck,ConnectionProbeTool>;
 for(const check of REQUIRED_CONNECTION_CHECKS)tools[check]={id:check,async run(){return {outcome:"passed",testReference:"run",...(check==="recipient-download"?{recipientNeedsInstallation:false}:{})};}};
 return tools;
}

test("incomplete discovery offers only missing dropdowns and retains detected details",async()=>{
 const fallback=new CustomerConnectionFallback(choices,()=>now);let selected:ConnectionEnvironment|undefined;
 const coordinator=new AutomaticConnectionCoordinator({async discover(){return observation;}},{async toolsFor(env){selected=env;return toolset();}},new GlobalConnectionReadinessAgent(),()=>now,10_000,fallback,"sender-1");
 const result=await coordinator.check();assert.equal(result.status,"customer-input-required");
 if(result.status!=="customer-input-required")throw new Error("FORM_REQUIRED");
 assert.deepEqual(result.form.fields.map(field=>field.key),["country"]);
 const checked=await coordinator.submitFallback(result.form.id,{country:"norway"});
 assert.equal(checked.status,"assessed");assert.equal(checked.retryRequired,false);
 if(checked.status==="assessed")assert.equal(checked.environmentSource,"customer-selection");
 assert.deepEqual(selected,{...known,country:"NO"});
});

test("successful automatic discovery never prompts the customer",async()=>{
 const fallback=new CustomerConnectionFallback(choices,()=>now);
 const coordinator=new AutomaticConnectionCoordinator({async discover(){return {...observation,environment:{...known,country:"NO"}};}},{async toolsFor(){return toolset();}},new GlobalConnectionReadinessAgent(),()=>now,10_000,fallback,"sender-1");
 assert.equal((await coordinator.check()).status,"assessed");
});

test("customer selection cannot skip failed connection checks",async()=>{
 const fallback=new CustomerConnectionFallback(choices,()=>now);
 const coordinator=new AutomaticConnectionCoordinator({async discover(){return observation;}},{async toolsFor(){return {};}},new GlobalConnectionReadinessAgent(),()=>now,10_000,fallback,"sender-1");
 const result=await coordinator.check();if(result.status!=="customer-input-required")throw new Error("FORM_REQUIRED");
 const checked=await coordinator.submitFallback(result.form.id,{country:"sweden"});
 assert.equal(checked.status,"assessed");assert.equal(checked.retryRequired,true);
});

test("catalog failure after successful discovery is an internal retry without customer dropdowns",async()=>{
 const coordinator=new AutomaticConnectionCoordinator({async discover(){return {...observation,environment:{...known,country:"NO"}};}},{async toolsFor(){throw new Error("CATALOG_OFFLINE");}},new GlobalConnectionReadinessAgent(),()=>now,10_000,new CustomerConnectionFallback(choices,()=>now),"sender-1");
 assert.equal((await coordinator.check()).status,"pending-internal-retry");
});

test("fallback rejects invented choices extra fields and caller form mutation",()=>{
 const fallback=new CustomerConnectionFallback(choices,()=>now),form=fallback.prepare("sender-1",known,["country"])!;
 assert.throws(()=>fallback.resolve("sender-1",form.id,{country:"invented"}),/INVALID_CONNECTION_SELECTION/);
 assert.throws(()=>fallback.resolve("sender-1",form.id,{country:"norway",platform:"ios"}),/INVALID_CONNECTION_SELECTION/);
 form.fields[0].options[0].value="IR";
 assert.equal(fallback.resolve("sender-1",form.id,{country:"norway"}).country,"NO");
});

test("expired forms and unavailable catalogs cannot supply untested customer values",()=>{
 let current=now;
 const fallback=new CustomerConnectionFallback(choices,()=>current),form=fallback.prepare("sender-1",known,["country"])!;
 current=new Date(form.expiresAt);
 assert.throws(()=>fallback.resolve("sender-1",form.id,{country:"norway"}),/CONNECTION_FORM_EXPIRED/);
 assert.equal(fallback.prepare("sender-1",{},["platform"]),undefined);
});

test("dropdown renderer uses accessible required selects and escapes catalog labels",()=>{
 const fallback=new CustomerConnectionFallback({country:[{id:"no",label:'Norway <script>alert("x")</script>',value:"NO"}]},()=>now);
 const form=fallback.prepare("sender-1",known,["country"])!,html=renderConnectionFallback(form,"/connection-assistance");
 assert.match(html,/<label for="country">Country<\/label>/);
 assert.match(html,/<select id="country" name="country" required>/);
 assert.match(html,/Choose an option/);assert.match(html,/Check connection/);
 assert.equal(html.includes("<script>"),false);assert.equal(html.includes('alert("x")'),false);
 for(const path of ["https://external.example","//external.example","/\\external.example"]){
  assert.throws(()=>renderConnectionFallback(form,path),/INVALID_CONNECTION_FORM_ACTION/);
 }
});


test("complete detection failure can offer every required dropdown from its catalog",async()=>{
 const completeChoices={...choices,...Object.fromEntries(Object.entries(known).map(([key,value])=>[key,[{id:value,label:value,value}]]))};
 const fallback=new CustomerConnectionFallback(completeChoices,()=>now);
 const coordinator=new AutomaticConnectionCoordinator({async discover(){throw new Error("DISCOVERY_UNAVAILABLE");}},{async toolsFor(){return toolset();}},new GlobalConnectionReadinessAgent(),()=>now,10_000,fallback,"sender-1");
 const result=await coordinator.check();assert.equal(result.status,"customer-input-required");
 if(result.status==="customer-input-required")assert.deepEqual(result.form.fields.map(field=>field.key),["country","network","provider","client","platform","softwareVersion"]);
});

const dependentChoices={
 client:[{id:"browser-a",label:"Browser A",value:"a"},{id:"browser-b",label:"Browser B",value:"b"}],
 softwareVersion:[{id:"a-1",label:"A 1",value:"1",requires:{client:"a"}},{id:"b-2",label:"B 2",value:"2",requires:{client:"b"}}]
};
test("detected app filters version choices and unavailable versions stay internal",()=>{
 const fallback=new CustomerConnectionFallback(dependentChoices,()=>now);
 const form=fallback.prepare("sender-1",{...known,country:"NO",client:"a"},["softwareVersion"])!;
 assert.deepEqual(form.fields[0].options.map(option=>option.id),["a-1"]);
 assert.equal(fallback.resolve("sender-1",form.id,{softwareVersion:"a-1"}).softwareVersion,"1");
 assert.equal(fallback.prepare("sender-1",{...known,country:"NO",client:"unknown"},["softwareVersion"]),undefined);
});
test("dependent selections reject mismatched app versions including forged submissions",()=>{
 const fallback=new CustomerConnectionFallback(dependentChoices,()=>now);
 const form=fallback.prepare("sender-1",{...known,country:"NO"},["softwareVersion","client"])!;
 assert.deepEqual(form.fields.map(field=>field.key),["client","softwareVersion"]);
 assert.throws(()=>fallback.resolve("sender-1",form.id,{client:"browser-a",softwareVersion:"b-2"}),/INCOMPATIBLE_CONNECTION_SELECTION/);
 assert.equal(fallback.resolve("sender-1",form.id,{client:"browser-b",softwareVersion:"b-2"}).softwareVersion,"2");
 form.fields[1].options[1].requires!.client="a";
 assert.throws(()=>fallback.resolve("sender-1",form.id,{client:"browser-a",softwareVersion:"b-2"}),/INCOMPATIBLE_CONNECTION_SELECTION/);
});
test("catalog rejects unknown self and forward dependencies",()=>{
 for(const requires of [{unknown:"a"},{client:"a"},{softwareVersion:"1"}]){
  assert.throws(()=>new CustomerConnectionFallback({client:[{id:"a",label:"A",value:"a",requires}]},()=>now),/INVALID_CONNECTION_CHOICE_CATALOG/);
 }
});

test("language selector localizes prompts and country names with right-to-left layout",()=>{
 const form=new CustomerConnectionFallback(choices,()=>now).prepare("sender-1",known,["country"])!;
 const html=renderConnectionFallback(form,"/connection-assistance","fa-IR");
 assert.match(html,/<html lang="fa" dir="rtl">/);
 assert.match(html,/id="connection-language"/);assert.match(html,/فارسی/);assert.match(html,/العربية/);
 assert.match(html,/بررسی اتصال/);assert.match(html,/نروژ/);
 assert.match(renderConnectionFallback(form,"/connection-assistance","sv-SE"),/<html lang="sv" dir="ltr">/);
 assert.match(renderConnectionFallback(form,"/connection-assistance","unavailable"),/<html lang="en" dir="ltr">/);
});
test("language catalogs accept additional languages and safely encode translated text",async()=>{
 const {CONNECTION_TRANSLATIONS}=await import("../src/email/connection-languages.js");
 const form=new CustomerConnectionFallback(choices,()=>now).prepare("sender-1",known,["country"])!;
 const custom={ja:{...CONNECTION_TRANSLATIONS.en,language:"日本語",title:'<script>alert("x")</script>'}};
 const html=renderConnectionFallback(form,"/connection-assistance","ja",custom);
 assert.match(html,/<html lang="ja"/);assert.match(html,/&lt;script&gt;/);
 assert.equal(html.includes('<script>alert("x")</script>'),false);
 assert.throws(()=>renderConnectionFallback(form,"/connection-assistance","en",{}),/EMPTY_CONNECTION_LANGUAGE_CATALOG/);
});
test("changing language preserves selections and changing app clears incompatible versions",async()=>{
 const {runInNewContext}=await import("node:vm");
 const {CONNECTION_TRANSLATIONS}=await import("../src/email/connection-languages.js");
 const form=new CustomerConnectionFallback(dependentChoices,()=>now).prepare("sender-1",{...known,country:"NO"},["client","softwareVersion"])!;
 const html=renderConnectionFallback(form,"/connection-assistance");
 function select(name:string,options:{id:string;value?:string;requires?:Record<string,string>}[]){
  let value=options[0].id;
  const items=options.map(option=>({value:option.id,dataset:{connectionValue:option.value,requires:JSON.stringify(option.requires??{})},disabled:false,hidden:false,textContent:"",get selected(){return value===option.id;}}));
  return {id:name,name,options:items,get value(){return value;},set value(next:string){value=next;},get selectedOptions(){return items.filter(item=>item.selected);}};
 }
 const client=select("client",[{id:""},{id:"browser-a",value:"a"},{id:"browser-b",value:"b"}]);
 const version=select("softwareVersion",[{id:""},{id:"a-1",value:"1",requires:{client:"a"}},{id:"b-2",value:"2",requires:{client:"b"}}]);
 client.value="browser-a";version.value="a-1";
 const listeners:Record<string,(event?:unknown)=>void>={};
 const nodes:Record<string,any>={"connection-translations":{dataset:{packs:JSON.stringify(CONNECTION_TRANSLATIONS)}},"connection-language":{addEventListener(_name:string,fn:(event?:unknown)=>void){listeners.language=fn;}},"language-label":{},"connection-message":{},"connection-note":{},h1:{},button:{},client:{},softwareVersion:{}};
 const uiForm={elements:{language:{value:"en"}},querySelectorAll(){return [client,version];},querySelector(){return nodes.button;},addEventListener(_name:string,fn:(event?:unknown)=>void){listeners.change=fn;}};
 const document={documentElement:{lang:"en",dir:"ltr"},title:"",getElementById(id:string){return nodes[id];},querySelector(selector:string){return selector==="form"?uiForm:selector==="h1"?nodes.h1:nodes[selector.match(/for="([^"]+)"/)![1]];}};
 runInNewContext(html.match(/<script type="module">([\s\S]*?)<\/script>/)![1],{document,Intl});
 listeners.language({target:{value:"fa"}});
 assert.equal(document.documentElement.dir,"rtl");assert.equal(client.value,"browser-a");assert.equal(version.value,"a-1");
 client.value="browser-b";listeners.change();
 assert.equal(version.value,"");assert.equal(version.options[1].disabled,true);assert.equal(version.options[2].disabled,false);
});

test("every built-in language renders complete translated connection fields",async()=>{
 const {CONNECTION_TRANSLATIONS,selectConnectionLanguage}=await import("../src/email/connection-languages.js");
 const keys=["country","network","provider","client","platform","softwareVersion"] as const;
 const catalog={...choices,...Object.fromEntries(Object.entries(known).map(([key,value])=>[key,[{id:value,label:value,value}]]))};
 const form=new CustomerConnectionFallback(catalog,()=>now).prepare("sender-1",{},[...keys])!;
 for(const [tag,translation] of Object.entries(CONNECTION_TRANSLATIONS)){
  const html=renderConnectionFallback(form,"/connection-assistance",tag);
  assert.equal(selectConnectionLanguage(tag),tag);
  assert.ok(html.includes(`lang="${tag}" dir="${translation.direction}"`),tag);
  for(const field of keys){
   assert.ok(translation.fields[field].trim(),`${tag}: ${field}`);
   assert.ok(html.includes(`<label for="${field}">${translation.fields[field].replace(/[&<>"']/g,char=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char]!))}</label>`),`${tag}: ${field}`);
  }
  assert.ok(html.includes(`<button type="submit">${translation.submit}</button>`),tag);
  assert.ok(html.includes(`name="language" value="${tag}"`),tag);
 }
 assert.equal(Object.keys(CONNECTION_TRANSLATIONS).length,38);
});
test("new regional preferences select translated base languages with correct text direction",async()=>{
 const {selectConnectionLanguage}=await import("../src/email/connection-languages.js");
 const form=new CustomerConnectionFallback(choices,()=>now).prepare("sender-1",known,["country"])!;
 for(const [region,tag,direction] of [["pt-BR","pt","ltr"],["hi-IN","hi","ltr"],["ja-JP","ja","ltr"],["ur-PK","ur","rtl"],["he-IL","he","rtl"]]){
  assert.equal(selectConnectionLanguage(region),tag);
  assert.ok(renderConnectionFallback(form,"/connection-assistance",region).includes(`lang="${tag}" dir="${direction}"`));
 }
});

test("Iran Kuwait and African regional language preferences remain independent of routing",async()=>{
 const {selectConnectionLanguage}=await import("../src/email/connection-languages.js");
 const form=new CustomerConnectionFallback(choices,()=>now).prepare("sender-1",known,["country"])!;
 for(const [region,tag,direction] of [["fa-IR","fa","rtl"],["ar-KW","ar","rtl"],["ckb-IQ","ckb","rtl"],["ku-TR","ku","ltr"],["ps-AF","ps","rtl"],["sw-KE","sw","ltr"],["am-ET","am","ltr"],["ha-NG","ha","ltr"],["yo-NG","yo","ltr"],["ig-NG","ig","ltr"],["zu-ZA","zu","ltr"],["xh-ZA","xh","ltr"],["so-SO","so","ltr"],["rw-RW","rw","ltr"],["sn-ZW","sn","ltr"]]){
  assert.equal(selectConnectionLanguage(region),tag);
  assert.ok(renderConnectionFallback(form,"/connection-assistance",region).includes(`lang="${tag}" dir="${direction}"`));
  assert.equal(form.fields[0].options[0].value,"NO");
 }

});

test("fallback forms are bound to their customer and never expose that binding in the page",()=>{
 const fallback=new CustomerConnectionFallback(choices,()=>now),owner="authenticated-sender-private-id";
 const form=fallback.prepare(owner,known,["country"])!;
 assert.equal(JSON.stringify(form).includes(owner),false);assert.equal(renderConnectionFallback(form,"/connection-assistance").includes(owner),false);
 assert.throws(()=>fallback.resolve("different-sender",form.id,{country:"sweden"}),/CONNECTION_FORM_UNAVAILABLE/);
 assert.equal(fallback.resolve(owner,form.id,{country:"norway"}).country,"NO");
 assert.throws(()=>fallback.resolve("different-sender","unknown-id",{country:"sweden"}),/CONNECTION_FORM_UNAVAILABLE/);
});
test("another customer's coordinator cannot invoke probes using a stolen fallback form id",async()=>{
 const fallback=new CustomerConnectionFallback(choices,()=>now);let probesRequested=0;
 const catalog={async toolsFor(){probesRequested++;return toolset();}};
 function coordinator(owner:string){return new AutomaticConnectionCoordinator({async discover(){return observation;}},catalog,new GlobalConnectionReadinessAgent(),()=>now,10_000,fallback,owner);}
 const first=coordinator("sender-a"),second=coordinator("sender-b"),result=await first.check();
 if(result.status!=="customer-input-required")throw new Error("EXPECTED_FORM");
 await assert.rejects(second.submitFallback(result.form.id,{country:"sweden"}),/CONNECTION_FORM_UNAVAILABLE/);
 assert.equal(probesRequested,0);
 assert.equal((await first.submitFallback(result.form.id,{country:"norway"})).status,"assessed");assert.equal(probesRequested,1);
});
test("fallback operations reject missing malformed customer scope and unbound coordinators",()=>{
 const fallback=new CustomerConnectionFallback(choices,()=>now);
 for(const owner of [""," "," padded ","line\nbreak","x".repeat(257),undefined] as unknown as string[]){
  assert.throws(()=>fallback.prepare(owner,known,["country"]),/CONNECTION_CUSTOMER_SCOPE_REQUIRED/);
  assert.throws(()=>fallback.resolve(owner,"unknown",{country:"norway"}),/CONNECTION_CUSTOMER_SCOPE_REQUIRED/);
 }
 assert.throws(()=>new AutomaticConnectionCoordinator({async discover(){return observation;}},{async toolsFor(){return toolset();}},new GlobalConnectionReadinessAgent(),()=>now,10_000,fallback),/CONNECTION_CUSTOMER_SCOPE_REQUIRED/);
});
test("wrong-customer expiry attempts leave the owner's expiration handling intact",()=>{
 let current=now;const fallback=new CustomerConnectionFallback(choices,()=>current),form=fallback.prepare("sender-a",known,["country"])!;
 current=new Date(form.expiresAt);
 assert.throws(()=>fallback.resolve("sender-b",form.id,{country:"norway"}),/CONNECTION_FORM_UNAVAILABLE/);
 assert.throws(()=>fallback.resolve("sender-a",form.id,{country:"norway"}),/CONNECTION_FORM_EXPIRED/);
});
