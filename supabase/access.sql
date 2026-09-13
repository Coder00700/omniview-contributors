revoke all on public.contributions,public.upload_sessions from anon,authenticated;
grant select on public.contributions to authenticated;
grant all on public.contributions,public.upload_sessions to service_role;
create index if not exists contributions_user_created_idx on public.contributions(user_id,created_at desc);
create index if not exists upload_sessions_user_created_idx on public.upload_sessions(user_id,created_at desc);
