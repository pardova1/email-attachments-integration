export type NotificationChannel =
  | "in-app"
  | "device-notification"
  | "email";

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

  async notify(notification: Omit<NotificationMessage, "channels">, channels: NotificationChannel[] = ["in-app", "device-notification", "email"]) {
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
    return results;
  }
}

// Platform adapters map device-notification to the operating system's native
// notification facility (Android/iOS/Windows/macOS). Browser clients may use
// permitted web notifications. Permission must be obtained where the platform
// requires it; email remains an independent delivery path.
