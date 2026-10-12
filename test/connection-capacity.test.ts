import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import {connectionConcurrency,connectionConcurrencyFromEnvironment} from "../src/config/connection-concurrency.js";
import {createConnectionCheckRouter} from "../src/http/connection-check-router.js";
import {createSenderTransferRouter} from "../src/http/sender-transfer-router.js";

test("capacity defaults and higher operator settings are validated without changing defaults",()=>{
 assert.deepEqual(connectionConcurrencyFromEnvironment({}),{perCustomer:1,total:100});
 assert.deepEqual(connectionConcurrencyFromEnvironment({CONNECTION_MAX_ACTIVE_TOTAL:"1000",CONNECTION_MAX_ACTIVE_PER_CUSTOMER:"10"}),{perCustomer:10,total:1000});
 for(const value of [""," ","1.5","1e3","-1","0","1001","NaN"]){assert.throws(()=>connectionConcurrencyFromEnvironment({CONNECTION_MAX_ACTIVE_TOTAL:value}),/INVALID_CONNECTION_CONCURRENCY/);}
 for(const value of [{total:1,perCustomer:2},{perCustomer:11},{total:Infinity},{perCustomer:0}])assert.throws(()=>connectionConcurrency(value),/INVALID_CONNECTION_CONCURRENCY/);
});

for(const kind of ["checks","transfers"] as const)test(`${kind} respects snapshotted customer and global capacity and releases failed slots`,async()=>{
 const concurrency={perCustomer:2,total:3};let calls=0;
 const entered:Array<()=>void>=[],release:Array<()=>void>=[];
 const waitForEntry=()=>new Promise<void>(resolve=>entered.push(resolve));
 const coordinatorFor=async()=>{calls++;entered.shift()?.();await new Promise<void>(resolve=>release.push(resolve));throw new Error("SYNTHETIC_UNAVAILABLE");};
 const authenticator={async authenticate(value:string|undefined){return {userId:value!.slice(7)};}};
 const app=express();app.use(express.json());
 app.use(kind==="checks"?createConnectionCheckRouter({authenticator,coordinatorFor,concurrency}):createSenderTransferRouter({authenticator,coordinatorFor,concurrency,sends:{async createForValidUser(){throw new Error("UNEXPECTED_CREATION");}},senderAccess:{issue(){throw new Error("UNEXPECTED_TOKEN");}}}));
 // Later configuration mutations cannot alter an already mounted router.
 concurrency.perCustomer=10;concurrency.total=1000;
 const server=app.listen(0,"127.0.0.1");await new Promise<void>(resolve=>server.once("listening",resolve));
 const address=server.address();assert.ok(address&&typeof address!=="string");
 const url=`http://127.0.0.1:${address.port}${kind==="checks"?"/check":"/"}`;
 const body=kind==="checks"?{}:{fileName:"photo.jpg",contentType:"image/jpeg",totalBytes:1024,originalSha256:"a".repeat(64),senderExpirationConfirmed:true};
 const post=(user:string)=>fetch(url,{method:"POST",headers:{authorization:`Bearer ${user}`,"content-type":"application/json"},body:JSON.stringify(body)});
 const pending:Array<Promise<Response>>=[];
 try{
  for(const user of ["a","a"]){const entry=waitForEntry();pending.push(post(user));await entry;}
  assert.equal((await post("a")).status,503);assert.equal(calls,2);
  const entry=waitForEntry();pending.push(post("b"));await entry;
  assert.equal((await post("c")).status,503);assert.equal(calls,3);
  release.shift()!();assert.equal((await pending.shift()!).status,503);
  const next=waitForEntry();pending.push(post("a"));await next;assert.equal(calls,4);
 }finally{
  for(const resolve of release)resolve();await Promise.all(pending);
  await new Promise<void>((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 }
});
