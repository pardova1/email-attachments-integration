package com.pardova.emailattachments;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.provider.OpenableColumns;
import android.view.WindowInsets;
import android.widget.TextView;
import java.text.NumberFormat;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** File selection only. No file bytes, credentials, or network calls are handled here. */
public final class MainActivity extends Activity {
    private static final int PICK_FILE = 1;
    private final ExecutorService metadataWorker = Executors.newSingleThreadExecutor();
    private TextView details;
    private int selectionGeneration;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        setContentView(R.layout.activity_main);
        findViewById(R.id.root).setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars()
                        | WindowInsets.Type.displayCutout());
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
            } else {
                view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                        insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            }
            return insets;
        });
        details = findViewById(R.id.file_details);
        findViewById(R.id.choose_file).setOnClickListener(view -> chooseFile());
        findViewById(R.id.clear_file).setOnClickListener(view -> {
            selectionGeneration++;
            setIntent(new Intent());
            details.setText(R.string.no_file);
        });
        // Never persist a shared URI or assume its temporary grant survives a restart.
        if (state == null) acceptShare(getIntent());
    }

    private void chooseFile() {
        Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT)
                .addCategory(Intent.CATEGORY_OPENABLE).setType("*/*")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            startActivityForResult(picker, PICK_FILE);
        } catch (ActivityNotFoundException unavailable) {
            details.setText(R.string.picker_missing);
        }
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PICK_FILE && result == RESULT_OK && data != null) {
            showFile(data.getData());
        }
    }

    @SuppressWarnings("deprecation")
    private void acceptShare(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        try {
            Object stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            showFile(stream instanceof Uri ? (Uri) stream : null);
        } catch (RuntimeException malformedIntent) {
            details.setText(R.string.unsupported_file);
        }
    }

    private void showFile(Uri uri) {
        int generation = ++selectionGeneration;
        // Never accept file:// paths, HTTP URLs or arbitrary schemes from other apps.
        if (uri == null || !"content".equals(uri.getScheme())) {
            details.setText(R.string.unsupported_file);
            return;
        }
        details.setText(R.string.checking_file);
        metadataWorker.execute(() -> {
            String name = getString(R.string.unnamed_file);
            Long bytes = null;
            try (Cursor cursor = getContentResolver().query(uri,
                    new String[]{OpenableColumns.DISPLAY_NAME, OpenableColumns.SIZE}, null, null, null)) {
                if (cursor == null || !cursor.moveToFirst()) throw new IllegalArgumentException();
                int nameColumn = cursor.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int sizeColumn = cursor.getColumnIndex(OpenableColumns.SIZE);
                if (nameColumn >= 0 && !cursor.isNull(nameColumn)) {
                    String suppliedName = cursor.getString(nameColumn);
                    if (suppliedName != null && !suppliedName.trim().isEmpty()) {
                        name = suppliedName.substring(0, Math.min(suppliedName.length(), 256));
                    }
                }
                if (sizeColumn >= 0 && !cursor.isNull(sizeColumn)) bytes = cursor.getLong(sizeColumn);
                String message = !TransferPolicy.acceptsKnownSize(bytes)
                        ? getString(R.string.invalid_size)
                        : getString(R.string.selected_file, name, bytes == null
                            ? getString(R.string.unknown_size)
                            : getString(R.string.file_bytes, NumberFormat.getIntegerInstance().format(bytes)));
                runOnUiThread(() -> {
                    if (!isDestroyed() && generation == selectionGeneration) details.setText(message);
                });
            } catch (RuntimeException unavailable) {
                runOnUiThread(() -> {
                    if (!isDestroyed() && generation == selectionGeneration)
                        details.setText(R.string.unreadable_file);
                });
            }
        });
    }

    @Override protected void onDestroy() {
        selectionGeneration++;
        metadataWorker.shutdownNow();
        super.onDestroy();
    }
}
