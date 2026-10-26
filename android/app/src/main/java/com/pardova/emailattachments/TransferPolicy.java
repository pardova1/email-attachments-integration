package com.pardova.emailattachments;

final class TransferPolicy {
    // Matches src/domain/transfer-limits.ts. Server validation remains authoritative.
    static final long MAX_BYTES = 500L * 1024 * 1024 * 1024;
    private TransferPolicy() {}

    static boolean acceptsKnownSize(Long bytes) {
        return bytes == null || (bytes > 0 && bytes <= MAX_BYTES);
    }
}
