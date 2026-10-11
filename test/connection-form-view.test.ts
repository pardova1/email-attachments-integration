import assert from "node:assert/strict";
import test from "node:test";
import {parseHTML} from "linkedom";
import {mountConnectionAssistance} from "../src/client/connection-form-view.js";
import {ConnectionCheckClient} from "../src/client/connection-check-client.js";

function fallback(){return {status:"customer-input-required",retryRequired:true,language:"en",direction:"ltr",languageOptions:[{tag:"en",label:"English"}],form:{id:"11111111-1111-4111-8111-111111111111",message:"Choose",expiresAt:new Date(Date.now()+60_000).toISOString(),fields:[{key:"client",label:"Client",options:[{id:"a",label:"<img src=x onerror=alert(1)>",value:"a"},{id:"b",label:"App B",value:"b"}]},{key:"softwareVersion",label:"Version",options:[{id:"a1",label:"A1",value:"1",requires:{client:"a"}},{id:"b2",label:"B2",value:"2",requires:{client:"b"}}]}]}};}
const assessed=()=>({status:"assessed",retryRequired:true,language:"en",discoveryReference:"synthetic",environmentSource:"customer-selection",validation:{missingTools:["upload"],assessment:{environment:{country:"NO",network:"test",provider:"test",client:"a",platform:"android",softwareVersion:"1"},status:"not-ready",requiredChecks:["upload"],reasons:["CHECK_REQUIRED:upload"]}}});
const response=(value:unknown)=>new Response(JSON.stringify(value),{headers:{"content-type":"application/json"}});
async function settled(model:ReturnType<typeof mountConnectionAssistance>["model"]){
 if(!["checking","submitting"].includes(model.state().phase))return;
 await new Promise<void>(resolve=>{let stop:()=>void=()=>{};stop=model.subscribe(state=>{if(!["checking","submitting"].includes(state.phase)){stop();resolve();}});});
}
function select(container:HTMLElement,name:string,value:string,window:ReturnType<typeof parseHTML>["window"]){
 const node=container.querySelector<HTMLSelectElement>(`select[name="${name}"]`)!;
 // linkedom has no select.value setter: set the selected option explicitly.
 for(const option of Array.from(node.options))option.removeAttribute("selected");
 Array.from(node.options).find(option=>option.value===value)!.selected=true;
 node.dispatchEvent(new window.Event("change",{bubbles:true}));
}
test("mounted DOM form preserves language selections clears dependents and submits authenticated JSON",async()=>{
 const {document,window}=parseHTML('<html><body><main id="connection"></main></body></html>');
 const container=document.getElementById("connection") as unknown as HTMLElement;let requests=0,assessments=0,submitted:unknown;
 const client=new ConnectionCheckClient("https://app.example/v1/connection",async()=>"test-token",async(_url,init)=>{
  requests++;assert.equal((init?.headers as Record<string,string>).authorization,"Bearer test-token");
  if(requests===1)return response(fallback());submitted=JSON.parse(init!.body as string);return response(assessed());
 });
 const mounted=mountConnectionAssistance(container,client,{language:"fa",onAssessed(){assessments++;}});
 try{
  await settled(mounted.model);assert.equal(container.dir,"rtl");assert.equal(container.querySelector("img"),null);assert.ok(container.textContent?.includes("<img src=x"));
  assert.equal(container.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled,true);
  select(container,"client","a",window);select(container,"softwareVersion","a1",window);assert.equal(mounted.model.state().canSubmit,true);
  select(container,"connection-language","sv",window);assert.equal(container.lang,"sv");assert.equal(container.dir,"ltr");assert.deepEqual(mounted.model.state().selections,{client:"a",softwareVersion:"a1"});
  select(container,"client","b",window);assert.deepEqual(mounted.model.state().selections,{client:"b"});assert.equal(container.querySelector<HTMLOptionElement>('option[value="a1"]')?.disabled,true);
  select(container,"softwareVersion","b2",window);container.querySelector("form")!.dispatchEvent(new window.Event("submit",{bubbles:true,cancelable:true}));await settled(mounted.model);
  assert.deepEqual(submitted,{formId:fallback().form.id,selections:{client:"b",softwareVersion:"b2"},language:"sv"});assert.equal(assessments,1);assert.ok(container.querySelector('[role="alert"]'));
  select(container,"connection-language","ar",window);assert.equal(container.dir,"rtl");assert.equal(assessments,1);
 }finally{mounted.dispose();assert.equal(container.childNodes.length,0);}
});
test("disposing the mounted form aborts transport and removes resume/network handlers",async()=>{
 const {document,window}=parseHTML('<html><body><main id="connection"></main></body></html>');const container=document.getElementById("connection") as unknown as HTMLElement;
 let signal:AbortSignal|undefined,entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;});
 const client=new ConnectionCheckClient("https://app.example/v1/connection",async()=>"test-token",async(_url,init)=>{signal=init?.signal??undefined;entered();return new Promise(()=>{});});
 const mounted=mountConnectionAssistance(container,client);await started;mounted.dispose();assert.equal(signal?.aborted,true);
 for(const event of ["focus","pageshow","offline","online"])window.dispatchEvent(new window.Event(event));document.dispatchEvent(new window.Event("visibilitychange"));
 assert.equal(container.childNodes.length,0);await new Promise(resolve=>setImmediate(resolve));
});


test("host language packs reach the mounted selector fields and difficulty notice",async()=>{
 const {CONNECTION_TRANSLATIONS}=await import("../src/email/connection-languages.js");
 const custom={en:CONNECTION_TRANSLATIONS.en,bn:{...structuredClone(CONNECTION_TRANSLATIONS.en),language:"বাংলা",title:"সংযোগ পরীক্ষা",difficultyNotice:"প্রযুক্তিগত সমস্যা। পরে আবার চেষ্টা করুন।"}};
 const {document}=parseHTML('<html><body><main id="connection"></main></body></html>');const container=document.getElementById("connection") as unknown as HTMLElement;
 const client=new ConnectionCheckClient("https://app.example/v1/connection",async()=>"token",async()=>response(assessed()));
 const mounted=mountConnectionAssistance(container,client,{language:"bn-BD",translations:custom});
 try{custom.bn.title="changed outside";await settled(mounted.model);assert.equal(container.lang,"bn");assert.equal(container.querySelector("h1")?.textContent,"সংযোগ পরীক্ষা");assert.equal(container.querySelector('[role="alert"]')?.textContent,"প্রযুক্তিগত সমস্যা। পরে আবার চেষ্টা করুন।");assert.equal(container.querySelectorAll('select[name="connection-language"] option').length,2);mounted.model.setLanguage("en");assert.equal(container.lang,"en");}
 finally{mounted.dispose();}
});

test("new language packs require a complete difficulty message before mounting",async()=>{
 const {CONNECTION_TRANSLATIONS}=await import("../src/email/connection-languages.js");const {document}=parseHTML('<html><body><main></main></body></html>');const container=document.querySelector("main") as unknown as HTMLElement;
 const client=new ConnectionCheckClient("https://app.example/v1/connection",async()=>"token");
 assert.throws(()=>mountConnectionAssistance(container,client,{translations:{bn:{...CONNECTION_TRANSLATIONS.en,language:"বাংলা"}}}),/CONNECTION_DIFFICULTY_TRANSLATION_REQUIRED/);assert.equal(container.childNodes.length,0);
});
test("mounted assistance automatically rediscovers after internet returns",async()=>{
 const {document,window}=parseHTML('<html><body><main></main></body></html>');const container=document.querySelector("main") as unknown as HTMLElement;let requests=0,tokens=0;
 const client=new ConnectionCheckClient("https://app.example/v1/connection",async()=>{tokens++;return "token";},async()=>{requests++;return response(fallback());});
 const mounted=mountConnectionAssistance(container,client,{language:"fa",software:{client:"native",platform:"android",softwareVersion:"1"}});
 try{await settled(mounted.model);mounted.model.choose("client","a");window.dispatchEvent(new window.Event("offline"));assert.equal(mounted.model.state().phase,"unavailable");assert.deepEqual(mounted.model.state().selections,{});window.dispatchEvent(new window.Event("online"));window.dispatchEvent(new window.Event("online"));await new Promise(resolve=>setTimeout(resolve,300));await settled(mounted.model);assert.equal(requests,2);assert.equal(tokens,2);assert.equal(mounted.model.state().phase,"choosing");assert.equal(mounted.model.state().language,"fa");assert.deepEqual(mounted.model.state().selections,{});}finally{mounted.dispose();}
});
test("deadline refresh withdraws expired readiness and resume events do not duplicate it",async t=>{
 t.mock.timers.enable({apis:["Date","setTimeout"],now:new Date("2026-10-11T15:00:00Z")});
 const {document,window}=parseHTML('<html><body><main></main></body></html>');Object.defineProperty(document,"visibilityState",{value:"visible",writable:true});const container=document.querySelector("main") as unknown as HTMLElement;let requests=0;const outcomes:string[]=[];
 const client=new ConnectionCheckClient("https://app.example/v1/connection",async()=>"token",async()=>{requests++;const value=assessed();value.retryRequired=false;value.validation.missingTools=[];Object.assign(value.validation.assessment,{status:"verified",requiredChecks:[],reasons:[],checkedAt:new Date().toISOString(),expiresAt:new Date(Date.now()+60_000).toISOString()});return response(value);});
 const mounted=mountConnectionAssistance(container,client,{language:"ar",onAssessed(result){outcomes.push(result.validation.assessment.status);}});
 try{await settled(mounted.model);assert.equal(requests,1);t.mock.timers.tick(60_000);window.dispatchEvent(new window.Event("focus"));window.dispatchEvent(new window.Event("pageshow"));assert.equal(mounted.model.state().phase,"checking");assert.deepEqual(outcomes,["verified","unverified"]);await settled(mounted.model);assert.equal(requests,2);assert.equal(mounted.model.state().result?.retryRequired,false);assert.equal(mounted.model.state().language,"ar");}finally{mounted.dispose();}
});
test("expired fallback selections are replaced by fresh automatic discovery on resume",async t=>{
 t.mock.timers.enable({apis:["Date"],now:new Date("2026-10-11T15:00:00Z")});
 const {document,window}=parseHTML('<html><body><main></main></body></html>');Object.defineProperty(document,"visibilityState",{value:"visible",writable:true});const container=document.querySelector("main") as unknown as HTMLElement;let requests=0;
 const client=new ConnectionCheckClient("https://app.example/v1/connection",async()=>"token",async()=>{requests++;const value=fallback();value.form.id=requests===1?"11111111-1111-4111-8111-111111111111":"22222222-2222-4222-8222-222222222222";return response(value);});
 const mounted=mountConnectionAssistance(container,client,{language:"fa"});
 try{await settled(mounted.model);mounted.model.choose("client","a");mounted.model.choose("softwareVersion","a1");t.mock.timers.tick(60_000);window.dispatchEvent(new window.Event("focus"));await settled(mounted.model);assert.equal(requests,2);assert.deepEqual(mounted.model.state().selections,{});const result=mounted.model.state().result;if(result?.status!=="customer-input-required")throw new Error("EXPECTED_FRESH_FORM");assert.equal(result.form.id,"22222222-2222-4222-8222-222222222222");assert.equal(mounted.model.state().language,"fa");}finally{mounted.dispose();}
});
test("hidden expired forms defer rediscovery and disposal prevents later recovery",async t=>{
 t.mock.timers.enable({apis:["Date","setTimeout"],now:new Date("2026-10-11T15:00:00Z")});
 const {document,window}=parseHTML('<html><body><main></main></body></html>');Object.defineProperty(document,"visibilityState",{value:"hidden",writable:true});const container=document.querySelector("main") as unknown as HTMLElement;let requests=0;
 const client=new ConnectionCheckClient("https://app.example/v1/connection",async()=>"token",async()=>{requests++;return response(fallback());});const mounted=mountConnectionAssistance(container,client);
 try{await settled(mounted.model);t.mock.timers.tick(60_000);window.dispatchEvent(new window.Event("focus"));assert.equal(requests,1);Object.defineProperty(document,"visibilityState",{value:"visible",writable:true});document.dispatchEvent(new window.Event("visibilitychange"));await settled(mounted.model);assert.equal(requests,2);mounted.dispose();t.mock.timers.tick(60_000);window.dispatchEvent(new window.Event("focus"));await new Promise(resolve=>setImmediate(resolve));assert.equal(requests,2);}finally{mounted.dispose();}
});
test("mounting offline pauses requests and resumes with fresh authentication when online",async t=>{
 t.mock.timers.enable({apis:["Date","setTimeout"],now:new Date("2026-10-11T15:00:00Z")});
 const {document,window}=parseHTML('<html><body><main></main></body></html>');Object.defineProperty(document,"defaultView",{value:{navigator:{onLine:false},addEventListener:window.addEventListener.bind(window),removeEventListener:window.removeEventListener.bind(window)},configurable:true});const container=document.querySelector("main") as unknown as HTMLElement;let requests=0,tokens=0;
 const client=new ConnectionCheckClient("https://app.example/v1/connection",async()=>{tokens++;return "token";},async()=>{requests++;return response(fallback());});const mounted=mountConnectionAssistance(container,client,{language:"fa"});
 try{assert.equal(mounted.model.state().phase,"unavailable");assert.equal(container.querySelector("button")?.disabled,true);window.dispatchEvent(new window.Event("focus"));t.mock.timers.tick(1000);assert.equal(requests,0);assert.equal(tokens,0);window.dispatchEvent(new window.Event("online"));t.mock.timers.tick(250);await settled(mounted.model);assert.equal(requests,1);assert.equal(tokens,1);assert.equal(mounted.model.state().phase,"choosing");assert.equal(mounted.model.state().language,"fa");}finally{mounted.dispose();}
});
test("offline event pauses expiry recovery and keeps old choices unavailable until online",async t=>{
 t.mock.timers.enable({apis:["Date","setTimeout"],now:new Date("2026-10-11T15:00:00Z")});
 const {document,window}=parseHTML('<html><body><main></main></body></html>');Object.defineProperty(document,"visibilityState",{value:"visible",writable:true});const container=document.querySelector("main") as unknown as HTMLElement;let requests=0;
 const client=new ConnectionCheckClient("https://app.example/v1/connection",async()=>"token",async()=>{requests++;return response(fallback());});const mounted=mountConnectionAssistance(container,client);
 try{await settled(mounted.model);mounted.model.choose("client","a");window.dispatchEvent(new window.Event("offline"));assert.equal(container.querySelector("button")?.disabled,true);t.mock.timers.tick(60_000);window.dispatchEvent(new window.Event("focus"));assert.equal(requests,1);assert.deepEqual(mounted.model.state().selections,{});window.dispatchEvent(new window.Event("online"));t.mock.timers.tick(250);await settled(mounted.model);assert.equal(requests,2);assert.equal(mounted.model.state().canSubmit,false);}finally{mounted.dispose();}
});
