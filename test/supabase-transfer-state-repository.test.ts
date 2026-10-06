import assert from "node:assert/strict";
import test from "node:test";
import { SupabaseTransferStateRepository } from "../src/adapters/supabase-transfer-state-repository.js";

const base = {
  transferId: "t1", laneId: "lane-1", fileName: "video.mp4", contentType: "video/mp4",
  totalBytes: 10, chunkBytes: 5, originalSha256: "a".repeat(64), senderExpirationConfirmed: true,
  createdAt: "2026-10-06T00:00:00.000Z", status: "uploading" as const, confirmedParts: [1],
  partSha256: { 1: "b".repeat(64) }, uploadExpiresAt: "2026-10-06T04:00:00.000Z",
  updatedAt: "2026-10-06T00:01:00.000Z", version: 1
};

test("maps Supabase row back to durable transfer state", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify([{
    transfer_id:"t1",lane_id:"lane-1",key_reference:null,file_name:"video.mp4",content_type:"video/mp4",
    total_bytes:"10",chunk_bytes:5,original_sha256:"a".repeat(64),sender_expiration_confirmed:true,
    created_at:base.createdAt,status:"uploading",confirmed_parts:[1],part_sha256:{"1":"b".repeat(64)},
    active_storage_id:null,last_verified_part:null,upload_expires_at:base.uploadExpiresAt,
    download_available_at:null,download_expires_at:null,updated_at:base.updatedAt,version:1
  }]), { status: 200, headers: { "content-type":"application/json" } });
  try {
    const repo = new SupabaseTransferStateRepository({ url:"https://example.supabase.co", secretKey:"secret" });
    const state = await repo.get("t1");
    assert.equal(state?.laneId, "lane-1");
    assert.equal(state?.totalBytes, 10);
    assert.deepEqual(state?.partSha256, { 1: "b".repeat(64) });
  } finally { globalThis.fetch = original; }
});

test("save rejects stale optimistic version", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return new Response("[]", { status:200, headers:{"content-type":"application/json"} });
    return new Response(JSON.stringify([{ transfer_id:"t1",lane_id:"lane-1",key_reference:null,file_name:"video.mp4",content_type:"video/mp4",total_bytes:"10",chunk_bytes:5,original_sha256:"a".repeat(64),sender_expiration_confirmed:true,created_at:base.createdAt,status:"uploading",confirmed_parts:[1],part_sha256:{"1":"b".repeat(64)},active_storage_id:null,last_verified_part:null,upload_expires_at:base.uploadExpiresAt,download_available_at:null,download_expires_at:null,updated_at:base.updatedAt,version:2 }]), {status:200,headers:{"content-type":"application/json"}});
  };
  try {
    const repo = new SupabaseTransferStateRepository({ url:"https://example.supabase.co", secretKey:"secret" });
    await assert.rejects(repo.save(base, 1), /TRANSFER_STATE_VERSION_CONFLICT/);
  } finally { globalThis.fetch = original; }
});
