// password-reset: "Forgot password" by a 6-digit code (client revisions 10/14 p.20, N5). Body:
// { action: 'request', email } then { action: 'verify', email, code } then { action: 'complete',
// email, reset_token, new_password }. Works signed out (the anon key) and signed in ("Forgot your
// current password?"). Google / Apple only accounts get no email (the app names the provider); no
// email goes to an address without an account. Codes expire, work once and lock after 5 wrong
// tries; the reset signs out every session of the account (the app signs this device in again).
// Rate limited per address and per IP (both hashed). The logic lives in _shared/accountSecurity.ts
// (tested in Jest). Deno runtime.
import { corsHeaders, json } from '../_shared/cors.ts';
import { passwordReset } from '../_shared/accountSecurity.ts';
import { clientIp, makeSecurityDeps } from '../_shared/securityDeps.ts';

// @ts-ignore Deno global
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const body = await req.json().catch(() => ({}));
    const reply = await passwordReset(makeSecurityDeps(), body, clientIp(req));
    return json(reply.body, reply.status);
  } catch (e) {
    console.error(
      'password-reset failed: ' + (e instanceof Error ? e.message : 'unknown'),
    );
    return json({ error: 'internal' }, 500);
  }
});
