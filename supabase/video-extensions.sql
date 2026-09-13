-- Keep legacy object names while permitting explicit media extensions.
begin;
do $$
declare t text; c record;
begin
  foreach t in array array['contributions', 'upload_sessions'] loop
    for c in select conname from pg_constraint
      where conrelid = ('public.' || t)::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%object_path%'
    loop
      execute format('alter table public.%I drop constraint %I', t, c.conname);
    end loop;
    execute format('alter table public.%I add constraint %I check (object_path in (user_id::text || ''/'' || id::text || ''/video'', user_id::text || ''/'' || id::text || ''/video.webm'', user_id::text || ''/'' || id::text || ''/video.mp4''))', t, t || '_object_path_check');
  end loop;
end $$;
commit;
