// change-email: change the email of the signed-in account from Sign-in & Security (client revisions
// 10/14 p.19 and p.21, N5). Body: { action: 'request', new_email, current_password?, reauth? } then
// { action: 'confirm', new_email, code }. The current password comes first (an Apple "Hide My
// Email" account without a password signs in with Apple again instead); an address another account
// uses is refused, never merged; the code goes only to the NEW address; the change takes effect on
// confirm, and a heads-up goes to the old address. Google / Apple only accounts are read-only,
// except an Apple relay address. The logic lives in _shared/accountSecurity.ts (tested in Jest).
import { corsHeaders, json } from '../_shared/cors.ts';
import { changeEmail } from '../_shared/accountSecurity.ts';
import { callerFrom, makeSecurityDeps } from '../_shared/securityDeps.ts';

// @ts-ignore Deno global
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const caller = await callerFrom(req);
    const body = await req.json().catch(() => ({}));
    const reply = await changeEmail(makeSecurityDeps(), caller, body);
    return json(reply.body, reply.status);
  } catch (e) {
    console.error('change-email failed: ' + (e instanceof Error ? e.message : 'unknown'));
    return json({ error: 'internal' }, 500);
  }
});
