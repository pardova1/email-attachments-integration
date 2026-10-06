import type { TransferSession } from "../domain/transfer.js";
import type { PersistedTransferState,PersistedTransferStatus } from "../ports/transfer-state-repository.js";

const persistedStatus=(status:TransferSession["status"]):PersistedTransferStatus=>
 status==="complete"?"available":status;

export function toPersistedTransferState(
 session:TransferSession,laneId:string,previous?:PersistedTransferState
):PersistedTransferState {
 return {
  transferId:session.id,laneId,keyReference:previous?.keyReference,
  fileName:session.fileName,contentType:session.contentType,totalBytes:session.totalBytes,
  chunkBytes:session.chunkBytes,originalSha256:session.originalSha256,
  senderExpirationConfirmed:session.senderExpirationConfirmed,
  createdAt:session.createdAt.toISOString(),status:persistedStatus(session.status),
  confirmedParts:[...session.receivedParts].sort((a,b)=>a-b),
  partSha256:previous?.partSha256??{},activeStorageId:previous?.activeStorageId,
  lastVerifiedPart:previous?.lastVerifiedPart,
  uploadExpiresAt:session.uploadExpiresAt.toISOString(),
  downloadAvailableAt:session.downloadAvailableAt?.toISOString(),
  downloadExpiresAt:session.downloadExpiresAt?.toISOString(),
  updatedAt:previous?.updatedAt??session.createdAt.toISOString(),
  version:previous?.version??0
 };
}

export function fromPersistedTransferState(state:PersistedTransferState):TransferSession {
 const status:TransferSession["status"]=
  state.status==="available"||state.status==="verified"?"complete":
  state.status==="recovering"?"uploading":state.status;
 return {
  id:state.transferId,fileName:state.fileName,contentType:state.contentType,
  totalBytes:state.totalBytes,chunkBytes:state.chunkBytes,
  originalSha256:state.originalSha256,receivedParts:new Set(state.confirmedParts),
  status,createdAt:new Date(state.createdAt),uploadExpiresAt:new Date(state.uploadExpiresAt),
  downloadAvailableAt:state.downloadAvailableAt?new Date(state.downloadAvailableAt):null,
  downloadExpiresAt:state.downloadExpiresAt?new Date(state.downloadExpiresAt):null,
  senderExpirationConfirmed:state.senderExpirationConfirmed
 };
}
