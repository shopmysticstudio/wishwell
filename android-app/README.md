# Wishwell Android app (free, for Google Play)

The free Play Store version of Wishwell. It is built from the web app in `../app`, with
AI turned off and the plans, prices for passes and "Paid link" labels taken out, so it
follows Google Play's payments rules. Fonts are bundled, so the app makes no requests
except store searches the user taps.

## How it is built
- `scripts/make-free-web.mjs` copies `../app` into `www/` and applies the free-app changes.
  If the web app changes so a change no longer matches, the build stops with an error.
- Capacitor wraps `www/` into the Android project in `android/`.
- GitHub Actions (`.github/workflows/android.yml`) builds on every push to the
  `android-app` branch and uploads:
  - `wishwell-android-N`: the `.aab` bundle for Play and a debug `.apk` to try on a phone
  - `wishwell-store-images-N`: Play screenshots, feature graphic and 512 px icon
- `tools/make-icons.py` remakes the launcher icons and splash screens from `../app/icons`.

App id: `com.shopmysticstudio.wishwell` (permanent once the first bundle is uploaded to Play).

## Make the upload key (one time, done by Galileo)
Play needs every bundle signed with your own upload key. The key never goes in the repo.

1. Open Google Cloud Shell (shell.cloud.google.com) or any computer with Java.
2. Run, choosing your own strong password when asked:
   ```
   keytool -genkeypair -v -storetype PKCS12 -keystore wishwell-upload.jks -alias wishwell -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Galileo Solis, O=Wishwell, C=US"
   base64 -w0 wishwell-upload.jks > wishwell-upload.b64
   ```
3. In GitHub, open the wishwell repo, Settings, Secrets and variables, Actions, and add:
   - `WISHWELL_UPLOAD_KEYSTORE_BASE64`: the contents of `wishwell-upload.b64`
   - `WISHWELL_UPLOAD_KEYSTORE_PASSWORD`: your password
   - `WISHWELL_UPLOAD_KEY_PASSWORD`: the same password
   - `WISHWELL_UPLOAD_KEY_ALIAS`: `wishwell`
4. Keep `wishwell-upload.jks` and the password somewhere safe (a password manager). Delete the copy in Cloud Shell.
5. Re-run the latest "Android app" workflow (Actions tab, Re-run all jobs). The bundle name ends in `-signed.aab`.

## Build on your own computer (optional)
Needs Node 22, Java 21 and the Android SDK (Android Studio installs it).
```
npm ci
npm run sync
cd android && ./gradlew bundleRelease
```
