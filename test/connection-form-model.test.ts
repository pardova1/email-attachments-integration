import assert from "node:assert/strict";
import test from "node:test";
import {ConnectionFormModel} from "../src/client/connection-form-model.js";
import type {ConnectionClientResult,ConnectionSelectionInput} from "../src/client/connection-check-client.js";
function form():ConnectionClientResult{return {status:"customer-input-required",retryRequired:true,language:"en",direction:"ltr",languageOptions:[{tag:"en",label:"English"}],form:{id:"11111111-1111-4111-8111-111111111111",message:"Choose missing details",expiresAt:new Date(Date.now()+60_000).toISOString(),fields:[{key:"client",label:"App",options:[{id:"a",label:"App A",value:"a"},{id:"b",label:"App B",value:"b"}]},{key:"softwareVersion",label:"Version",options:[{id:"a-1",label:"A 1",value:"1",requires:{client:"a"}},{id:"b-2",label:"B 2",value:"2",requires:{client:"b"}}]}]}};}
function assessed():ConnectionClientResult{return {status:"assessed",retryRequired:true,language:"en",discoveryReference:"synthetic",environmentSource:"customer-selection",validation:{missingTools:["upload"],assessment:{environment:{country:"KW",network:"test-network",provider:"test-provider",client:"a",platform:"android",softwareVersion:"1"},status:"not-ready",requiredChecks:["upload"],reasons:["CHECK_REQUIRED:upload"]}}};}
test("automatic checks precede choices and language switching preserves selected IDs",async()=>{
 let language:string|undefined;const model=new ConnectionFormModel({async check(input){language=input?.language;return form();},async submit(){return assessed();}},"fa-IR");
 assert.equal(model.state().phase,"idle");await model.check();assert.equal(language,"fa");assert.equal(model.state().phase,"choosing");assert.equal(model.state().canSubmit,false);
 model.choose("client","a");model.choose("softwareVersion","a-1");model.setLanguage("ar-KW");assert.equal(model.state().language,"ar");assert.deepEqual(model.state().selections,{client:"a",softwareVersion:"a-1"});assert.equal(model.state().canSubmit,true);
});
test("changing app clears an incompatible version and rejects forged choices",async()=>{
 const model=new ConnectionFormModel({async check(){return form();},async submit(){return assessed();}});await model.check();
 assert.throws(()=>model.choose("softwareVersion","b-2"),/INVALID_CONNECTION_CHOICE/);model.choose("client","a");model.choose("softwareVersion","a-1");model.choose("client","b");
 assert.deepEqual(model.state().selections,{client:"b"});assert.equal(model.state().canSubmit,false);assert.throws(()=>model.choose("client","invented"),/INVALID_CONNECTION_CHOICE/);
});
test("valid submissions use current form ID language and only selected fields",async()=>{
 let submitted:ConnectionSelectionInput|undefined;
 const model=new ConnectionFormModel({async check(){return form();},async submit(input){submitted=input;return assessed();}});await model.check();model.choose("client","a");model.choose("softwareVersion","a-1");model.setLanguage("sv");await model.submit();
 assert.deepEqual(submitted,{formId:"11111111-1111-4111-8111-111111111111",language:"sv",selections:{client:"a",softwareVersion:"a-1"}});assert.equal(model.state().phase,"assessed");assert.equal(model.state().result?.retryRequired,true);
});
test("expired forms cannot submit and snapshots cannot change stored selections",async()=>{
 let current=new Date(),calls=0;const result=form();const model=new ConnectionFormModel({async check(){return result;},async submit(){calls++;return assessed();}},"en",()=>current);
 await model.check();model.choose("client","a");model.choose("softwareVersion","a-1");const snapshot=model.state();snapshot.selections.client="b";assert.equal(model.state().selections.client,"a");
 if(result.status!=="customer-input-required")throw new Error("EXPECTED_FORM");current=new Date(result.form.expiresAt);assert.equal(model.state().expired,true);await assert.rejects(model.submit(),/CONNECTION_FORM_NOT_READY/);assert.equal(calls,0);
});
test("superseded checks abort the old operation and ignore its late response",async()=>{
 let finish!:(value:ConnectionClientResult)=>void,firstSignal:AbortSignal|undefined,calls=0;
 const model=new ConnectionFormModel({async check(_input,signal){calls++;if(calls===1){firstSignal=signal;return new Promise(resolve=>{finish=resolve;});}return assessed();},async submit(){return assessed();}});
 const first=model.check();await model.check();assert.equal(firstSignal?.aborted,true);finish(form());await first;assert.equal(model.state().phase,"assessed");
});
test("failed discovery stays unavailable instead of asking for invented manual requirements",async()=>{
 const model=new ConnectionFormModel({async check(){throw new Error("PRIVATE_SERVER_DETAIL");},async submit(){return assessed();}});await model.check();assert.equal(model.state().phase,"unavailable");assert.equal(model.state().result,undefined);assert.equal(JSON.stringify(model.state()).includes("PRIVATE"),false);
});
test("disposing the form cancels work and prevents late updates",async()=>{
 let finish!:(value:ConnectionClientResult)=>void,signal:AbortSignal|undefined,notifications=0;
 const model=new ConnectionFormModel({async check(_input,received){signal=received;return new Promise(resolve=>{finish=resolve;});},async submit(){return assessed();}});model.subscribe(()=>{notifications++;});const pending=model.check(),before=notifications;model.dispose();assert.equal(signal?.aborted,true);finish(form());await pending;assert.equal(notifications,before);assert.throws(()=>model.setLanguage("ar"),/CONNECTION_FORM_DISPOSED/);
});


test("verified readiness is withdrawn at its exact evidence deadline without another server request",async()=>{
 let now=new Date("2026-10-10T12:00:00Z"),checks=0;
 const result=assessed();if(result.status!=="assessed")throw new Error("EXPECTED_ASSESSMENT");
 result.retryRequired=false;result.validation.missingTools=[];
 Object.assign(result.validation.assessment,{status:"verified",requiredChecks:[],reasons:[],checkedAt:now.toISOString(),expiresAt:"2026-10-10T12:01:00Z"});
 const model=new ConnectionFormModel({async check(){checks++;return result;},async submit(){return result;}},"en",()=>now);
 const updates:ConnectionClientResult[]=[];model.subscribe(state=>{if(state.result)updates.push(state.result);});await model.check();
 assert.equal(model.state().result?.retryRequired,false);
 now=new Date("2026-10-10T12:00:59.999Z");assert.equal(model.state().result?.retryRequired,false);
 now=new Date("2026-10-10T12:01:00Z");model.refresh();
 const expired=updates.at(-1)!;assert.equal(expired.retryRequired,true);
 if(expired.status!=="assessed")throw new Error("EXPECTED_ASSESSMENT");
 assert.equal(expired.validation.assessment.status,"unverified");assert.deepEqual(expired.validation.assessment.reasons,["EVIDENCE_EXPIRED"]);
 assert.equal(expired.validation.assessment.requiredChecks.length,7);assert.equal(checks,1);assert.equal(result.retryRequired,false);
 now=new Date("2026-10-10T12:00:30Z");model.setLanguage("ar");assert.equal(model.state().result?.retryRequired,true);
 result.validation.assessment.expiresAt="2026-10-10T12:02:00Z";await model.check();assert.equal(model.state().result?.retryRequired,false);assert.equal(checks,2);
});

test("an invalid form clock cannot preserve a verified assessment",async()=>{
 const result=assessed();if(result.status!=="assessed")throw new Error("EXPECTED_ASSESSMENT");
 result.retryRequired=false;Object.assign(result.validation.assessment,{status:"verified",expiresAt:"2099-01-01T00:00:00Z"});
 const model=new ConnectionFormModel({async check(){return result;},async submit(){return result;}},"en",()=>new Date(NaN));await model.check();assert.equal(model.state().result?.retryRequired,true);
});
