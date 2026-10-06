import { verifySha256 } from "../security/checksum.js";
export function requireChunkSha256(data:Buffer,checksum:string|undefined){
  if(!checksum) throw new Error("CHUNK_SHA256_REQUIRED");
  verifySha256(data,checksum);
  return true as const;
}
