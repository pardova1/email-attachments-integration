# Android module and R8

The `android/` project is a native Android file-selection preview, not a complete
transfer application. It can select one document using the system picker, or
receive one `content://` URI via Android's Share menu. It queries the display name
and reported size in a background thread without opening, copying, uploading or
inspecting the file bytes. It requests no broad storage or Internet permission.
It does not replace or modify the attachment button inside other companies'
email applications.

The screen states that sending and payment are not connected and that nothing
has been uploaded or sent. Selection is temporary and is cleared after activity
recreation. The selected provider's size is only advisory; the server's byte
count, authorization, license, hash and completion checks must remain authoritative
when the native upload client is implemented. Unknown sizes are displayed as
unknown, never treated as zero or as authorization to send. The 500 GB product
limit currently matches the server's binary calculation (`500 * 1024^3`).

The four-hour download notice is informational. Selection does not start a
countdown. Future sending must require the sender's confirmation and use the
server's verified completion/expiration response.

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

For emulator tests only:

```sh
./gradlew -PemulatorRelease=true connectedReleaseAndroidTest
```

That opt-in signs the test release with the debug key. The workflow does not
publish test-signed APKs, production bundles or mapping files as public artifacts.
It retains test reports. No Google Play upload is performed.

## Remaining integration

Native authentication, paid-license verification, streaming SHA-256 and chunked
upload, resumption, recipient addresses, sender confirmation, delivery status,
notifications, Google Play Billing, translations, production signing, and device
and email-composer testing remain to be implemented. Do not market this preview
as supporting completed 500 GB transfers or universal email integration.

References:
- https://developer.android.com/build/releases/agp-8-13-0-release-notes
- https://developer.android.com/topic/performance/app-optimization/enable-app-optimization
- https://developer.android.com/training/data-storage/shared/documents-files
