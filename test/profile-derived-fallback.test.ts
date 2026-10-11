import assert from "node:assert/strict";
import test from "node:test";
import {ExactSoftwareConnectionCatalog,type SoftwareConnectionProfile} from "../src/email/exact-software-connection-catalog.js";
import {CustomerConnectionFallback,CONNECTION_FIELDS} from "../src/email/customer-connection-fallback.js";
const now=new Date("2026-10-11T00:00:00Z"),environment={country:"NO",network:"network",provider:"mail-a",client:"browser",platform:"android",softwareVersion:"1"};
function profile(id:string,patch:Partial<typeof environment>={}):SoftwareConnectionProfile{return {id,environment:{...environment,...patch},reviewedAt:now.toISOString(),expiresAt:new Date(now.getTime()+60_000).toISOString(),sourceReference:"synthetic-profile",tools:{}};}
test("derived choices deduplicate prefixes and bind exact later fields to every earlier value",()=>{
 const catalog=new ExactSoftwareConnectionCatalog([profile("a"),profile("b",{provider:"mail-b",client:"other-app",platform:"ios",softwareVersion:"2"})],()=>now),choices=catalog.fallbackChoices();assert.equal(choices.country?.length,1);assert.equal(choices.network?.length,1);assert.equal(choices.provider?.length,2);assert.deepEqual(choices.softwareVersion?.[0].requires,{country:"NO",network:"network",provider:"mail-a",client:"browser",platform:"android"});
 const fallback=new CustomerConnectionFallback(known=>catalog.fallbackChoices(known),()=>now),form=fallback.prepare("sender-a",{},[...CONNECTION_FIELDS])!;const selections=Object.fromEntries(form.fields.map(field=>[field.key,field.options[0].id]));assert.deepEqual(fallback.resolve("sender-a",form.id,selections),environment);
});
test("all known software details constrain provider choices rather than country alone",()=>{
 const catalog=new ExactSoftwareConnectionCatalog([profile("a"),profile("b",{provider:"mail-b",client:"other-app",platform:"ios",softwareVersion:"2"})],()=>now),fallback=new CustomerConnectionFallback(known=>catalog.fallbackChoices(known),()=>now);
 const {provider:_provider,...known}=environment;const form=fallback.prepare("sender-a",{...known,provider:""},["provider"])!;assert.deepEqual(form.fields[0].options.map(option=>option.value),["mail-a"]);assert.equal(fallback.prepare("sender-a",{...known,softwareVersion:"unknown"},["provider"]),undefined);
});
test("new forms follow registration withdrawal and expiration while existing forms remain snapshots",()=>{
 let current=now;const catalog=new ExactSoftwareConnectionCatalog([profile("a")],()=>current),fallback=new CustomerConnectionFallback(known=>catalog.fallbackChoices(known),()=>current);const {provider:_provider,...known}=environment;
 const first=fallback.prepare("sender-a",known,["provider"])!;catalog.withdraw(environment);assert.equal(fallback.prepare("sender-a",known,["provider"]),undefined);assert.equal(fallback.resolve("sender-a",first.id,{provider:first.fields[0].options[0].id}).provider,"mail-a");
 catalog.register(profile("b",{provider:"mail-b"}));const next=fallback.prepare("sender-a",known,["provider"])!;assert.deepEqual(next.fields[0].options.map(option=>option.value),["mail-b"]);current=new Date(now.getTime()+60_000);assert.equal(fallback.prepare("sender-a",known,["provider"]),undefined);
});
test("choice snapshots cannot mutate the source catalog or another form",()=>{
 const catalog=new ExactSoftwareConnectionCatalog([profile("a")],()=>now),choices=catalog.fallbackChoices();choices.country![0].value="IR";choices.softwareVersion![0].requires!.client="changed";assert.equal(catalog.fallbackChoices().country![0].value,"NO");assert.equal(catalog.fallbackChoices().softwareVersion![0].requires!.client,"browser");
});
test("profile deadlines cap existing forms and renewal cannot extend an issued form",()=>{
 let current=now;const catalog=new ExactSoftwareConnectionCatalog([profile("a")],()=>current),fallback=new CustomerConnectionFallback(known=>catalog.fallbackChoices(known),()=>current);const {provider:_provider,...known}=environment;
 const first=fallback.prepare("sender-a",known,["provider"])!;assert.equal(first.expiresAt,profile("a").expiresAt);
 catalog.register({...profile("renewed"),expiresAt:new Date(now.getTime()+120_000).toISOString()});const next=fallback.prepare("sender-a",known,["provider"])!;assert.equal(next.expiresAt,new Date(now.getTime()+120_000).toISOString());
 current=new Date(now.getTime()+60_000);assert.throws(()=>fallback.resolve("sender-a",first.id,{provider:first.fields[0].options[0].id}),/CONNECTION_FORM_EXPIRED/);assert.equal(fallback.resolve("sender-a",next.id,{provider:next.fields[0].options[0].id}).provider,"mail-a");
});
test("shared prefixes last until their latest supporting profile but offered leaves cap the form",()=>{
 const later={...profile("b",{provider:"mail-b"}),expiresAt:new Date(now.getTime()+120_000).toISOString()};
 for(const profiles of [[profile("a"),later],[later,profile("a")]]){
  const catalog=new ExactSoftwareConnectionCatalog(profiles,()=>now),choices=catalog.fallbackChoices();assert.equal(choices.country![0].expiresAt,later.expiresAt);assert.equal(choices.network![0].expiresAt,later.expiresAt);
  const fallback=new CustomerConnectionFallback(known=>catalog.fallbackChoices(known),()=>now);assert.equal(fallback.prepare("sender-a",{},[...CONNECTION_FIELDS])!.expiresAt,profile("a").expiresAt);
 }
});
test("expired choices prune dependent paths while unrelated surviving choices retain the usual deadline",()=>{
 const fallback=new CustomerConnectionFallback({provider:[{id:"old",label:"old",value:"old",expiresAt:now.toISOString()},{id:"live",label:"live",value:"mail-a"}],client:[{id:"old-client",label:"old",value:"old",requires:{provider:"old"}},{id:"live-client",label:"live",value:"browser",requires:{provider:"mail-a"}}]},()=>now);
 const {provider:_provider,client:_client,...known}=environment;const form=fallback.prepare("sender-a",known,["provider","client"])!;assert.deepEqual(form.fields.map(field=>field.options.map(option=>option.id)),[["live"],["live-client"]]);assert.equal(form.expiresAt,new Date(now.getTime()+900_000).toISOString());
 assert.equal(new CustomerConnectionFallback({provider:[{id:"old",label:"old",value:"old",expiresAt:now.toISOString()}]},()=>now).prepare("sender-a",known,["provider"]),undefined);
});
test("malformed choice expiry is rejected and long expiries cannot exceed the form lifetime",()=>{
 for(const expiresAt of ["invalid",123 as unknown as string])assert.throws(()=>new CustomerConnectionFallback({provider:[{id:"a",label:"a",value:"mail-a",expiresAt}]}),/INVALID_CONNECTION_CHOICE_CATALOG/);
 const fallback=new CustomerConnectionFallback({provider:[{id:"a",label:"a",value:"mail-a",expiresAt:new Date(now.getTime()+3600_000).toISOString()}]},()=>now);const {provider:_provider,...known}=environment;assert.equal(fallback.prepare("sender-a",known,["provider"])!.expiresAt,new Date(now.getTime()+900_000).toISOString());
});
