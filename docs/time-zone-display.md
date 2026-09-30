# Transfer time-zone display

Every transfer uses one authoritative server expiration instant. Sender and receiver clock displays are localized views of that same instant.

The receiver notice must show:
- the 4-hour download limit
- live HH:MM:SS countdown
- AM/PM local clock time
- sender location and time zone
- receiver location and time zone
- sender-local expiration date/time
- receiver-local expiration date/time

Use IANA time-zone identifiers so daylight-saving changes and international date boundaries are handled correctly. Do not infer a time zone from a US state alone because some states span multiple zones.

Location information must come from authorized/account/device context and should be limited to what is needed for clear time-zone communication. Precise street location is not required.

The server expiration instant controls access. Changing a device clock or displayed time cannot extend the transfer.
