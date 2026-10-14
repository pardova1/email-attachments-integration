// Shared browser/server limits; no platform-specific imports.
export const INITIAL_MAX_TRANSFER_BYTES = 500 * 1024 ** 3;
export const DEFAULT_CHUNK_BYTES = 64 * 1024 ** 2;
export const MAX_CHUNK_BYTES = DEFAULT_CHUNK_BYTES;

export const ACTIVE_TRANSFER_EXPIRATION_HOURS = 4;
export const TRANSFER_EXPIRATION_MS = ACTIVE_TRANSFER_EXPIRATION_HOURS * 60 * 60 * 1000;
