package com.pardova.emailattachments;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.AssetFileDescriptor;
import android.database.Cursor;
import android.net.Uri;
import android.os.Bundle;
import android.os.Build;
import android.os.CancellationSignal;
import android.os.SystemClock;
import android.provider.OpenableColumns;
import android.view.WindowInsets;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.TextView;
import java.io.IOException;
import java.io.InputStream;
import java.text.NumberFormat;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** Local selection and integrity preparation. No credentials or network calls. */
public final class MainActivity extends Activity {
    private static final int PICK_FILE = 1;
    private final ExecutorService metadataWorker = Executors.newSingleThreadExecutor();
    private final ExecutorService preparationWorker = Executors.newSingleThreadExecutor();
    private final ExecutorService cleanupWorker = Executors.newSingleThreadExecutor();
    private TextView details;
    private TextView preparationStatus;
    private CheckBox notice;
    private Button prepareButton;
    private Button cancelButton;
    private Button integrityButton;
    private AlertDialog integrityDialog;
    private int selectionGeneration;
    private Uri selectedUri;
    private Long reportedBytes;
    private FilePreparation.Result preparedFile;
    private FilePreparation.Cancellation activePreparation;
    private CancellationSignal activeOpen;

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
        preparationStatus = findViewById(R.id.preparation_status);
        notice = findViewById(R.id.confirm_notice);
        prepareButton = findViewById(R.id.prepare_file);
        cancelButton = findViewById(R.id.cancel_preparation);
        integrityButton = findViewById(R.id.integrity_details);
        integrityButton.setOnClickListener(view -> showIntegrityDetails());
        notice.setOnCheckedChangeListener((button, checked) -> {
            if (!checked) {
                stopPreparation();
                preparedFile = null;
                preparationStatus.setText(R.string.not_prepared);
            }
            updatePreparationControls();
        });
        findViewById(R.id.choose_file).setOnClickListener(view -> chooseFile());
        findViewById(R.id.clear_file).setOnClickListener(view -> {
            resetSelection();
            setIntent(new Intent());
            details.setText(R.string.no_file);
        });
        prepareButton.setOnClickListener(view -> prepareFile());
        cancelButton.setOnClickListener(view -> {
            stopPreparation();
            preparedFile = null;
            preparationStatus.setText(R.string.preparation_cancelled);
            updatePreparationControls();
        });
        // Never persist a shared URI, a digest, or an acknowledgement across recreation.
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
        if (request == PICK_FILE && result == RESULT_OK && data != null) showFile(data.getData());
    }

    @SuppressWarnings("deprecation")
    private void acceptShare(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        try {
            Object stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            showFile(stream instanceof Uri ? (Uri) stream : null);
        } catch (RuntimeException malformedIntent) {
            resetSelection();
            details.setText(R.string.unsupported_file);
        }
    }

    private void resetSelection() {
        selectionGeneration++;
        if (integrityDialog != null) integrityDialog.dismiss();
        stopPreparation();
        selectedUri = null;
        reportedBytes = null;
        preparedFile = null;
        notice.setChecked(false);
        notice.setEnabled(false);
        preparationStatus.setText(R.string.not_prepared);
        updatePreparationControls();
    }

    private void updatePreparationControls() {
        prepareButton.setEnabled(selectedUri != null && notice.isChecked()
                && activePreparation == null && preparedFile == null);
        cancelButton.setEnabled(activePreparation != null);
        integrityButton.setEnabled(preparedFile != null);
    }

    private void showIntegrityDetails() {
        FilePreparation.Result result = preparedFile;
        if (result == null) return;
        integrityDialog = new AlertDialog.Builder(this)
                .setTitle(R.string.integrity_details)
                .setMessage(getString(R.string.integrity_fingerprint, result.sha256,
                        NumberFormat.getIntegerInstance().format(result.totalBytes)))
                .setPositiveButton(android.R.string.ok, null).create();
        integrityDialog.setOnDismissListener(dialog -> integrityDialog = null);
        integrityDialog.show();
    }

    private void showFile(Uri uri) {
        resetSelection();
        int generation = selectionGeneration;
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
                boolean allowed = TransferPolicy.acceptsKnownSize(bytes);
                String message = !allowed ? getString(R.string.invalid_size)
                        : getString(R.string.selected_file, name, bytes == null
                            ? getString(R.string.unknown_size)
                            : getString(R.string.file_bytes, NumberFormat.getIntegerInstance().format(bytes)));
                Long snapshotBytes = bytes;
                runOnUiThread(() -> {
                    if (!isDestroyed() && generation == selectionGeneration) {
                        details.setText(message);
                        selectedUri = allowed ? uri : null;
                        reportedBytes = snapshotBytes;
                        notice.setEnabled(allowed);
                        updatePreparationControls();
                    }
                });
            } catch (RuntimeException unavailable) {
                runOnUiThread(() -> {
                    if (!isDestroyed() && generation == selectionGeneration)
                        details.setText(R.string.unreadable_file);
                });
            }
        });
    }

    private InputStream openSelectedFile(Uri uri, CancellationSignal signal) throws IOException {
        AssetFileDescriptor descriptor = getContentResolver().openAssetFileDescriptor(uri, "r", signal);
        if (descriptor == null) throw new IOException("FILE_NOT_READABLE");
        try {
            // This stream owns the descriptor and honors provider offsets/lengths.
            return descriptor.createInputStream();
        } catch (IOException | RuntimeException failure) {
            descriptor.close();
            throw failure;
        }
    }

    private void prepareFile() {
        if (selectedUri == null || !notice.isChecked() || activePreparation != null || preparedFile != null) return;
        Uri uri = selectedUri;
        Long bytes = reportedBytes;
        int generation = selectionGeneration;
        FilePreparation.Cancellation cancellation = new FilePreparation.Cancellation();
        CancellationSignal openSignal = new CancellationSignal();
        activePreparation = cancellation;
        activeOpen = openSignal;
        preparationStatus.setText(R.string.preparing_file);
        updatePreparationControls();
        preparationWorker.execute(() -> {
            long[] lastProgress = {0};
            try {
                FilePreparation.Result result = new FilePreparation().prepare(
                        () -> openSelectedFile(uri, openSignal), bytes, true, cancellation, count -> {
                            long now = SystemClock.uptimeMillis();
                            if (now - lastProgress[0] < 250) return;
                            lastProgress[0] = now;
                            String message = getString(R.string.preparation_progress,
                                    NumberFormat.getIntegerInstance().format(count));
                            runOnUiThread(() -> {
                                if (isCurrentPreparation(generation, cancellation)) preparationStatus.setText(message);
                            });
                        });
                runOnUiThread(() -> {
                    if (!isCurrentPreparation(generation, cancellation)) return;
                    preparedFile = result;
                    activePreparation = null;
                    activeOpen = null;
                    preparationStatus.setText(R.string.preparation_complete);
                    updatePreparationControls();
                });
            } catch (IOException | RuntimeException unavailable) {
                runOnUiThread(() -> {
                    if (!isCurrentPreparation(generation, cancellation)) return;
                    activePreparation = null;
                    activeOpen = null;
                    preparationStatus.setText(R.string.preparation_failed);
                    updatePreparationControls();
                });
            }
        });
    }

    private boolean isCurrentPreparation(int generation, FilePreparation.Cancellation cancellation) {
        return !isDestroyed() && generation == selectionGeneration
                && activePreparation == cancellation && !cancellation.isCancelled();
    }

    private void stopPreparation() {
        FilePreparation.Cancellation cancellation = activePreparation;
        CancellationSignal signal = activeOpen;
        activePreparation = null;
        activeOpen = null;
        if (cancellation != null) {
            cancellation.request();
            cleanupWorker.execute(() -> {
                cancellation.closeInput();
                if (signal != null) signal.cancel();
            });
        }
    }

    @Override protected void onDestroy() {
        selectionGeneration++;
        if (integrityDialog != null) integrityDialog.dismiss();
        stopPreparation();
        preparedFile = null;
        selectedUri = null;
        metadataWorker.shutdownNow();
        preparationWorker.shutdownNow();
        cleanupWorker.shutdown();
        super.onDestroy();
    }
}
