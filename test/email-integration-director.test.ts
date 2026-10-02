import assert from "node:assert/strict";
import test from "node:test";
import { EmailIntegrationDirector } from "../src/email/email-integration-director.js";

test("director selects an authorized compose-aware cord", () => {
  const director = new EmailIntegrationDirector([
    {id:"smtp",family:"smtp-submission",providerOrStandard:"SMTP",available:true,authorized:true,supportsComposeAttachmentHook:false,priority:10},
    {id:"provider",family:"provider-api",providerOrStandard:"provider",available:true,authorized:true,supportsComposeAttachmentHook:true,priority:8}
  ]);
  assert.equal(director.select({provider:"provider"}).id,"provider");
});

test("new sending methods can be added as new cords", () => {
  const director = new EmailIntegrationDirector([]);
  director.registerCord({id:"future",family:"future-standard",providerOrStandard:"future",available:true,authorized:true,supportsComposeAttachmentHook:true,priority:1});
  assert.equal(director.coverage().length,1);
});
