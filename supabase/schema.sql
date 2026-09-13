-- Run once in a new Supabase project's SQL editor.
create table public.contributions (
 id uuid primary key, user_id uuid not null references auth.users(id),
 name text not null check (length(name) <= 120),
 created_at timestamptz not null, duration numeric not null check(duration >= 0 and duration <= 305),
 bytes bigint not null check(bytes > 0 and bytes <= 524288000), object_path text not null,
 storage_provider text not null default 'b2',metadata jsonb not null default '{}',
 b2_version_id text,downloaded_at timestamptz,local_sha256 text,local_receipt text,cloud_deleted_at timestamptz,
 check(object_path = user_id::text || '/' || id::text || '/video')
);
alter table public.contributions enable row level security;
create policy "Read own contributions" on public.contributions for select to authenticated using(user_id=auth.uid());
create table public.upload_sessions (
 id uuid primary key,user_id uuid not null references auth.users(id),
 object_path text not null,upload_id text,clip jsonb not null,
 created_at timestamptz not null default now(),
 check(object_path = user_id::text || '/' || id::text || '/video')
);
alter table public.upload_sessions enable row level security;
-- Server service role writes completed contributions and upload sessions.
-- No Supabase Storage bucket is needed for new installations.
