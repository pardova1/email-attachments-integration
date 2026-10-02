import assert from "node:assert/strict";
import test from "node:test";
import { LaneAccessGuard } from "../src/security/lane-access-guard.js";

const lane={transferId:"t1",laneId:"l1",senderSubjectId:"sender",receiverSubjectId:"receiver"};
const guard=new LaneAccessGuard();

test("another transfer cannot enter a private lane",()=>{
  const d=guard.authorize(lane,{transferId:"t2",laneId:"l1",subjectId:"sender",purpose:"sender-upload"});
  assert.equal(d.allowed,false);
  assert.equal(d.payloadAccess,false);
});

test("business oversight cannot access payload",()=>{
  const d=guard.authorize(lane,{transferId:"t1",laneId:"l1",subjectId:"business-admin",purpose:"business-metadata-oversight"});
  assert.equal(d.allowed,true);
  assert.equal(d.payloadAccess,false);
});

test("authorized receiver can access its own lane",()=>{
  const d=guard.authorize(lane,{transferId:"t1",laneId:"l1",subjectId:"receiver",purpose:"receiver-download"});
  assert.equal(d.allowed,true);
  assert.equal(d.payloadAccess,true);
});
