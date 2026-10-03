import assert from "node:assert/strict";
import test from "node:test";
import { NetworkProtocolIntelligenceAgent } from "../src/network/network-protocol-intelligence-agent.js";

test("agent chooses modern eligible transport without changing lane",()=>{
  const d=new NetworkProtocolIntelligenceAgent().decide({
    transferId:"t1",laneId:"l1",networkFamily:"dual-stack",
    availableTransports:["http2","http3-quic","tcp"]
  });
  assert.equal(d.preferredTransport,"http3-quic");
  assert.equal(d.preservePrivateLane,true);
  assert.equal(d.inspectPayloadContent,false);
});
