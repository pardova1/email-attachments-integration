export type NetworkFamily =
  | "ipv4"
  | "ipv6"
  | "dual-stack"
  | "nat"
  | "carrier-grade-nat"
  | "proxy"
  | "vpn"
  | "unknown";

export type TransportCapability =
  | "tcp"
  | "tls"
  | "http2"
  | "http3-quic"
  | "websocket"
  | "provider-api"
  | "email-submission";

export interface NetworkObservation {
  transferId: string;
  laneId: string;
  networkFamily: NetworkFamily;
  availableTransports: TransportCapability[];
  estimatedRttMs?: number;
  packetLossRatio?: number;
  restrictedOutbound?: boolean;
}

export interface NetworkDecision {
  transferId: string;
  laneId: string;
  preferredTransport: TransportCapability;
  preservePrivateLane: true;
  inspectPayloadContent: false;
  reason: string;
}

export class NetworkProtocolIntelligenceAgent {
  decide(input: NetworkObservation): NetworkDecision {
    const preference: TransportCapability[] = [
      "http3-quic","http2","tls","tcp","provider-api","email-submission","websocket"
    ];
    const preferred = preference.find(p => input.availableTransports.includes(p));
    if (!preferred) throw new Error("NO_SUPPORTED_NETWORK_TRANSPORT");

    return {
      transferId:input.transferId,
      laneId:input.laneId,
      preferredTransport:preferred,
      preservePrivateLane:true,
      inspectPayloadContent:false,
      reason:`Selected from observed authorized capabilities for ${input.networkFamily}`
    };
  }
}
