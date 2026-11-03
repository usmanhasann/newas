-- In-app notifications list (client revisions 10/14 p.8 and p.24).
-- Verifies migration 20261022130000_notifications_list AFTER it is applied: run against the database
-- (Management API query or psql). Everything runs in ONE DO block that always ends with
-- RAISE EXCEPTION, so nothing it creates is kept. Expected: the error "ROLLED BACK. ok=11 bad=0".
-- On a database without the migration it fails (the table does not exist).
do $test$
declare
  r text := '';
  ok int := 0;
  bad int := 0;
  n int;
  b boolean;
  k text;
  u1 uuid := gen_random_uuid();  -- the reader
  u2 uuid := gen_random_uuid();  -- someone else
  u3 uuid := gen_random_uuid();  -- the verified poster
  c uuid;
  p uuid;
  first_id uuid;
  first_at timestamptz;
begin
  -- @migration (pre-deploy runs insert the migration here; after deploy it is already applied)

  insert into auth.users (id, email, raw_user_meta_data, aud, role, created_at) values
    (u1, 'nl-1@lysm-test.invalid', '{"display_name":"Reader"}', 'authenticated', 'authenticated', now()),
    (u2, 'nl-2@lysm-test.invalid', '{"display_name":"Other"}', 'authenticated', 'authenticated', now()),
    (u3, 'nl-3@lysm-test.invalid', '{"display_name":"Auguste"}', 'authenticated', 'authenticated', now());
  update public.profiles set display_name = 'Auguste', verified = true where user_id = u3;
  insert into public.circles (owner_id, name, type) values (u3, 'NL circle', 'private') returning id into c;
  insert into public.circle_members (circle_id, user_id, role, status)
    values (c, u1, 'member', 'approved') on conflict do nothing;
  insert into public.circle_posts (circle_id, author_id, body) values (c, u3, 'Hello   there  friends')
    returning id into p;

  -- Rows as the Edge Functions write them (service role), oldest to newest.
  insert into public.notifications (user_id, kind, title, body, data, actor_id, created_at) values
    (u1, 'recap', 'Your Weekly Recap is ready', 'See it.', '{"type":"recap","recap_type":"weekly"}', null, now() - interval '3 hours'),
    (u1, 'post_created', 'New post', 'Auguste posted in NL circle.',
       jsonb_build_object('type', 'post_created', 'circle_id', c, 'post_id', p), u3, now() - interval '2 hours'),
    (u1, 'streak_reminder', 'Don’t lose your streak', 'Check in.', '{"type":"streak_reminder"}', null, now() - interval '1 hour'),
    (u1, 'recap', 'Old', 'Too old to show', '{"type":"recap"}', null, now() - interval '91 days'),
    (u2, 'recap', 'Not yours', 'x', '{"type":"recap"}', null, now());

  -- App users can't touch the table directly.
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform 1 from public.notifications limit 1;
      bad := bad + 1; r := r || ' direct read allowed;';
    exception when insufficient_privilege then ok := ok + 1;
    end;

    -- Their own rows only, newest first, 90 days.
    select count(*) into n from public.my_notifications(null, null, 30);
    if n = 3 then ok := ok + 1; else bad := bad + 1; r := r || ' list count=' || n || ';'; end if;
    select x.kind into k from public.my_notifications(null, null, 1) x limit 1;
    if k = 'streak_reminder' then ok := ok + 1; else bad := bad + 1; r := r || ' newest=' || coalesce(k, 'null') || ';'; end if;

    -- The post's live preview (one line) and the verified poster's name + badge.
    select count(*) into n from public.my_notifications(null, null, 30) x
     where x.kind = 'post_created' and x.preview = 'Hello there friends'
       and x.actor_name = 'Auguste' and x.actor_verified;
    if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' preview/badge missing;'; end if;

    -- Keyset: the page after the newest row.
    select x.id, x.created_at into first_id, first_at from public.my_notifications(null, null, 1) x;
    select count(*) into n from public.my_notifications(first_at, first_id, 30);
    if n = 2 then ok := ok + 1; else bad := bad + 1; r := r || ' next page=' || n || ';'; end if;

    -- The bell's dot, then marking read.
    b := public.has_unread_notifications();
    if b then ok := ok + 1; else bad := bad + 1; r := r || ' no unread;'; end if;
    n := public.mark_notifications_read();
    if n = 4 then ok := ok + 1; else bad := bad + 1; r := r || ' marked=' || n || ';'; end if;
    b := public.has_unread_notifications();
    if not b then ok := ok + 1; else bad := bad + 1; r := r || ' still unread;'; end if;
    execute 'reset role';
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' reader: ' || sqlerrm || ';';
  end;

  -- Someone else's row was not marked.
  select count(*) into n from public.notifications where user_id = u2 and read_at is null;
  if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' other marked;'; end if;

  -- A deleted post shows no preview.
  update public.circle_posts set deleted_at = now() where id = p;
  begin
    perform set_config('request.jwt.claims', json_build_object('sub', u1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from public.my_notifications(null, null, 30) x
     where x.kind = 'post_created' and x.preview is null;
    if n = 1 then ok := ok + 1; else bad := bad + 1; r := r || ' deleted post still previewed;'; end if;
    execute 'reset role';
  exception when others then execute 'reset role'; bad := bad + 1; r := r || ' deleted: ' || sqlerrm || ';';
  end;

  -- Deleting the account deletes its rows.
  delete from auth.users where id = u1;
  select count(*) into n from public.notifications where user_id = u1;
  if n = 0 then ok := ok + 1; else bad := bad + 1; r := r || ' rows kept after delete;'; end if;

  raise exception 'ROLLED BACK. ok=% bad=% %', ok, bad, r;
end
$test$;
