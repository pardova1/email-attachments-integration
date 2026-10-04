# Four-hour window visible in recipient email

The recipient email must clearly communicate the complete transfer window.

Example:

**⭐ IMPORTANT — 4-HOUR DOWNLOAD LIMIT**

Available from: 3:15 PM EDT — New York
Expires: 7:15 PM EDT — New York
Time remaining: 03:42:18

**Download File**

The authoritative start/end timestamps come from the backend after successful whole-file verification. Sender/receiver localization may show both parties' relevant local times.

Email-client limitation: ordinary email HTML cannot be assumed to execute a reliable second-by-second JavaScript timer across all providers and clients. Therefore the email always contains authoritative start and expiration times. Where a provider supports safe dynamic/interactive email capabilities, the remaining-time presentation may refresh using that supported mechanism. The secure transfer view uses the authoritative expiration to show a live countdown.

Security enforcement never depends on the visual email timer. When the backend reaches `downloadExpiresAt`, recipient access is denied and the transfer connection ends even if a previously opened/cached email still displays an older remaining-time value.

Expired state:

**🔴 Transfer Expired — 00:00:00**

**This transfer is no longer available. Please contact the sender to send the file again.**
