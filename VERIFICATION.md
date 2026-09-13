# Verification

The app uses Supabase for metadata and a dedicated private Backblaze B2 temporary buffer. The former onboarding data has been removed from the live SQL schema, recorder, navigation, API and validation. Local browser migration strips obsolete fields while preserving video chunks.

Verified B2 authentication, private bucket creation, local CORS and unfinished-upload lifecycle configuration. A tiny synthetic object successfully passed write/read/version-specific delete and was removed. No contributor footage was deleted.

Tests cover recording/playback, mobile flow, local persistence, permissions, clip limits, multipart validation, account isolation, database completion failure, admin authentication, cleanup preview, skipping undownloaded files, and failed-deletion retention. The database capacity check runs inside a transaction that is rolled back.

Full real-user upload and download transfer awaits the Supabase public authentication key. Admin receipt verification trusts an authenticated OmniView downloader; it cannot independently verify another computer's filesystem. See BUFFER_ADMIN.md for exact limitations and operations.
