// update-password: change the password (the current one required) or set a first password for a
// Google / Apple only account (only after signing in again with that provider), from Sign-in &
// Security (client revisions 10/14 p.19-20, N5). Body: { action: 'change', current_password,
// new_password } | { action: 'set', new_password, reauth }. Afterwards every session is signed out
// and the app signs this device in again with the new password, so only the OTHER devices stay
// signed out. The logic lives in _shared/accountSecurity.ts (tested in Jest).
import { corsHeaders, json } from '../_shared/cors.ts';
import { updatePassword } from '../_shared/accountSecurity.ts';
import { callerFrom, makeSecurityDeps } from '../_shared/securityDeps.ts';

// @ts-ignore Deno global
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const caller = await callerFrom(req);
    const body = await req.json().catch(() => ({}));
    const reply = await updatePassword(makeSecurityDeps(), caller, body);
    return json(reply.body, reply.status);
  } catch (e) {
    console.error(
      'update-password failed: ' + (e instanceof Error ? e.message : 'unknown'),
    );
    return json({ error: 'internal' }, 500);
  }
});
