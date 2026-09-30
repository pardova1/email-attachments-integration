export type ReceiverIssue =
  | "download-interrupted"
  | "repeated-connection-failure"
  | "insufficient-storage"
  | "network-offline"
  | "browser-restriction"
  | "permission-denied"
  | "unsupported-environment"
  | "unknown";

export interface ReceiverAssistance {
  actionRequired: boolean;
  title: string;
  message: string;
  recommendApplication: boolean;
  preserveTechnicalDetailsInBackend: true;
}

export function receiverAssistance(issue: ReceiverIssue): ReceiverAssistance {
  const base = { actionRequired: true, recommendApplication: false, preserveTechnicalDetailsInBackend: true as const };

  switch (issue) {
    case "download-interrupted":
      return { ...base, title: "Download interrupted", message: "There was a problem completing your download. Please retry the download." };
    case "repeated-connection-failure":
      return { ...base, title: "Connection assistance", recommendApplication: true, message: "For a more reliable and secure connection, please download the application and continue your transfer through the app. Your original file will not be changed." };
    case "insufficient-storage":
      return { ...base, title: "More storage needed", message: "Your device does not appear to have enough available storage for this file. Please free enough storage space, then retry the download." };
    case "network-offline":
      return { ...base, title: "Internet connection needed", message: "Your internet connection appears to be unavailable. Reconnect to the internet, then retry the download." };
    case "browser-restriction":
      return { ...base, title: "Browser download blocked", message: "Your browser appears to be blocking this download. Allow downloads for this transfer, then retry." };
    case "permission-denied":
      return { ...base, title: "Permission required", message: "Your device or browser has denied a permission needed to save the file. Allow the requested download or storage permission, then retry." };
    case "unsupported-environment":
      return { ...base, title: "Compatibility assistance", recommendApplication: true, message: "Your current browser or device environment cannot complete this transfer reliably. Please download the application for a supported transfer connection." };
    default:
      return { ...base, title: "Download needs attention", message: "We could not complete the download automatically. Please retry. If the problem continues, use the application for a more reliable connection." };
  }
}
