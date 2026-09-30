export const PUBLIC_TECHNICAL_DIFFICULTIES_NOTICE =
  "Technical difficulties. Please try again later.";

export type AffectedRole = "sender" | "receiver";

export interface PublicResolutionNotice {
  role: AffectedRole;
  message: string;
}

export function resolutionNotice(role: AffectedRole): PublicResolutionNotice {
  return role === "sender"
    ? { role, message: "The technical issue has been resolved. You can resend your file now." }
    : { role, message: "The technical issue has been resolved. You can try downloading your file again now." };
}
