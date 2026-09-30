export type NotificationChannel =
  | "in-app"
  | "device-notification"
  | "email";

export interface NotificationPreferences {
  deviceNotificationsEnabled: boolean;
  inAppNotificationsEnabled: boolean;
}

export interface NotificationMessage {
  userId: string;
  title: string;
  message: string;
  channels: NotificationChannel[];
}

export interface NotificationChannelAdapter {
  channel: NotificationChannel;
  send(notification: NotificationMessage): Promise<void>;
}

export class MultiChannelNotificationService {
  constructor(private readonly adapters: NotificationChannelAdapter[]) {}

  async notifyServiceEvent(
    notification: Omit<NotificationMessage, "channels">,
    preferences: NotificationPreferences
  ) {
    // Email is mandatory for service/incident notifications and cannot be
    // disabled by device-notification preferences.
    const channels: NotificationChannel[] = ["email"];
    if (preferences.inAppNotificationsEnabled) channels.push("in-app");
    if (preferences.deviceNotificationsEnabled) channels.push("device-notification");

    const requested = new Set(channels);
    const results = [];
    for (const adapter of this.adapters) {
      if (!requested.has(adapter.channel)) continue;
      try {
        await adapter.send({ ...notification, channels });
        results.push({ channel: adapter.channel, delivered: true });
      } catch {
        results.push({ channel: adapter.channel, delivered: false });
      }
    }
    return { requiredEmail: true as const, channels, results };
  }
}

// Device notifications map to the operating system notification facility
// (Android/iOS/Windows/macOS) and remain optional. Browser notification
// permission is also optional. Required service email is independent.
