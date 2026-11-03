// confirm-email-verification: checks the 6-digit code the user typed into the app and marks their
// CURRENT email address verified (client revisions 10/14 p.18, N5). Body: { code }. A code expires
// after 10 minutes, works once and locks after 5 wrong tries (ask for a new one). Signed-in callers
// only (verify_jwt = true): the old emailed link is gone, the code is typed in the app.
// The logic lives in _shared/accountSecurity.ts (tested in Jest). Deno runtime.
import { corsHeaders, json } from '../_shared/cors.ts';
import { confirmVerification } from '../_shared/accountSecurity.ts';
import { callerFrom, makeSecurityDeps } from '../_shared/securityDeps.ts';

// @ts-ignore Deno global
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  try {
    const caller = await callerFrom(req);
    const body = await req.json().catch(() => ({}));
    const reply = await confirmVerification(makeSecurityDeps(), caller, body);
    return json(reply.body, reply.status);
  } catch (e) {
    console.error(
      'confirm-email-verification failed: ' +
        (e instanceof Error ? e.message : 'unknown'),
    );
    return json({ error: 'internal' }, 500);
  }
});
