package com.pardova.emailattachments;

import org.junit.Test;
import static org.junit.Assert.*;

public final class TransferPolicyTest {
    @Test public void acceptsLargeFilesWithoutIntegerOverflow() {
        assertTrue(TransferPolicy.acceptsKnownSize(TransferPolicy.MAX_BYTES));
        assertTrue(TransferPolicy.acceptsKnownSize(4L * 1024 * 1024 * 1024));
        assertFalse(TransferPolicy.acceptsKnownSize(TransferPolicy.MAX_BYTES + 1));
        assertFalse(TransferPolicy.acceptsKnownSize(Long.MAX_VALUE));
    }
    @Test public void distinguishesUnknownSizeFromEmptyOrInvalid() {
        assertTrue(TransferPolicy.acceptsKnownSize(null));
        assertFalse(TransferPolicy.acceptsKnownSize(0L));
        assertFalse(TransferPolicy.acceptsKnownSize(-1L));
        assertTrue(TransferPolicy.acceptsKnownSize(1L));
    }
}
