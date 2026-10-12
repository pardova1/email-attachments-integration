import assert from "node:assert/strict";
import test from "node:test";
import { EmailIntegrationDirector,type EmailIntegrationCord } from "../src/email/email-integration-director.js";

const environment={country:"NO",network:"test-network",provider:"provider",client:"test-client",platform:"android",softwareVersion:"1.0"};
const cord=(id="provider",priority=8):EmailIntegrationCord=>({id,family:"provider-api",providerOrStandard:"provider",available:true,authorized:true,supportsComposeAttachmentHook:true,priority,compatibleEnvironments:[environment]});

test("director selects an authorized compose-aware cord", () => {
  const director = new EmailIntegrationDirector([
    {id:"smtp",family:"smtp-submission",providerOrStandard:"SMTP",available:true,authorized:true,supportsComposeAttachmentHook:false,priority:10},
    cord()
  ]);
  assert.equal(director.select(environment).id,"provider");
});

test("new sending methods can be added as new cords", () => {
  const director = new EmailIntegrationDirector([]);
  director.registerCord({id:"future",family:"future-standard",providerOrStandard:"future",available:true,authorized:true,supportsComposeAttachmentHook:true,priority:1});
  assert.equal(director.coverage().length,1);
});


test("a higher ranked method for different software cannot win exact environment routing",()=>{
 const wrong={...cord("wrong",100),compatibleEnvironments:[{...environment,softwareVersion:"2.0"}]};
 const director=new EmailIntegrationDirector([wrong,cord("exact",1)]);
 assert.equal(director.select(environment).id,"exact");
 for(const field of ["country","network","provider","client","platform","softwareVersion"] as const){
  const changed={...environment,[field]:field==="country"?"SE":"other"};
  assert.throws(()=>director.select(changed),/NO_AUTHORIZED_EMAIL_INTEGRATION_CORD/);
 }
});
test("generic protocol and provider metadata alone cannot establish compatible routing",()=>{
 const generic=cord();delete generic.compatibleEnvironments;
 const director=new EmailIntegrationDirector([generic]);
 assert.equal(director.coverage().length,1);assert.throws(()=>director.select(environment),/NO_AUTHORIZED_EMAIL_INTEGRATION_CORD/);
});
test("incomplete wildcard and malformed environment routing fails closed",()=>{
 const director=new EmailIntegrationDirector([cord()]);
 for(const field of ["country","network","provider","client","platform","softwareVersion"] as const){
  for(const invalid of [undefined,"","*","bad\nvalue",42])assert.throws(()=>director.select({...environment,[field]:invalid} as unknown as typeof environment),/CONNECTION_ENVIRONMENT_REQUIRED/);
  assert.throws(()=>new EmailIntegrationDirector([{...cord(),compatibleEnvironments:[{...environment,[field]:"*"}]}]),/CONNECTION_ENVIRONMENT_REQUIRED/);
 }
});
test("routing normalizes country and whitespace while preserving exact software case and version",()=>{
 const director=new EmailIntegrationDirector([cord()]);
 assert.equal(director.select({...environment,country:" no ",client:" test-client ",softwareVersion:" 1.0 "}).id,"provider");
 assert.throws(()=>director.select({...environment,client:"TEST-CLIENT"}),/NO_AUTHORIZED_EMAIL_INTEGRATION_CORD/);
 assert.throws(()=>director.select({...environment,softwareVersion:"1"}),/NO_AUTHORIZED_EMAIL_INTEGRATION_CORD/);
});
test("input and returned cord mutations cannot change internal routing or authorization",()=>{
 const input=cord(),director=new EmailIntegrationDirector([input]);
 input.authorized=false;input.compatibleEnvironments![0]={...environment,country:"SE"};
 const selected=director.select(environment);selected.authorized=false;selected.compatibleEnvironments![0].softwareVersion="2.0";
 const coverage=director.coverage();coverage[0].available=false;coverage[0].compatibleEnvironments!.length=0;
 assert.equal(director.select(environment).authorized,true);assert.equal(director.select(environment).available,true);
});
test("withdrawn unauthorized or unavailable methods cannot be selected",()=>{
 const director=new EmailIntegrationDirector([cord("preferred",10),cord("fallback",1),{...cord("unauthorized",100),authorized:false},{...cord("unavailable",100),available:false}]);
 assert.equal(director.select(environment).id,"preferred");assert.equal(director.unregisterCord("preferred"),true);assert.equal(director.select(environment).id,"fallback");
 director.unregisterCord("fallback");assert.throws(()=>director.select(environment),/NO_AUTHORIZED_EMAIL_INTEGRATION_CORD/);assert.equal(director.unregisterCord("missing"),false);
});
test("invalid and duplicate cord registration cannot replace existing coverage",()=>{
 const director=new EmailIntegrationDirector([cord()]);
 assert.throws(()=>director.registerCord(cord()),/EMAIL_INTEGRATION_CORD_EXISTS/);
 assert.throws(()=>new EmailIntegrationDirector([cord(),cord()]),/EMAIL_INTEGRATION_CORD_EXISTS/);
 for(const invalid of [{id:" "},{priority:NaN},{authorized:"yes"},{compatibleEnvironments:{}}])assert.throws(()=>director.registerCord({...cord("bad"),...invalid} as EmailIntegrationCord),/INVALID_EMAIL_INTEGRATION_CORD/);
 assert.equal(director.select(environment).id,"provider");assert.equal(director.coverage().length,1);
});
