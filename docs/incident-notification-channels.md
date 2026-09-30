# Incident notification channels

Affected users should receive service incident and resolution notices through every available authorized channel:

1. In-app notification center.
2. Native device/operating-system notification area on Android, iOS/iPadOS, Windows, and macOS.
3. Email.

Browser clients may also use web notifications when the user/browser has granted permission.

Native device notifications require the operating system's notification permission and a platform delivery adapter. The application must not bypass disabled notification permissions.

If a channel is unavailable or delivery fails, other configured channels continue independently. Email therefore remains an important fallback.

Public incident messages remain simple and must never expose staff-only diagnostics. Only users recorded as affected by the incident receive resolution notifications.
