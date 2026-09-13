# Temporary cloud buffer and local OmniView

The dedicated private bucket is `omniview-contributors-jxceplhoofpojyolcsjz` in `eu-central-003`. The pre-existing `ominiveiw` bucket was left unchanged. Supabase stores metadata and transfer receipts. B2 stores video temporarily.

## Admin commands

Run from the Contributors app folder. `OMNIVIEW_SERVER_URL` selects the app server; `OMNIVIEW_ADMIN_TOKEN` authenticates the admin integration. A random token has been generated in ignored `.env`. On a separate admin computer, configure only these two settings; do not copy database or B2 secrets there. Use HTTPS outside localhost.

View buffer state:

```sh
node scripts/admin-buffer.mjs status
```

Download into your local OmniView intake directory:

```sh
node scripts/admin-buffer.mjs download --directory "D:/OmniView/intake"
```

The helper writes each video to a temporary file, checks its byte length, calculates SHA-256, flushes it to disk, renames it to its final filename and saves the GPS metadata. Only then does it acknowledge the download to the server. The server records the B2 version, byte count, hash and local receipt. This is an authenticated admin attestation of local storage; the server cannot independently inspect the admin computer's disk. Keep a backup if the local copy must survive disk failure.

After downloading, the helper asks the admin to approve cleanup. Review a preview:

```sh
node scripts/admin-buffer.mjs cleanup
```

Delete all eligible temporary cloud copies with one command:

```sh
node scripts/admin-buffer.mjs cleanup --confirm
```

This never deletes undownloaded footage. It deletes the exact B2 object version associated with the confirmed local download, so B2 releases its storage rather than creating a delete marker. Archive metadata is retained and the contributor sees “Transferred to OmniView.” Failed deletions remain available for retry. Cloud cleanup does not delete anything from the admin computer.

## Endpoints

All require `Authorization: Bearer <OMNIVIEW_ADMIN_TOKEN>`; contributor login tokens cannot use them.

| Endpoint | Purpose |
|---|---|
| `GET /api/admin/buffer` | Buffer state and download/cleanup status |
| `GET /api/admin/downloads` | Pending files with signed URLs and GPS metadata |
| `POST /api/admin/downloads/:id/confirm` | Submit `{bytes, versionId, sha256, receipt}` after durable local storage |
| `POST /api/admin/buffer/cleanup` | Empty body previews eligible IDs; explicit confirmation performs cleanup |

The deletion body is `{ "confirm": "DELETE_DOWNLOADED_TEMPORARY_VIDEOS", "clipIds": ["..."] }`. IDs are rechecked against download receipts; requesting an undownloaded clip cannot delete it.

## Capacity

The target is **10 GB decimal for this dedicated buffer**. The database atomically reserves space before an upload starts, admits at most **9.5 GB** of completed plus pending footage, and leaves 500 MB headroom. A full buffer returns HTTP 507 and contributors retain their local clips. Downloads alone do not free reserved capacity; successful admin cleanup does.

This is an application admission limit, not an account-wide B2 billing quota. Files placed outside this app, the existing bucket, old/untracked versions and service overhead can consume additional account storage. Use this dedicated bucket only for the app and monitor the B2 account totals. Unfinished multipart uploads are cancelled by a seven-day lifecycle rule; completed undownloaded videos have no automatic expiry. Stale database reservations are cleared when those uploads are retried after expiry, so they may temporarily block new uploads conservatively.

## Remaining setup

B2 credentials, private bucket, local CORS origins and the SQL migration are configured. Real contributor login still needs the Supabase publishable/anon key and enabled authentication providers. The server can access Supabase PostgreSQL using the supplied server-only connection string. Set the public deployment's exact HTTPS origin in B2 CORS before using phone uploads remotely.
