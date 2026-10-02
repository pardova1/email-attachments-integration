export type EmailIntegrationFamily =
  | "smtp-submission"
  | "jmap-submission"
  | "provider-api"
  | "desktop-client-extension"
  | "browser-compose-extension"
  | "mobile-share-compose-integration"
  | "enterprise-mail-gateway"
  | "future-standard";

export interface EmailIntegrationCord {
  id: string;
  family: EmailIntegrationFamily;
  providerOrStandard: string;
  available: boolean;
  authorized: boolean;
  supportsComposeAttachmentHook: boolean;
  priority: number;
}

export interface EmailEnvironment {
  provider?: string;
  client?: string;
  platform?: string;
}

export class EmailIntegrationDirector {
  constructor(private readonly cords: EmailIntegrationCord[]) {}

  select(environment: EmailEnvironment): EmailIntegrationCord {
    const eligible = this.cords
      .filter(c => c.available && c.authorized)
      .sort((a,b) =>
        Number(b.supportsComposeAttachmentHook) - Number(a.supportsComposeAttachmentHook) ||
        b.priority - a.priority
      );

    if (!eligible.length) throw new Error("NO_AUTHORIZED_EMAIL_INTEGRATION_CORD");
    return eligible[0];
  }

  registerCord(cord: EmailIntegrationCord) {
    if (this.cords.some(c => c.id === cord.id)) throw new Error("EMAIL_INTEGRATION_CORD_EXISTS");
    this.cords.push(cord);
  }

  coverage() {
    return [...this.cords];
  }
}
