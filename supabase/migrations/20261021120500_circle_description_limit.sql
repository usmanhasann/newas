-- Circle descriptions are capped at 150 characters (client revisions 10/14, p.29). The Create Circle
-- and Circle Settings fields stop typing at 150 (maxLength); this re-checks it in the database so the
-- API can't be used to go past it.
--
-- char_length counts characters (code points). The app counts UTF-16 units, which is never fewer,
-- so anything the app lets through always passes here.
--
-- A description already over 150 (none in production on 2026-10-21) is cut to 150 first, so the
-- check can be added and later updates to that circle (such as the member count trigger) never fail.
update public.circles
   set description = left(description, 150)
 where char_length(description) > 150;

alter table public.circles drop constraint if exists circles_description_max_150;
alter table public.circles
  add constraint circles_description_max_150
  check (description is null or char_length(description) <= 150);
