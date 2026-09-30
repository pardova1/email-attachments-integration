import assert from "node:assert/strict";
import test from "node:test";
import { MemoryStorage } from "../src/adapters/memory-storage.js";
import { TransferService } from "../src/services/transfer-service.js";
import { ACTIVE_TRANSFER_EXPIRATION_HOURS } from "../src/domain/transfer.js";

test("requires sender confirmation before creating a transfer", () => {
  const service = new TransferService(new MemoryStorage());
  assert.throws(() => service.create({
    fileName: "video.mp4",
    contentType: "video/mp4",
    totalBytes: 10,
    senderExpirationConfirmed: false
  }), /EXPIRATION_CONFIRMATION_REQUIRED/);
});

test("creates a confirmed transfer with a four-hour window", () => {
  const service = new TransferService(new MemoryStorage());
  const t = service.create({
    fileName: "video.mp4",
    contentType: "video/mp4",
    totalBytes: 10,
    senderExpirationConfirmed: true
  });
  assert.equal(ACTIVE_TRANSFER_EXPIRATION_HOURS, 4);
  assert.equal(t.senderExpirationConfirmed, true);
  assert.equal(t.expiresAt.getTime() - t.createdAt.getTime(), 4 * 60 * 60 * 1000);
});

test("resumes by tracking uploaded parts and completes", async () => {
  const service = new TransferService(new MemoryStorage());
  const t = service.create({
    fileName: "video.mp4",
    contentType: "video/mp4",
    totalBytes: 10,
    chunkBytes: 5,
    senderExpirationConfirmed: true
  });

  await service.uploadPart(t.id, 1, Buffer.from("12345"));
  assert.equal(service.status(t.id).percent, 50);

  await service.uploadPart(t.id, 2, Buffer.from("67890"));
  assert.equal(service.status(t.id).percent, 100);

  const done = await service.complete(t.id);
  assert.equal(done.status, "complete");
});

test("rejects transfers above the initial 500 GB product target", () => {
  const service = new TransferService(new MemoryStorage());
  assert.throws(() => service.create({
    fileName: "huge.bin",
    contentType: "application/octet-stream",
    totalBytes: 500 * 1024 ** 3 + 1,
    senderExpirationConfirmed: true
  }), /TRANSFER_SIZE_NOT_SUPPORTED/);
});
