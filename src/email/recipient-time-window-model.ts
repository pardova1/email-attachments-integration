import { remainingDownloadTime } from "../time/authoritative-download-window.js";

export interface RecipientEmailTimeWindow {
  availableFrom:string;
  expiresAt:string;
  timeRemaining:string;
  status:"AVAILABLE"|"EXPIRED";
  connectionAllowed:boolean;
}

export function recipientEmailTimeWindow(
  downloadAvailableAt:string,
  downloadExpiresAt:string,
  now=new Date()
):RecipientEmailTimeWindow {
  const remaining=remainingDownloadTime(downloadExpiresAt,now);
  return {
    availableFrom:downloadAvailableAt,
    expiresAt:downloadExpiresAt,
    timeRemaining:remaining.countdown,
    status:remaining.expired ? "EXPIRED" : "AVAILABLE",
    connectionAllowed:!remaining.expired
  };
}
