// request-email-verification: emails the signed-in email + password user a 6-digit code to confirm
// their address (client revisions 10/14 p.18, N5). Body: { mode?: 'ensure' | 'resend', email? }.
// "ensure" keeps a code that is still usable (opening the screen again never replaces it), "resend"
// is the "Resend code" button (60 second cooldown, hourly cap), and `email` is "Wrong email? Change
// it.": it fixes the address on the unverified account (never one another account uses) and sends
// a fresh code. Only a hash of the code is stored; the code itself is only in the email.
// The logic lives in _shared/accountSecurity.ts (tested in Jest). Deno runtime.
import { corsHeaders, json } from '../_shared/cors.ts';
import { requestVerification } from '../_shared/accountSecurity.ts';
import { callerFrom, makeSecurityDeps } from '../_shared/securityDeps.ts';

// @ts-ignore Deno global
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const caller = await callerFrom(req);
    const body = await req.json().catch(() => ({}));
    const reply = await requestVerification(makeSecurityDeps(), caller, body);
    return json(reply.body, reply.status);
  } catch (e) {
    console.error(
      'request-email-verification failed: ' +
        (e instanceof Error ? e.message : 'unknown'),
    );
    return json({ error: 'internal' }, 500);
  }
});
