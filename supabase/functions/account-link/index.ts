// account-link: the account linking pre-check across Email, Google and Apple (client revisions
// 10/14 p.15-16 and p.19, N4). The app calls it BEFORE it hands a Google / Apple token to the auth
// server, because the auth server would otherwise link a sign-in to an existing account with the
// same email by itself (never merge automatically, p.15). Body:
//   { action: 'check', provider, id_token }               existing | new | link_required | ...
//   { action: 'email', email }                            provider_only (+ provider) | none
//   { action: 'confirm', email, proof, keep_session? }    the account's own provider proves it's them
//   { action: 'set_password', email, ticket, new_password }  a first password, only after confirm
// Works signed out (the anon key) and on the onboarding's anonymous session. Provider tokens are
// verified against Apple's / Google's published keys and our own client ids (secrets
// APPLE_CLIENT_ID, GOOGLE_OAUTH_CLIENT_IDS). Rate limited per IP, per provider account and per
// address (all hashed). Never logs a token, a password or an email address. The logic lives in
// _shared/accountSecurity.ts (tested in Jest). Deno runtime.
import { corsHeaders, json } from '../_shared/cors.ts';
import { accountLink } from '../_shared/accountSecurity.ts';
import { clientIp, makeLinkDeps } from '../_shared/securityDeps.ts';

// @ts-ignore Deno global
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const reply = await accountLink(makeLinkDeps(), body, clientIp(req));
    return json(reply.body, reply.status);
  } catch (e) {
    console.error('account-link failed: ' + (e instanceof Error ? e.message : 'unknown'));
    return json({ error: 'internal' }, 500);
  }
});
