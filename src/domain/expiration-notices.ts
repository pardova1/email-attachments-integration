import { ACTIVE_TRANSFER_EXPIRATION_HOURS } from "./transfer.js";

export const senderExpirationNotice =
  `Please remember: the person receiving the file has ${ACTIVE_TRANSFER_EXPIRATION_HOURS} hours to download the files.`;

export const recipientExpirationNotice =
  `You received a large video/picture file. You have ${ACTIVE_TRANSFER_EXPIRATION_HOURS} hours to download it before it expires.`;
