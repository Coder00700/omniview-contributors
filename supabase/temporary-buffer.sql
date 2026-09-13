-- User-requested removal of registration/ownership data. No video data is deleted.
drop table if exists public.contributor_vehicles;
drop table if exists public.vehicle_verifications;
alter table public.contributions drop column if exists plate;
alter table public.contributions drop column if exists vehicle_verified;
update public.contributions set metadata=metadata-'plate'-'vehicleVerified'-'vehicle_verified';
update public.upload_sessions set clip=clip-'plate'-'vehicleVerified'-'vehicle_verified';
alter table public.upload_sessions alter column upload_id drop not null;
alter table public.contributions add column if not exists b2_version_id text;
alter table public.contributions add column if not exists downloaded_at timestamptz;
alter table public.contributions add column if not exists local_sha256 text;
alter table public.contributions add column if not exists local_receipt text;
alter table public.contributions add column if not exists cloud_deleted_at timestamptz;
create or replace function public.reserve_buffer_clip(p_id uuid,p_user uuid,p_path text,p_clip jsonb)
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare existing public.upload_sessions;used_bytes bigint;requested bigint;
begin
 perform pg_advisory_xact_lock(832105431);
 select * into existing from public.upload_sessions where id=p_id for update;
 if found then
  if existing.user_id<>p_user then raise exception 'Clip identifier conflict';end if;
  if existing.upload_id is null and existing.created_at<now()-interval '5 minutes' then
   update public.upload_sessions set created_at=now() where id=p_id;
   return to_jsonb(existing)||jsonb_build_object('initialize',true);
  end if;
  return to_jsonb(existing)||jsonb_build_object('initialize',false);
 end if;
 requested=(p_clip->>'bytes')::bigint;
 if requested<1 or requested>524288000 then raise exception 'Invalid clip size';end if;
 select coalesce(sum(bytes),0) into used_bytes from public.contributions where cloud_deleted_at is null;
 select used_bytes+coalesce(sum((s.clip->>'bytes')::bigint),0) into used_bytes from public.upload_sessions s where not exists(select 1 from public.contributions c where c.id=s.id);
 -- 10 GB decimal target: admit 9.5 GB, reserving 500 MB headroom.
 if used_bytes+requested>9500000000 then return jsonb_build_object('full',true,'usedBytes',used_bytes);end if;
 insert into public.upload_sessions(id,user_id,object_path,upload_id,clip) values(p_id,p_user,p_path,null,p_clip) returning * into existing;
 return to_jsonb(existing)||jsonb_build_object('initialize',true);
end $$;
revoke all on function public.reserve_buffer_clip(uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.reserve_buffer_clip(uuid,uuid,text,jsonb) to service_role;
create index if not exists contributions_cleanup_idx on public.contributions(downloaded_at) where cloud_deleted_at is null;
