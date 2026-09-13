# Omniview Contributors

Android contributor app for recording road footage with location tracks, with a shared web interface and a separate Express backend. The Android APK bundles the interface using Capacitor and uses native location permissions. It does not require the website to load before opening the recorder.

## Android installation

Download `OmniView-Contributors.apk` from the repository's [Releases](https://github.com/Coder00700/omniview-contributors/releases). This is a private repository, so team members need access. See [Android release instructions](ANDROID_RELEASE.md).

Build a new APK using Actions → Android APK → Run workflow. Keep the `ANDROID_KEYSTORE_BASE64` Actions secret: future releases must use the same signing key so Android can update the app without uninstalling it. The build uses Node 22, Java 21, and Android SDK 36. App package: `com.omniview.contributors`.

## Run

Requires Node.js 22.12+ for the Android tooling.

```sh
npm install
npm run dev
```

Open the displayed localhost address. Without service credentials the sign-in screen offers an explicitly labelled local preview. It does not create or authenticate a real account. Real camera/GPS permissions are still required to record. For a phone, serve through HTTPS; an HTTP LAN address does not permit camera access.

```sh
npm test
npm run build
npm run server
```

The server serves the production build and the protected upload/admin APIs. During development run `npm run dev` and `npm run server` separately. See [SETUP.md](SETUP.md) for external services.

## Included

- Responsive dashboard, sign-up/login, email magic links, Google OAuth, phone OTP integration, Cloudflare Turnstile integration.
- Phone camera and GPS permissions, no microphone, no live streaming, framing overlay, optional motion-based reminders after sustained poor tilt with cooldown.
- Three- or five-minute limit, foreground-only recording, stop/save, record another prompt.
- Durable IndexedDB recording chunks every two seconds, recovery of interrupted sessions, 500 MiB pending-storage guard, explicit upload workflow.
- Video previews and downloads; select individual pending clips or upload all; Backblaze B2 multipart resumable uploads, private storage and account-scoped archive.
- Local cleanup only after B2 video verification and Supabase metadata/archive write succeed. No automatic deletion of unuploaded footage.

## Limits that matter

The Android app uses a bundled WebView recorder and native GPS. Recording stops when the app goes into the background. Keep it open during recording and uploads. Clips are kept in app-local IndexedDB; uninstalling or clearing app data removes them. Storage-persistence requests are best effort. Abruptly terminated media containers may not play even when partial chunks are recovered. The Android interface is bundled for offline opening; the browser version has no offline app-shell service worker.

GPS measurement times and recording start time are retained, but browser APIs do not establish hardware-grade per-frame timestamp synchronization. Metadata explicitly labels approximate alignment. A native recorder is the next step for more precise synchronization. Tilt checks are heuristics, not a computer-vision road/horizon detector. Never operate the recording controls while driving.


The app does not yet import arbitrary external videos or integrate dashcams; recording and uploading its own phone clips is the current scope. Local preview clips remain isolated from signed-in accounts. Account archive lists sync from Supabase; local deletion only removes a device entry, not the uploaded server object.

The source keeps all unuploaded clips until upload or explicit deletion. The cap is checked while recording, but browser event delays and encoding buffers can temporarily exceed the cap. Reserve real device space and test on target phones.

## Storage configuration

Supabase handles the cloud database and authentication. Backblaze B2 temporarily buffers new uploads until local OmniView downloads them and an admin confirms cleanup. See [BACKBLAZE.md](BACKBLAZE.md) for credentials, bucket CORS, database migration and resumable upload behaviour. No Supabase Storage bucket is needed for new installations.

Admin transfer and cleanup: see [BACKBLAZE.md](BACKBLAZE.md). Contributors go straight from login to phone recording.

## Phone verification

Supabase's Send SMS hook calls `POST /api/hooks/sms`. Configure its signing secret and the gateway credentials as server-only environment variables. The hook verifies the raw request signature and forwards to the configured SMSGate device over HTTPS. Supabase controls OTP generation, expiry and verification. Gateway acceptance is not proof of handset delivery. Message-level encryption is currently off for the team test.

The free Render backend may sleep; the app calls `/healthz` before requesting an SMS to wake it first. Enable `VITE_PHONE_AUTH_ENABLED=true` only after the Supabase Phone provider and Send SMS hook are configured. Set the Supabase allowed redirect `com.omniview.contributors://auth/callback` for Android OAuth/email return. Google sign-in opens the system browser rather than an embedded login page.
