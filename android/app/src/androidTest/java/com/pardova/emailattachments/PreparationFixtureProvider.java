package com.pardova.emailattachments;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.database.MatrixCursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;
import android.os.Bundle;
import android.provider.OpenableColumns;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.IOException;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** Synthetic provider installed only with the instrumentation APK. */
public final class PreparationFixtureProvider extends ContentProvider {
    private final ConcurrentHashMap<String, AtomicInteger> opens = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, CountDownLatch> releases = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, AtomicInteger> finished = new ConcurrentHashMap<>();
    @Override public boolean onCreate() { return true; }
    @Override public String getType(Uri uri) { return "application/octet-stream"; }
    @Override public Cursor query(Uri uri, String[] projection, String selection,
            String[] selectionArgs, String order) {
        String key = uri.getLastPathSegment();
        if (key == null) throw new IllegalArgumentException();
        String[] columns = projection == null
                ? new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE, "opens"} : projection;
        Object[] row = new Object[columns.length];
        for (int i = 0; i < columns.length; i++) {
            switch (columns[i]) {
                case OpenableColumns.DISPLAY_NAME: row[i] = "fixture.bin"; break;
                case OpenableColumns.SIZE:
                    row[i] = key.startsWith("unknown") ? null : (key.startsWith("changed") ? 5L : 4L);
                    break;
                case "opens": row[i] = opens.computeIfAbsent(key, ignored -> new AtomicInteger()).get(); break;
                case "finished": row[i] = finished.computeIfAbsent(key, ignored -> new AtomicInteger()).get(); break;
                default: row[i] = null;
            }
        }
        MatrixCursor cursor = new MatrixCursor(columns);
        cursor.addRow(row);
        return cursor;
    }
    @Override public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        if (!"r".equals(mode) || getContext() == null || uri.getLastPathSegment() == null)
            throw new FileNotFoundException();
        opens.computeIfAbsent(uri.getLastPathSegment(), ignored -> new AtomicInteger()).incrementAndGet();
        try {
            if (uri.getLastPathSegment().startsWith("slow")) {
                String key = uri.getLastPathSegment();
                ParcelFileDescriptor[] pipe = ParcelFileDescriptor.createPipe();
                CountDownLatch release = releases.computeIfAbsent(key, ignored -> new CountDownLatch(1));
                new Thread(() -> {
                    try (FileOutputStream output = new ParcelFileDescriptor.AutoCloseOutputStream(pipe[1])) {
                        if (release.await(10, TimeUnit.SECONDS)) output.write(new byte[]{0, (byte) 255, 13, 10});
                    } catch (IOException ignored) {
                        // Expected if cancellation already closed the consumer's pipe.
                    } catch (InterruptedException interrupted) {
                        Thread.currentThread().interrupt();
                    } finally {
                        finished.computeIfAbsent(key, ignored -> new AtomicInteger()).set(1);
                    }
                }, "test-provider-writer").start();
                return pipe[0];
            }
            File fixture = File.createTempFile("preparation", ".bin", getContext().getCacheDir());
            try (FileOutputStream output = new FileOutputStream(fixture)) {
                output.write(new byte[]{0, (byte) 255, 13, 10});
            }
            return ParcelFileDescriptor.open(fixture, ParcelFileDescriptor.MODE_READ_ONLY);
        } catch (IOException unavailable) {
            throw new FileNotFoundException("Fixture unavailable");
        }
    }
    @Override public Bundle call(String method, String arg, Bundle extras) {
        if (!"release".equals(method) || arg == null) throw new IllegalArgumentException();
        releases.computeIfAbsent(arg, ignored -> new CountDownLatch(1)).countDown();
        return new Bundle();
    }
    @Override public Uri insert(Uri uri, ContentValues values) { throw new UnsupportedOperationException(); }
    @Override public int delete(Uri uri, String selection, String[] args) { throw new UnsupportedOperationException(); }
    @Override public int update(Uri uri, ContentValues values, String selection, String[] args) { throw new UnsupportedOperationException(); }
}
