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
