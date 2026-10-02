export type TransferProductPattern =
  | "standalone-upload"
  | "share-link"
  | "cloud-link"
  | "email-link"
  | "device-to-device"
  | "email-native-attachment-bridge";

export interface CompetitorObservation {
  product: string;
  observedAt: string;
  patterns: TransferProductPattern[];
  requiresSeparateTransferSurface: boolean;
  recipientUsesDownloadLink: boolean;
  preservesOriginalBytes?: boolean;
  notes: string[];
}

export interface DifferentiationAssessment {
  emailNativeAttachmentBridgeDistinct: boolean;
  exactIntegrityAloneDistinct: boolean;
  gapsToProtect: string[];
}

export class CompetitiveTransferIntelligenceAgent {
  assess(observations: CompetitorObservation[]): DifferentiationAssessment {
    return {
      emailNativeAttachmentBridgeDistinct: !observations.some(o =>
        o.patterns.includes("email-native-attachment-bridge") && !o.requiresSeparateTransferSurface
      ),
      exactIntegrityAloneDistinct: !observations.some(o => o.preservesOriginalBytes === true),
      gapsToProtect: [
        "ordinary written-email composition remains the transaction surface",
        "sender uses the familiar attachment action rather than a separate upload workflow",
        "large-file transport is handled behind the email integration where platform APIs permit",
        "each transfer receives an isolated intelligent lane and automated recovery",
        "recipient does not need the sender application to receive",
        "final success requires cryptographic equality with sender-original bytes"
      ]
    };
  }
}
