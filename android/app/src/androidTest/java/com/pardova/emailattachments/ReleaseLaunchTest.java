package com.pardova.emailattachments;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.Instrumentation;
import android.content.Intent;
import android.net.Uri;
import android.widget.TextView;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
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
