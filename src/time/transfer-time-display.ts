export interface TransferPartyTime {
  locationLabel: string;
  timeZone: string;
}

export interface LocalizedTransferTime {
  location: string;
  timeZone: string;
  localTime: string;
  localDate: string;
  zoneName: string;
}

function localize(instant: Date, party: TransferPartyTime, locale = "en-US"): LocalizedTransferTime {
  const time = new Intl.DateTimeFormat(locale, {
    timeZone: party.timeZone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
    timeZoneName: "short"
  }).formatToParts(instant);

  const zoneName = time.find(p => p.type === "timeZoneName")?.value ?? party.timeZone;
  const localTime = new Intl.DateTimeFormat(locale, {
    timeZone: party.timeZone,
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true
  }).format(instant);

  const localDate = new Intl.DateTimeFormat(locale, {
    timeZone: party.timeZone,
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(instant);

  return { location: party.locationLabel, timeZone: party.timeZone, localTime, localDate, zoneName };
}

export function buildTransferTimeDisplay(
  expiresAt: Date,
  sender: TransferPartyTime,
  receiver: TransferPartyTime,
  now = new Date(),
  locale = "en-US"
) {
  const remainingMs = Math.max(0, expiresAt.getTime() - now.getTime());
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const countdown = [hours, minutes, seconds].map(v => String(v).padStart(2, "0")).join(":");

  return {
    authoritativeExpiresAt: expiresAt.toISOString(),
    countdown,
    expired: remainingMs === 0,
    senderNow: localize(now, sender, locale),
    receiverNow: localize(now, receiver, locale),
    senderExpiration: localize(expiresAt, sender, locale),
    receiverExpiration: localize(expiresAt, receiver, locale)
  };
}
