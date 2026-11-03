// Expo Push sender for the Deno Edge runtime. Notifications are delivered via Expo's
// push service (exp.host), which relays to FCM (Android) + APNs (iOS). NO FCM/APNs
// keys live on the server: Android's FCM v1 service account is uploaded to EAS and
// iOS APNs is managed by EAS. The only (optional) secret is EXPO_ACCESS_TOKEN, used
// when Expo's "enhanced security for push" is enabled.

// eslint-disable-next-line no-undef
const env = (k: string) => Deno.env.get(k);

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100; // Expo accepts up to 100 messages per request

export interface ExpoSendResult {
  /** Number of messages Expo accepted (ticket status "ok"). */
  sent: number;
  /** Tokens Expo reports as unregistered, so the caller can disable them. */
  invalidTokens: string[];
}

interface ExpoTicket {
  status?: string;
  details?: { error?: string };
}

function isExpoToken(t: string): boolean {
  return t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken[');
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Send one notification to many Expo push tokens. Best-effort: network/HTTP errors
 * skip a batch rather than throw. Returns how many Expo accepted and which tokens are
 * no longer registered.
 */
export async function sendExpoPush(
  tokens: string[],
  title: string,
  body: string,
  data: Record<string, string> = {},
): Promise<ExpoSendResult> {
  const valid = tokens.filter(isExpoToken);
  let sent = 0;
  const invalidTokens: string[] = [];

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const accessToken = env('EXPO_ACCESS_TOKEN');
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  for (const batch of chunk(valid, BATCH)) {
    const messages = batch.map((to) => ({ to, title, body, data, sound: 'default' }));
    let res: Response;
    try {
      res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers,
        body: JSON.stringify(messages),
      });
    } catch {
      continue; // network error — best-effort
    }
    if (!res.ok) continue;
    const payload = await res.json().catch(() => null);
    const tickets: ExpoTicket[] = payload?.data ?? [];
    tickets.forEach((ticket, i) => {
      if (ticket?.status === 'ok') {
        sent += 1;
      } else if (ticket?.details?.error === 'DeviceNotRegistered') {
        invalidTokens.push(batch[i]);
      }
    });
  }

  return { sent, invalidTokens };
}
