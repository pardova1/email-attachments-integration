package com.pardova.emailattachments;

import java.io.IOException;
import java.io.InputStream;
import java.io.InterruptedIOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

/** Reads exact bytes with bounded memory. Does not parse, store, or send content. */
final class FilePreparation {
    interface Source { InputStream open() throws IOException; }
    interface Progress { void onBytes(long bytes); }

    static final class Result {
        final long totalBytes;
        final String sha256;
        private Result(long totalBytes, String sha256) {
            this.totalBytes = totalBytes;
            this.sha256 = sha256;
        }
    }

    static final class Cancellation {
        private final AtomicBoolean cancelled = new AtomicBoolean();
        private final AtomicReference<InputStream> input = new AtomicReference<>();

        void request() { cancelled.set(true); }
        boolean isCancelled() { return cancelled.get(); }
        void check() throws InterruptedIOException {
            if (cancelled.get() || Thread.currentThread().isInterrupted()) {
                throw new InterruptedIOException("FILE_PREPARATION_CANCELLED");
            }
        }
        // Run on a cleanup worker: a third-party provider may block while closing.
        void closeInput() {
            InputStream stream = input.getAndSet(null);
            if (stream != null) {
                try { stream.close(); } catch (IOException ignored) { /* Result stays cancelled. */ }
            }
        }
        private void attach(InputStream stream) throws IOException {
            input.set(stream);
            if (cancelled.get()) {
                closeInput();
                check();
            }
        }
        private void detach(InputStream stream) { input.compareAndSet(stream, null); }
    }

    private final long maximumBytes;
    private final int bufferBytes;

    FilePreparation() { this(TransferPolicy.MAX_BYTES, 1024 * 1024); }

    // Small limits allow boundary and streaming behavior to be tested without huge files.
    FilePreparation(long maximumBytes, int bufferBytes) {
        if (maximumBytes < 1 || maximumBytes > TransferPolicy.MAX_BYTES
                || bufferBytes < 1 || bufferBytes > 1024 * 1024) throw new IllegalArgumentException();
        this.maximumBytes = maximumBytes;
        this.bufferBytes = bufferBytes;
    }

    Result prepare(Source source, Long reportedBytes, boolean noticeConfirmed,
            Cancellation cancellation, Progress progress) throws IOException {
        if (!noticeConfirmed) throw new IllegalArgumentException("EXPIRATION_CONFIRMATION_REQUIRED");
        if (reportedBytes != null && (reportedBytes <= 0 || reportedBytes > maximumBytes)) {
            throw new IOException("FILE_SIZE_NOT_SUPPORTED");
        }
        cancellation.check();
        MessageDigest digest;
        try { digest = MessageDigest.getInstance("SHA-256"); }
        catch (NoSuchAlgorithmException unavailable) { throw new IllegalStateException(unavailable); }
        long bytes = 0;
        try (InputStream input = source.open()) {
            if (input == null) throw new IOException("FILE_NOT_READABLE");
            cancellation.attach(input);
            try {
                byte[] buffer = new byte[bufferBytes];
                while (true) {
                    cancellation.check();
                    int read = input.read(buffer);
                    cancellation.check();
                    if (read == -1) break;
                    if (read <= 0 || read > buffer.length) throw new IOException("INVALID_FILE_READ");
                    if (bytes > maximumBytes - read) throw new IOException("FILE_SIZE_NOT_SUPPORTED");
                    bytes += read;
                    if (reportedBytes != null && bytes > reportedBytes) {
                        throw new IOException("FILE_SIZE_CHANGED");
                    }
                    digest.update(buffer, 0, read);
                    progress.onBytes(bytes);
                }
                cancellation.check();
                if (bytes == 0 || (reportedBytes != null && bytes != reportedBytes)) {
                    throw new IOException("FILE_SIZE_CHANGED");
                }
                char[] hex = new char[64];
                char[] alphabet = "0123456789abcdef".toCharArray();
                byte[] hash = digest.digest();
                for (int i = 0; i < hash.length; i++) {
                    hex[i * 2] = alphabet[(hash[i] & 255) >>> 4];
                    hex[i * 2 + 1] = alphabet[hash[i] & 15];
                }
                return new Result(bytes, new String(hex));
            } finally {
                cancellation.detach(input);
            }
        }
    }
}
