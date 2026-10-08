import type { TransferSession } from "../domain/transfer.js";
import type { TransferLane } from "../scaling/transfer-lane.js";
import type { TransferStateRepository } from "../ports/transfer-state-repository.js";
import { fromPersistedTransferState,toPersistedTransferState } from "../persistence/transfer-state-mapper.js";

export class DurableTransferStateService {
 constructor(private readonly repository:TransferStateRepository) {}

 async create(session:TransferSession,lane:TransferLane) {
  const state=toPersistedTransferState(session,lane.laneId);
  await this.repository.create(state);
  return state;
 }

 async save(session:TransferSession,lane:TransferLane) {
  for(let attempt=0;attempt<3;attempt++) {
   const current=await this.repository.get(session.id);
   if(!current) throw new Error("TRANSFER_STATE_NOT_FOUND");
   const deadline=new Date(current.downloadExpiresAt??current.uploadExpiresAt).getTime();
   if(current.status==="expired"||!Number.isFinite(deadline)||deadline<=Date.now()) throw new Error("TRANSFER_EXPIRED");
   if(current.status==="available"||current.status==="verified") {
    if(session.status!=="complete") throw new Error("TRANSFER_ALREADY_COMPLETE");
    return current;
   }
   const next=toPersistedTransferState(session,lane.laneId,current);
   next.confirmedParts=[...new Set([...current.confirmedParts,...next.confirmedParts])].sort((a,b)=>a-b);
   try {
    return await this.repository.save(next,current.version);
   } catch(error) {
    if(error instanceof Error && error.message==="TRANSFER_STATE_VERSION_CONFLICT" && attempt<2) continue;
    throw error;
   }
  }
  throw new Error("TRANSFER_STATE_VERSION_CONFLICT");
 }

 async setKeyReference(transferId:string,keyReference:string) {
  if(!keyReference) throw new Error("TRANSFER_KEY_REFERENCE_REQUIRED");
  for(let attempt=0;attempt<3;attempt++) {
   const current=await this.repository.get(transferId);
   if(!current) throw new Error("TRANSFER_STATE_NOT_FOUND");
   const deadline=new Date(current.downloadExpiresAt??current.uploadExpiresAt).getTime();
   if(current.status==="expired"||!Number.isFinite(deadline)||deadline<=Date.now()) throw new Error("TRANSFER_EXPIRED");
   if(current.keyReference) {
    if(current.keyReference!==keyReference) throw new Error("TRANSFER_KEY_REFERENCE_IMMUTABLE");
    return current;
   }
   if(current.status==="available"||current.status==="verified") throw new Error("TRANSFER_ALREADY_COMPLETE");
   try {
    return await this.repository.save({...current,keyReference},current.version);
   } catch(error) {
    if(error instanceof Error && error.message==="TRANSFER_STATE_VERSION_CONFLICT" && attempt<2) continue;
    throw error;
   }
  }
  throw new Error("TRANSFER_STATE_VERSION_CONFLICT");
 }

 async expire(transferId:string) {
  const current=await this.repository.get(transferId);
  if(!current) throw new Error("TRANSFER_STATE_NOT_FOUND");
  if(current.status==="expired") return current;
  return this.repository.save({...current,status:"expired"},current.version);
 }

 async expireIfDue(transferId:string,cutoff:Date) {
  const current=await this.repository.get(transferId);
  if(!current) return undefined;
  if(current.status==="expired") return current;
  const deadline=new Date(current.downloadExpiresAt??current.uploadExpiresAt).getTime();
  if(!Number.isFinite(deadline)||deadline>cutoff.getTime()) return undefined;
  // The version check prevents a concurrent completion from losing its new download window.
  return this.repository.save({...current,status:"expired"},current.version);
 }

 async restore(transferId:string) {
  const state=await this.repository.get(transferId);
  if(!state) throw new Error("TRANSFER_NOT_FOUND");
  return {
   session:fromPersistedTransferState(state),
   lane:{
    laneId:state.laneId,
    transferId:state.transferId,
    isolationKey:`transfer:${state.transferId}`,
    maxParallelParts:8,
    state:state.status==="available"?"complete":state.status==="recovering"?"recovering":"active",
    createdAt:new Date(state.createdAt)
   } satisfies TransferLane,
   persisted:state
  };
 }
}
