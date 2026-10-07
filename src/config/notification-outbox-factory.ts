import type { NotificationOutbox } from "../email/notification-outbox.js";
import { MemoryNotificationOutbox } from "../adapters/memory-notification-outbox.js";
import { SupabaseNotificationOutbox } from "../adapters/supabase-notification-outbox.js";
export function createNotificationOutbox(env:NodeJS.ProcessEnv=process.env):NotificationOutbox{
 const url=env.SUPABASE_URL,secretKey=env.SUPABASE_SECRET_KEY;
 if(url&&secretKey)return new SupabaseNotificationOutbox(url,secretKey);
 if(env.NODE_ENV==="production")throw new Error("DURABLE_NOTIFICATION_OUTBOX_NOT_CONFIGURED");
 return new MemoryNotificationOutbox();
}
