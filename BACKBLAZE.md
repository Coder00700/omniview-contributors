# Backblaze B2 temporary storage

Video files pass through a private B2 buffer to local OmniView. Supabase retains authentication, GPS tracks, clip metadata, upload reservations and download receipts.

See [BUFFER_ADMIN.md](BUFFER_ADMIN.md) for the configured bucket, capacity policy, download helper, admin endpoints and one-command cloud cleanup.

Fresh deployments run `supabase/schema.sql`, `supabase/access.sql`, then `supabase/temporary-buffer.sql`. The provided Supabase project is already migrated. Do not rerun the fresh schema on it.

Use server-only B2 keys and PostgreSQL credentials. The supplied key has been verified with a small synthetic read/write/delete check; that test object was removed. Contributor login still needs the Supabase public API key.

References: [B2 version-specific deletion](https://www.backblaze.com/apidocs/s3-delete-object), [B2 lifecycle rules](https://www.backblaze.com/docs/en/cloud-storage-lifecycle-rules).
