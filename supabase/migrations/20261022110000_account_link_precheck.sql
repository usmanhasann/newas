-- Account linking pre-check (N4, client revisions 10/14 p.15-16 and p.19).
--
-- The auth server links a Google / Apple sign-in to an existing account with the same email by
-- itself, and that cannot be switched off. So the app asks the account-link Edge Function first,
-- before any Google / Apple token reaches the auth server. To answer "is this sign-in already a way
-- into an account?" the function needs the owner of a Google / Apple identity, looked up by the
-- provider's own account id (identities.provider_id = the token's subject), never by email text
-- (p.19). The auth schema isn't reachable through the API, hence this small private function.
--
-- Server-only: the service role (the Edge Function) is its only caller. It reads one row through
-- the existing unique (provider_id, provider) index and changes nothing. The account-link Edge
-- Function also needs migration 20261022100000 (rate limits, accounts, verified addresses), which
-- is applied before this one.

create or replace function public.auth_identity_owner(p_provider text, p_provider_id text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select i.user_id
    from auth.identities i
   where i.provider = p_provider
     and i.provider_id = p_provider_id
     and p_provider in ('google', 'apple')
   limit 1;
$$;

-- Supabase grants new public functions to the app roles by default: revoke explicitly.
revoke all on function public.auth_identity_owner(text, text) from public, anon, authenticated;
grant execute on function public.auth_identity_owner(text, text) to service_role;
