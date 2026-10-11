import assert from "node:assert/strict";
import test from "node:test";
import {parseHTML} from "linkedom";
import {ConnectionFormModel} from "../src/client/connection-form-model.js";
import {ConnectionCheckClient,type ConnectionClientResult} from "../src/client/connection-check-client.js";
import {mountConnectionAssistance} from "../src/client/connection-form-view.js";
function form():ConnectionClientResult{return {status:"customer-input-required",retryRequired:true,language:"en",direction:"ltr",languageOptions:[{tag:"en",label:"English"}],form:{id:"11111111-1111-4111-8111-111111111111",message:"Choose",expiresAt:new Date(Date.now()+60_000).toISOString(),fields:[{key:"network",label:"Network",options:[{id:"a",label:"A",value:"a"},{id:"b",label:"B",value:"b"}]},{key:"provider",label:"Provider",options:[{id:"a-mail",label:"A mail",value:"a-mail"},{id:"b-mail",label:"B mail",value:"b-mail"}]},{key:"softwareVersion",label:"Version",options:[{id:"a1",label:"A1",value:"1",requires:{network:"a",provider:"a-mail"}},{id:"b2",label:"B2",value:"2",requires:{network:"b",provider:"b-mail"}}]}]}};}
const pending=():ConnectionClientResult=>({status:"pending-internal-retry",retryRequired:true,language:"en",reason:"AUTOMATIC_CONNECTION_CHECK_UNAVAILABLE"});
const model=()=>new ConnectionFormModel({async check(){return form();},async submit(){return pending();}});
test("choices without direct requirements are disabled when the current prefix has no complete path",async()=>{
 const item=model();await item.check();assert.equal(item.choiceAvailable("provider","b-mail"),true);item.choose("network","a");assert.equal(item.choiceAvailable("provider","a-mail"),true);assert.equal(item.choiceAvailable("provider","b-mail"),false);assert.throws(()=>item.choose("provider","b-mail"),/INVALID_CONNECTION_CHOICE/);item.choose("provider","a-mail");assert.equal(item.choiceAvailable("softwareVersion","a1"),true);item.choose("softwareVersion","a1");assert.equal(item.state().canSubmit,true);
});
test("changing an earlier choice clears indirect downstream conflicts and allows another branch",async()=>{
 const item=model();await item.check();item.choose("network","a");item.choose("provider","a-mail");item.choose("softwareVersion","a1");assert.equal(item.choiceAvailable("network","b"),true);item.choose("network","b");assert.deepEqual(item.state().selections,{network:"b"});assert.equal(item.state().canSubmit,false);assert.equal(item.choiceAvailable("provider","b-mail"),true);item.choose("provider","b-mail");item.choose("softwareVersion","b2");item.setLanguage("ar");assert.equal(item.state().canSubmit,true);assert.equal(item.choiceAvailable("provider","a-mail"),false);
});
test("new forms replace cached paths from previous discoveries",async()=>{
 let current=form();const item=new ConnectionFormModel({async check(){return current;},async submit(){return pending();}});await item.check();item.choose("network","a");assert.equal(item.choiceAvailable("provider","b-mail"),false);
 current=form();if(current.status!=="customer-input-required")throw new Error("EXPECTED_FORM");current.form.fields[2].options=[{id:"new",label:"New",value:"3",requires:{network:"a",provider:"b-mail"}}];await item.check();item.choose("network","a");assert.equal(item.choiceAvailable("provider","b-mail"),true);assert.equal(item.choiceAvailable("provider","a-mail"),false);
});
test("mounted dropdowns hide indirect dead-end choices and update after changing the network",async()=>{
 const {document}=parseHTML('<html><body><main id="connection"></main></body></html>'),container=document.getElementById("connection") as unknown as HTMLElement;
 const client=new ConnectionCheckClient("https://app.example/v1/connection",async()=>"token",async()=>new Response(JSON.stringify(form()),{headers:{"content-type":"application/json"}}));const mounted=mountConnectionAssistance(container,client);
 try{
  await new Promise<void>(resolve=>{const unsubscribe=mounted.model.subscribe(state=>{if(state.phase==="choosing"){queueMicrotask(()=>{unsubscribe();resolve();});}});});
  mounted.model.choose("network","a");assert.equal(container.querySelector<HTMLOptionElement>('select[name="provider"] option[value="b-mail"]')?.disabled,true);assert.equal(container.querySelector<HTMLOptionElement>('select[name="provider"] option[value="b-mail"]')?.hidden,true);
  mounted.model.choose("provider","a-mail");mounted.model.choose("softwareVersion","a1");mounted.model.choose("network","b");assert.equal(container.querySelector<HTMLOptionElement>('select[name="provider"] option[value="a-mail"]')?.disabled,true);assert.equal(container.querySelector<HTMLOptionElement>('select[name="provider"] option[value="b-mail"]')?.disabled,false);assert.deepEqual(mounted.model.state().selections,{network:"b"});
 }finally{mounted.dispose();}
});
