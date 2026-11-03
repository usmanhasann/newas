-- ============================================================================
-- 20260929180000_crisis_copy_no_dashes.sql
-- No dashes anywhere in the app (client spec 2026-09-29). The crisis support messages are stored
-- here (seeded in 20260619095000), so their dash punctuation is rewritten in place. Only the
-- punctuation changes; the wording and meaning stay the same. Matched on the exact old text, so
-- this is safe to run on any environment and a no-op the second time.
-- ============================================================================

update public.crisis_keywords
   set title = 'Please reach out right now'
 where title = 'Please reach out — right now';

update public.crisis_keywords
   set title = 'Take a breath. You''re not alone'
 where title = 'Take a breath — you''re not alone';

update public.crisis_keywords
   set message = replace(message,
     'Reaching out is a brave first step — support is one call or text away.',
     'Reaching out is a brave first step, and support is one call or text away.')
 where message like '%Reaching out is a brave first step — support%';

update public.crisis_keywords
   set message = replace(message,
     'it can be hard to see a way forward — but you don''t have to figure it out alone.',
     'it can be hard to see a way forward, but you don''t have to figure it out alone.')
 where message like '%hard to see a way forward — but%';

update public.crisis_keywords
   set message = replace(message,
     'Please let a trained counselor support you — they''re available right now,',
     'Please let a trained counselor support you. They''re available right now,')
 where message like '%counselor support you — they%';

update public.crisis_keywords
   set message = replace(message,
     'work through these urges — you can call or text 988 any time.',
     'work through these urges. You can call or text 988 any time.')
 where message like '%these urges — you can%';

update public.crisis_keywords
   set message = replace(message,
     'it can be hard to believe things will change — but feelings,',
     'it can be hard to believe things will change, but feelings,')
 where message like '%things will change — but%';
