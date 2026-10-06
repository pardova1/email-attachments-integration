import assert from "node:assert/strict";
import test from "node:test";
import { fromPersistedTransferState,toPersistedTransferState } from "../src/persistence/transfer-state-mapper.js";

test("restores same transfer identity lane-related timing and verified parts",()=>{
 const state={
  transferId:"t1",laneId:"lane-1",fileName:"video.mp4",contentType:"video/mp4",
  totalBytes:100,chunkBytes:50,originalSha256:"a".repeat(64),senderExpirationConfirmed:true,
  createdAt:"2026-10-05T10:00:00.000Z",status:"available" as const,
  confirmedParts:[1,2],partSha256:{},uploadExpiresAt:"2026-10-05T14:00:00.000Z",
  downloadAvailableAt:"2026-10-05T12:00:00.000Z",downloadExpiresAt:"2026-10-05T16:00:00.000Z",
  updatedAt:"2026-10-05T12:00:00.000Z",version:3
 };
 const session=fromPersistedTransferState(state);
 assert.equal(session.id,"t1");
 assert.equal(session.status,"complete");
 assert.equal(session.downloadExpiresAt?.toISOString(),"2026-10-05T16:00:00.000Z");
 assert.deepEqual([...session.receivedParts],[1,2]);
 const roundTrip=toPersistedTransferState(session,state.laneId,state);
 assert.equal(roundTrip.transferId,state.transferId);
 assert.equal(roundTrip.laneId,state.laneId);
 assert.equal(roundTrip.downloadExpiresAt,state.downloadExpiresAt);
 assert.equal(roundTrip.version,3);
});
