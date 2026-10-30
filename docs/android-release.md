# Android module and R8

The `android/` project is a native Android file-preparation preview, not a complete
transfer application. It can select one document using the system picker, or
receive one `content://` URI via Android's Share menu. It queries the display name
and reported size in a background thread. After the sender acknowledges the
four-hour download notice and taps Prepare file, it reads the selected document
as a binary stream to calculate SHA-256 and an actual byte count. It does not
parse content, copy the file to app storage, or upload it. It requests no broad
storage or Internet permission.
It does not replace or modify the attachment button inside other companies'
email applications.

The screen states that sending and payment are not connected and that nothing
has been uploaded or sent. Selection is temporary and is cleared after activity
recreation. The selected provider's size is only advisory; the server's byte
count, authorization, license, hash and completion checks must remain authoritative
when the native upload client is implemented. Unknown sizes are displayed as
unknown, never treated as zero or as authorization to send. The 500 GB product
limit currently matches the server's binary calculation (`500 * 1024^3`).

The sender must acknowledge the four-hour notice before preparation can open
file bytes. Selecting, preparing, or cancelling a file does not start a countdown.
Future sending must bind confirmation to the transfer and use the server's
verified completion/expiration response.

## Local integrity preparation

`FilePreparation` uses one buffer of at most 1 MiB, a SHA-256 digest and a 64-bit
byte counter. It rejects empty streams, actual bytes above the server's initial
limit, and any difference between known provider metadata and the count read.
Unknown metadata is allowed, but the actual count is still checked. A digest is
only produced after a complete successful read. The file is never converted to
text or rewritten.

Metadata, preparation and resource cleanup each have a separate single worker.
Progress is throttled to at most four UI updates per second. Cancel immediately
invalidates the active job; resource close and provider-open cancellation happen
on a cleanup worker. Clear, acknowledgement removal, selection replacement and
activity destruction invalidate old results. Confirmation is not saved across
activity recreation. URI grants and prepared results remain in memory only.

A provider can ignore cancellation or block an I/O operation. Such a provider may
hold that worker until it returns; this preview does not promise a forced I/O
termination deadline. A late result cannot mark a cleared or replaced file as
prepared. Retry or select the file again if access fails.

Preparation is a local preflight. It does not prove that a later upload is
unchanged. The future native upload client must bind the digest, actual count,
selected source and authenticated account, verify chunks while uploading, and
require the server's exact-byte verification before confirming completion.

## Build

Open `android/` in Android Studio, or install JDK 17 and the Android SDK and set
`ANDROID_HOME`. The pinned tools are AGP 8.13.2, Gradle 8.14.6, compile/target SDK 36,
Build Tools 35.0.0, and minimum SDK 26. The Gradle wrapper verifies the distribution's
SHA-256 before executing it.

This preview deliberately targets API 36 within AGP 8.13's documented support.
Only the `OldTargetApi` upgrade notice is informational; other lint warnings
remain errors. A newer target requires an AGP migration and Android compatibility
validation before store release. CI exercises the minified app on API 36.
The test APK includes Error Prone annotation definitions required by AndroidX
Test's R8 processing; these are not production app dependencies.

```sh
cd android
./gradlew testDebugUnitTest lintRelease bundleRelease
```

Release builds enable code shrinking, optimization, name obfuscation and resource
shrinking using `proguard-android-optimize.txt`. There are no blanket keep rules.
Any future reflection, serialization, JNI or SDK integration must be checked in
the minified build before release. R8 does not protect embedded secrets or provide
DexGuard's runtime defenses. No DexGuard dependency or license is included.

The normal release bundle is **unsigned**. Signing keys must be provisioned
outside source control before store submission. Do not use the debug key for
store distribution. Keep R8 mapping files privately with their exact release
version so crashes can be retraced; do not ship them inside the app.

## Verification

The Android workflow runs unit boundary tests, strict release lint, a real R8
bundle build, and checks for nonempty mapping and bundle outputs. It then uses
an emulator to launch the minified release, checks its honest delivery status,
and verifies rejection of a shared `file://` path and clearing the selection.
Additional unit tests exercise known SHA-256 vectors, binary preservation, bounded
reads, unknown/changed/oversized files, read failures and cancellation. A provider
installed only in the instrumentation APK serves synthetic bytes and a controlled
blocked pipe. Emulator tests verify acknowledgement before opening bytes, unknown
size preparation, size-change rejection, and that cancellation/clear cannot
publish success after a delayed provider response. Production builds contain no
fixture provider.

For emulator tests only:

```sh
./gradlew -PemulatorRelease=true connectedReleaseAndroidTest
```

That opt-in signs the test release with the debug key. The workflow does not
publish test-signed APKs, production bundles or mapping files as public artifacts.
It retains test reports. No Google Play upload is performed.

## Remaining integration

Native authentication, paid-license verification, chunked upload, resumption,
recipient addresses, binding sender confirmation to server creation, delivery status,
notifications, Google Play Billing, translations, production signing, and device
and email-composer testing remain to be implemented. Do not market this preview
as supporting completed 500 GB transfers or universal email integration.

References:
- https://developer.android.com/build/releases/agp-8-13-0-release-notes
- https://developer.android.com/topic/performance/app-optimization/enable-app-optimization
- https://developer.android.com/training/data-storage/shared/documents-files
