package com.pardova.emailattachments;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import org.junit.Test;
import static org.junit.Assert.*;

public final class FilePreparationTest {
    private final FilePreparation preparation = new FilePreparation(8, 2);

    @Test public void computesKnownSha256AcrossChunksAndPreservesInput() throws Exception {
        byte[] bytes = "abc".getBytes(StandardCharsets.UTF_8);
        List<Long> progress = new ArrayList<>();
        FilePreparation.Result result = preparation.prepare(() -> new ByteArrayInputStream(bytes),
                3L, true, new FilePreparation.Cancellation(), progress::add);
        assertEquals(3L, result.totalBytes);
        assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", result.sha256);
        assertArrayEquals(new byte[]{97, 98, 99}, bytes);
        assertEquals(java.util.Arrays.asList(2L, 3L), progress);
    }

    @Test public void requiresConsentAndValidSizeBeforeOpeningAnything() {
        AtomicBoolean opened = new AtomicBoolean();
        FilePreparation.Source source = () -> { opened.set(true); return new ByteArrayInputStream(new byte[1]); };
        assertThrows(IllegalArgumentException.class, () -> preparation.prepare(source, 1L, false,
                new FilePreparation.Cancellation(), ignored -> {}));
        for (long size : new long[]{0, -1, 9, Long.MAX_VALUE}) {
            assertThrows(IOException.class, () -> preparation.prepare(source, size, true,
                    new FilePreparation.Cancellation(), ignored -> {}));
        }
        FilePreparation.Cancellation cancelled = new FilePreparation.Cancellation();
        cancelled.request();
        assertThrows(InterruptedIOException.class, () -> preparation.prepare(source, null, true,
                cancelled, ignored -> {}));
        assertFalse(opened.get());
    }

    @Test public void binaryBytesAreHashedWithoutTextConversion() throws Exception {
        byte[] binary = {0, (byte) 255, 13, 10};
        FilePreparation.Result result = preparation.prepare(() -> new ByteArrayInputStream(binary),
                4L, true, new FilePreparation.Cancellation(), ignored -> {});
        assertEquals("e9489f37fb3051e9efa1dc916004d7274e7b63975e3209708947267f2393a9be", result.sha256);
        assertArrayEquals(new byte[]{0, (byte) 255, 13, 10}, binary);
    }

    @Test public void rejectsChangedEmptyAndOversizedStreamsEvenWithUnknownMetadata() throws Exception {
        assertEquals(8L, preparation.prepare(() -> new ByteArrayInputStream(new byte[8]), null,
                true, new FilePreparation.Cancellation(), ignored -> {}).totalBytes);
        for (int size : new int[]{0, 9}) {
            assertThrows(IOException.class, () -> preparation.prepare(() -> new ByteArrayInputStream(new byte[size]),
                    null, true, new FilePreparation.Cancellation(), ignored -> {}));
        }
        for (long expected : new long[]{2, 4}) {
            assertThrows(IOException.class, () -> preparation.prepare(() -> new ByteArrayInputStream(new byte[3]),
                    expected, true, new FilePreparation.Cancellation(), ignored -> {}));
        }
    }

    @Test public void cancellationAfterProgressClosesStreamAndNeverReturnsSuccess() {
        AtomicBoolean closed = new AtomicBoolean();
        FilePreparation.Cancellation cancellation = new FilePreparation.Cancellation();
        InputStream input = new ByteArrayInputStream(new byte[8]) {
            @Override public void close() { closed.set(true); }
        };
        assertThrows(InterruptedIOException.class, () -> preparation.prepare(() -> input, null,
                true, cancellation, ignored -> cancellation.request()));
        assertTrue(closed.get());
    }

    @Test public void closingCancelledBlockedReadReleasesWorkerWithoutPublishingResult() throws Exception {
        CountDownLatch reading = new CountDownLatch(1), closed = new CountDownLatch(1);
        InputStream blocked = new InputStream() {
            @Override public int read() { throw new AssertionError("Must use bounded bulk reads"); }
            @Override public int read(byte[] buffer, int offset, int length) throws IOException {
                reading.countDown();
                try {
                    if (!closed.await(3, TimeUnit.SECONDS)) throw new IOException("Test timeout");
                    return -1;
                } catch (InterruptedException interrupted) { throw new InterruptedIOException(); }
            }
            @Override public void close() { closed.countDown(); }
        };
        FilePreparation.Cancellation cancellation = new FilePreparation.Cancellation();
        ExecutorService worker = Executors.newSingleThreadExecutor();
        try {
            Future<FilePreparation.Result> result = worker.submit(() -> preparation.prepare(() -> blocked,
                    null, true, cancellation, ignored -> {}));
            assertTrue(reading.await(3, TimeUnit.SECONDS));
            cancellation.request();
            cancellation.closeInput();
            ExecutionException error = assertThrows(ExecutionException.class, () -> result.get(3, TimeUnit.SECONDS));
            assertTrue(error.getCause() instanceof InterruptedIOException);
        } finally {
            cancellation.request();
            cancellation.closeInput();
            worker.shutdownNow();
        }
    }

    @Test public void readFailureClosesStreamAndDoesNotProduceADigest() {
        AtomicBoolean closed = new AtomicBoolean();
        InputStream broken = new InputStream() {
            @Override public int read() throws IOException { throw new IOException("Unavailable"); }
            @Override public void close() { closed.set(true); }
        };
        assertThrows(IOException.class, () -> preparation.prepare(() -> broken, null, true,
                new FilePreparation.Cancellation(), ignored -> {}));
        assertTrue(closed.get());
    }
}
