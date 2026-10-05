import assert from "node:assert/strict";
import test from "node:test";
import { IntegrationCapabilityGateway } from "../src/integrations/integration-capability-gateway.js";

test("agent receives only an authorized operating adapter",()=>{
 const g=new IntegrationCapabilityGateway();
 g.register({id:"storage-api-a",capability:"storage",interfaceType:"api",authorized:true,operating:true,priority:10});
 g.register({id:"storage-mcp-b",capability:"storage",interfaceType:"mcp",authorized:false,operating:true,priority:20});
 const selected=g.resolve({agentId:"storage-director-agent",capability:"storage",allowedAdapterIds:["storage-api-a","storage-mcp-b"]});
 assert.equal(selected.id,"storage-api-a");
});

test("gateway refuses unavailable or unauthorized integrations",()=>{
 const g=new IntegrationCapabilityGateway();
 g.register({id:"email-api",capability:"email",interfaceType:"api",authorized:false,operating:true,priority:10});
 assert.throws(()=>g.resolve({agentId:"email-integration-director",capability:"email",allowedAdapterIds:["email-api"]}),/NO_AUTHORIZED_OPERATING_INTEGRATION/);
});
