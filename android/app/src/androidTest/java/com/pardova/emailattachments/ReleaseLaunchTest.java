package com.pardova.emailattachments;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.SystemClock;
import android.view.View;
import android.widget.CheckBox;
import android.widget.TextView;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import static org.junit.Assert.*;

/** Runs against the actual minified release, signed only with a test key in CI. */
@RunWith(AndroidJUnit4.class)
public final class ReleaseLaunchTest {
    // The optimized target may remove its generated R classes. Resolve the
    // installed resources without retaining production classes just for tests.
    @SuppressLint("DiscouragedApi")
    private int resource(Activity activity, String type, String name) {
        int id = activity.getResources().getIdentifier(name, type, activity.getPackageName());
        assertTrue("Missing installed resource: " + type + "/" + name, id != 0);
        return id;
    }

    private Activity launch(Intent intent) {
        Instrumentation instrumentation = InstrumentationRegistry.getInstrumentation();
        intent.setClassName(instrumentation.getTargetContext(),
                "com.pardova.emailattachments.MainActivity");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TASK);
        return instrumentation.startActivitySync(intent);
    }

    private void awaitEnabled(Activity activity, String name) {
        long deadline = SystemClock.uptimeMillis() + 10_000;
        AtomicBoolean enabled = new AtomicBoolean();
        while (SystemClock.uptimeMillis() < deadline) {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() ->
                    enabled.set(activity.findViewById(resource(activity, "id", name)).isEnabled()));
            if (enabled.get()) return;
            SystemClock.sleep(25);
        }
        fail("Control did not become enabled: " + name);
    }

    private void awaitStatus(Activity activity, String name) {
        long deadline = SystemClock.uptimeMillis() + 10_000;
        AtomicBoolean matches = new AtomicBoolean();
        while (SystemClock.uptimeMillis() < deadline) {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                TextView status = activity.findViewById(resource(activity, "id", "preparation_status"));
                matches.set(status.getText().toString().equals(activity.getString(resource(activity, "string", name))));
            });
            if (matches.get()) return;
            SystemClock.sleep(25);
        }
        fail("Preparation did not reach expected status: " + name);
    }

    private int opened(Uri uri) {
        return metric(uri, "opens");
    }

    private int metric(Uri uri, String name) {
        try (Cursor cursor = InstrumentationRegistry.getInstrumentation().getTargetContext()
                .getContentResolver().query(uri, new String[]{name}, null, null, null)) {
            assertNotNull(cursor);
            assertTrue(cursor.moveToFirst());
            return cursor.getInt(0);
        }
    }

    private void awaitMetric(Uri uri, String name, int expected) {
        long deadline = SystemClock.uptimeMillis() + 10_000;
        while (SystemClock.uptimeMillis() < deadline) {
            if (metric(uri, name) == expected) return;
            SystemClock.sleep(25);
        }
        fail("Provider did not reach expected state: " + name);
    }

    @Test public void clearingBlockedPreparationCannotPublishLateSuccess() {
        Uri uri = Uri.parse("content://com.pardova.emailattachments.test.fixture/slow-" + UUID.randomUUID());
        Activity activity = launch(new Intent(Intent.ACTION_SEND).setType("application/octet-stream")
                .putExtra(Intent.EXTRA_STREAM, uri));
        try {
            awaitEnabled(activity, "confirm_notice");
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                activity.findViewById(resource(activity, "id", "confirm_notice")).performClick();
                activity.findViewById(resource(activity, "id", "prepare_file")).performClick();
            });
            awaitMetric(uri, "opens", 1);
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                activity.findViewById(resource(activity, "id", "cancel_preparation")).performClick();
            });
            awaitStatus(activity, "preparation_cancelled");
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                activity.findViewById(resource(activity, "id", "clear_file")).performClick();
            });
            InstrumentationRegistry.getInstrumentation().getTargetContext().getContentResolver()
                    .call(uri, "release", uri.getLastPathSegment(), null);
            awaitMetric(uri, "finished", 1);
            awaitStatus(activity, "not_prepared");
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                assertFalse(activity.findViewById(resource(activity, "id", "prepare_file")).isEnabled());
                TextView details = activity.findViewById(resource(activity, "id", "file_details"));
                assertEquals(activity.getString(resource(activity, "string", "no_file")), details.getText().toString());
            });
        } finally {
            InstrumentationRegistry.getInstrumentation().getTargetContext().getContentResolver()
                    .call(uri, "release", uri.getLastPathSegment(), null);
            InstrumentationRegistry.getInstrumentation().runOnMainSync(activity::finish);
        }
    }

    @Test public void preparationRequiresAcknowledgementAndClearingResetsIt() {
        Uri uri = Uri.parse("content://com.pardova.emailattachments.test.fixture/unknown-" + UUID.randomUUID());
        Activity activity = launch(new Intent(Intent.ACTION_SEND).setType("application/octet-stream")
                .putExtra(Intent.EXTRA_STREAM, uri));
        try {
            awaitEnabled(activity, "confirm_notice");
            assertEquals(0, opened(uri));
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                View prepare = activity.findViewById(resource(activity, "id", "prepare_file"));
                assertFalse(prepare.isEnabled());
                CheckBox confirmation = activity.findViewById(resource(activity, "id", "confirm_notice"));
                assertFalse(confirmation.isChecked());
                confirmation.performClick();
                assertTrue(prepare.isEnabled());
                prepare.performClick();
            });
            awaitStatus(activity, "preparation_complete");
            assertEquals(1, opened(uri));
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                TextView delivery = activity.findViewById(resource(activity, "id", "transfer_status"));
                assertEquals(activity.getString(resource(activity, "string", "development_status")), delivery.getText().toString());
                activity.findViewById(resource(activity, "id", "clear_file")).performClick();
                CheckBox confirmation = activity.findViewById(resource(activity, "id", "confirm_notice"));
                assertFalse(confirmation.isChecked());
                assertFalse(confirmation.isEnabled());
                assertFalse(activity.findViewById(resource(activity, "id", "prepare_file")).isEnabled());
            });
            awaitStatus(activity, "not_prepared");
        } finally {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(activity::finish);
        }
    }

    @Test public void providerSizeChangeCannotProducePreparedSuccess() {
        Uri uri = Uri.parse("content://com.pardova.emailattachments.test.fixture/changed-" + UUID.randomUUID());
        Activity activity = launch(new Intent(Intent.ACTION_SEND).setType("application/octet-stream")
                .putExtra(Intent.EXTRA_STREAM, uri));
        try {
            awaitEnabled(activity, "confirm_notice");
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                activity.findViewById(resource(activity, "id", "confirm_notice")).performClick();
                activity.findViewById(resource(activity, "id", "prepare_file")).performClick();
            });
            awaitStatus(activity, "preparation_failed");
            assertEquals(1, opened(uri));
        } finally {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(activity::finish);
        }
    }

    @Test public void minifiedReleaseLaunchesWithoutClaimingDelivery() {
        Activity activity = launch(new Intent(Intent.ACTION_MAIN));
        try {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                TextView status = activity.findViewById(resource(activity, "id", "transfer_status"));
                assertEquals(activity.getString(resource(activity, "string", "development_status")), status.getText().toString());
                TextView details = activity.findViewById(resource(activity, "id", "file_details"));
                assertEquals(activity.getString(resource(activity, "string", "no_file")), details.getText().toString());
            });
        } finally {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(activity::finish);
        }
    }

    @Test public void rejectsExternalFilePathsAndClearsSelection() {
        Activity activity = launch(new Intent(Intent.ACTION_SEND).setType("video/mp4")
                .putExtra(Intent.EXTRA_STREAM, Uri.parse("file:///private/not-readable.mp4")));
        try {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(() -> {
                TextView details = activity.findViewById(resource(activity, "id", "file_details"));
                assertEquals(activity.getString(resource(activity, "string", "unsupported_file")), details.getText().toString());
                activity.findViewById(resource(activity, "id", "clear_file")).performClick();
                assertEquals(activity.getString(resource(activity, "string", "no_file")), details.getText().toString());
            });
        } finally {
            InstrumentationRegistry.getInstrumentation().runOnMainSync(activity::finish);
        }
    }
}
