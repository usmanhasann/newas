-- ============================================================================
-- 20260929140000_widget_feed.sql
-- Home-screen widget (client spec 2026-09-29): a Private circle's members' latest moods on the
-- phone's home screen.
--
-- The iOS widget fetches its OWN data on iOS's refresh schedule (~15–60 min), even when LYSM isn't
-- open. It can't borrow the app's login session — Supabase rotates refresh tokens, so a second
-- holder would sign the app out — so each install gets its own READ-ONLY widget key: a random
-- secret the app puts in the shared App Group; only its SHA-256 is stored here. A key can do exactly
-- one thing (read the feed for a Private circle its owner is in), is revoked on sign-out, and is
-- deleted with the account.
--
-- What the feed returns (the widget applies the time rules as the clock moves):
--   * OTHER approved members only — never the viewer.
--   * Per member, their newest entry SHARED to this circle in the last 24 hours (all of that
--     entry's moods, in the order they were picked), or none.
--   * 4 or fewer other members: all of them (so each gets a slot, blank when nothing recent).
--     5 or more: only those with a recent entry, newest first (the widget shows the top 4).
-- ============================================================================

create table if not exists public.widget_keys (
  key_hash     text primary key, -- sha256 hex of the secret; the secret itself is never stored
  user_id      uuid not null references auth.users (id) on delete cascade,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);
create index if not exists widget_keys_user_idx on public.widget_keys (user_id, created_at desc);
alter table public.widget_keys enable row level security;
revoke all on table public.widget_keys from anon, authenticated;

-- Mint a key for the signed-in caller and return the secret (the only time it's visible).
create or replace function public.create_widget_key()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid := auth.uid();
  secret text;
begin
  if uid is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  secret := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.widget_keys (key_hash, user_id)
  values (encode(extensions.digest(secret, 'sha256'), 'hex'), uid);
  -- Keep each person to their 5 newest keys (typically one per device).
  delete from public.widget_keys k
   where k.user_id = uid
     and k.key_hash not in (
       select k2.key_hash from public.widget_keys k2
        where k2.user_id = uid
        order by k2.created_at desc
        limit 5
     );
  return secret;
end;
$$;

revoke all on function public.create_widget_key() from public, anon;
grant execute on function public.create_widget_key() to authenticated;

-- Revoke one of the caller's keys (signing out on that device).
create or replace function public.revoke_widget_key(p_key text)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  delete from public.widget_keys
   where key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')
     and user_id = auth.uid();
$$;

revoke all on function public.revoke_widget_key(text) from public, anon;
grant execute on function public.revoke_widget_key(text) to authenticated;

-- The widget's data for one Private circle. Callable with just the public (anon) API key — the
-- widget key IS the credential. Timestamps are epoch milliseconds (simple to read on-device).
create or replace function public.widget_feed(p_key text, p_circle uuid)
returns json
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  uid uuid;
  cname text;
  others int;
begin
  update public.widget_keys
     set last_used_at = now()
   where key_hash = encode(extensions.digest(coalesce(p_key, ''), 'sha256'), 'hex')
  returning user_id into uid;
  if uid is null then
    return json_build_object('error', 'invalid_key');
  end if;

  select c.name into cname
    from public.circles c
   where c.id = p_circle
     and c.type = 'private'
     and public.is_circle_member(c.id, uid);
  if cname is null then
    return json_build_object('error', 'no_circle');
  end if;

  select count(*) into others
    from public.circle_members m
   where m.circle_id = p_circle and m.status = 'approved' and m.user_id <> uid;

  return json_build_object(
    'circle', cname,
    'member_count', others,
    'generated_at', (extract(epoch from now()) * 1000)::bigint,
    'members', coalesce((
      select json_agg(json_build_object(
               'id', t.user_id,
               'name', t.name,
               'avatar', t.avatar,
               'moods', coalesce(t.moods, '[]'::json),
               'at', t.at)
             order by t.at desc nulls last, t.name)
        from (
          select m.user_id,
                 coalesce(nullif(trim(p.display_name), ''), 'Member') as name,
                 p.avatar_url as avatar,
                 le.moods,
                 (extract(epoch from le.created_at) * 1000)::bigint as at
            from public.circle_members m
            left join public.profiles p on p.user_id = m.user_id
            left join lateral (
              select e.created_at,
                     (select json_agg(md.label order by x.ord)
                        from unnest(e.mood_slugs) with ordinality as x (slug, ord)
                        join public.moods md on md.slug = x.slug) as moods
                from public.entry_shares es
                join public.journal_entries e on e.id = es.entry_id
               where es.circle_id = p_circle
                 and e.user_id = m.user_id
                 and e.created_at > now() - interval '24 hours'
               order by e.created_at desc
               limit 1
            ) le on true
           where m.circle_id = p_circle
             and m.status = 'approved'
             and m.user_id <> uid
             and (others <= 4 or le.created_at is not null)
           order by le.created_at desc nulls last, name
           limit 50
        ) t
    ), '[]'::json)
  );
end;
$$;

revoke all on function public.widget_feed(text, uuid) from public;
grant execute on function public.widget_feed(text, uuid) to anon, authenticated;
