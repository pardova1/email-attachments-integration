import assert from "node:assert/strict"; import test from "node:test"; import { createHash } from "node:crypto";
import { VerifiedDownloadReader } from "../src/services/verified-download-reader.js";
import type { StoragePort } from "../src/ports/storage.js";
const original=Buffer.from("exact-original");
const session:any={id:"t1",totalBytes:original.length,chunkBytes:original.length,originalSha256:createHash("sha256").update(original).digest("hex")};
test("download reader releases exact stored bytes only after whole-file verification",async()=>{const s:any={async readPart(){return original;}};const parts=await new VerifiedDownloadReader(s).readVerified(session);assert.deepEqual(Buffer.concat(parts),original);});
test("download reader blocks bytes changed after upload verification",async()=>{const changed=Buffer.from("altered-bytes!");const s:any={async readPart(){return changed;}};await assert.rejects(()=>new VerifiedDownloadReader(s as StoragePort).readVerified(session),/FILE_INTEGRITY_COMMAND_VIOLATION/);});
