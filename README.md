# Omniview Contributors

Mobile-friendly contributor app for recording road footage with location tracks. Built in the requested `Contributors app` folder, independent of the round-two project.

## Run

Requires Node.js 20.19+ or 22.12+.

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

This is a web application, not an Android APK. Browser storage can be evicted and camera recording can be interrupted by locking or backgrounding. Storage-persistence requests are best effort. Abruptly terminated media containers may not play even when partial chunks are recovered. Active video needs this page to stay open. Home-screen installation availability varies by browser; no offline app-shell service worker is included yet. An already loaded recorder can save footage without internet.

GPS measurement times and recording start time are retained, but browser APIs do not establish hardware-grade per-frame timestamp synchronization. Metadata explicitly labels approximate alignment. A native recorder is the next step for more precise synchronization. Tilt checks are heuristics, not a computer-vision road/horizon detector. Never operate the recording controls while driving.


The app does not yet import arbitrary external videos or integrate dashcams; recording and uploading its own phone clips is the current scope. Local preview clips remain isolated from signed-in accounts. Account archive lists sync from Supabase; local deletion only removes a device entry, not the uploaded server object.

The source keeps all unuploaded clips until upload or explicit deletion. The cap is checked while recording, but browser event delays and encoding buffers can temporarily exceed the cap. Reserve real device space and test on target phones.

## Storage configuration

Supabase handles the cloud database and authentication. Backblaze B2 temporarily buffers new uploads until local OmniView downloads them and an admin confirms cleanup. See [BACKBLAZE.md](BACKBLAZE.md) for credentials, bucket CORS, database migration and resumable upload behaviour. No Supabase Storage bucket is needed for new installations.

Admin transfer and cleanup: see [BACKBLAZE.md](BACKBLAZE.md). Contributors go straight from login to phone recording.
