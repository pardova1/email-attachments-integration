import assert from "node:assert/strict";
import test from "node:test";
import { SenderTransferAccessService } from "../src/services/sender-transfer-access.js";
import { RecipientAccessService } from "../src/services/recipient-access.js";
import { issueTransferToken } from "../src/security/transfer-token.js";

test("sender token authorizes only its transfer and recipient token cannot authorize upload",()=>{
 const sender=new SenderTransferAccessService("test-secret");
 const recipient=new RecipientAccessService("test-secret");
 const deadline=new Date(Date.now()+60_000);
 const token=sender.issue("a",deadline);
 assert.equal(sender.verify(`Bearer ${token}`,"a").scope,"upload");
 assert.throws(()=>sender.verify(`Bearer ${token}`,"b"),/TOKEN_TRANSFER_MISMATCH/);
 assert.throws(()=>sender.verify(`Bearer ${recipient.issue("a",deadline)}`,"a"),/INVALID_TOKEN_SCOPE/);
 assert.throws(()=>recipient.verify(token,"a"),/INVALID_TOKEN_SCOPE/);
});

test("sender access rejects missing expired and forged credentials",()=>{
 const access=new SenderTransferAccessService("test-secret");
 assert.throws(()=>access.verify(undefined,"a"),/SENDER_TRANSFER_AUTHORIZATION_REQUIRED/);
 assert.throws(()=>access.verify("Bearer ","a"),/INVALID_TOKEN/);
 const expired=issueTransferToken({transferId:"a",scope:"upload",exp:1},"test-secret");
 assert.throws(()=>access.verify(`Bearer ${expired}`,"a"),/TOKEN_EXPIRED/);
 const forged=issueTransferToken({transferId:"a",scope:"upload",exp:Math.floor(Date.now()/1000)+60},"wrong-secret");
 assert.throws(()=>access.verify(`Bearer ${forged}`,"a"),/INVALID_TOKEN/);
 assert.throws(()=>access.issue("a",new Date("invalid")),/UPLOAD_WINDOW_EXPIRED/);
});
