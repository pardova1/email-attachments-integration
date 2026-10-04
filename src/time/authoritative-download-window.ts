import { TRANSFER_EXPIRATION_MS } from "../domain/transfer.js";

export interface AuthoritativeDownloadWindow {
  downloadAvailableAt:string;
  downloadExpiresAt:string;
  durationHours:4;
}

export function createAuthoritativeDownloadWindow(verifiedAt=new Date()):AuthoritativeDownloadWindow {
  const expiresAt=new Date(verifiedAt.getTime()+TRANSFER_EXPIRATION_MS);
  return {
    downloadAvailableAt:verifiedAt.toISOString(),
    downloadExpiresAt:expiresAt.toISOString(),
    durationHours:4
  };
}

export function remainingDownloadTime(downloadExpiresAt:string,now=new Date()) {
  const expires=new Date(downloadExpiresAt);
  if (Number.isNaN(expires.getTime())) throw new Error("INVALID_DOWNLOAD_EXPIRATION");
  const remainingMs=Math.max(0,expires.getTime()-now.getTime());
  const totalSeconds=Math.floor(remainingMs/1000);
  return {
    remainingMs,
    countdown:[
      Math.floor(totalSeconds/3600),
      Math.floor((totalSeconds%3600)/60),
      totalSeconds%60
    ].map(v=>String(v).padStart(2,"0")).join(":"),
    expired:remainingMs===0
  };
}
