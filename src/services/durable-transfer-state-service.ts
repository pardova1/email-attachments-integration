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
  const current=await this.repository.get(session.id);
  if(!current) throw new Error("TRANSFER_STATE_NOT_FOUND");
  const next=toPersistedTransferState(session,lane.laneId,current);
  return this.repository.save(next,current.version);
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
