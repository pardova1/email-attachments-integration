import assert from "node:assert/strict";
import test from "node:test";
import { AffectedPartyRegistry } from "../src/incidents/affected-party-registry.js";
import { ResolutionNotificationService } from "../src/incidents/resolution-notification-service.js";

test("resolution notifies only parties recorded as affected", async () => {
  const incidents = new AffectedPartyRegistry();
  const incident = incidents.open("t1", [
    { userId: "sender-1", role: "sender" },
    { userId: "receiver-1", role: "receiver" }
  ]);
  const sent: Array<{userId:string; message:string}> = [];
  const service = new ResolutionNotificationService(incidents, {
    async notify(userId, message) { sent.push({ userId, message }); }
  });
  const result = await service.resolveAndNotify(incident.incidentId);
  assert.equal(result.deliveries.length, 2);
  assert.match(sent.find(x => x.userId === "sender-1")!.message, /resend/i);
  assert.match(sent.find(x => x.userId === "receiver-1")!.message, /download/i);
  assert.equal(sent.some(x => x.userId === "unaffected-user"), false);
});
