const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_TOKEN_REGEX = /^ExponentPushToken\[.+\]$|^ExpoPushToken\[.+\]$/;
const CHUNK_SIZE = 100;

/** Returns true if the string looks like a valid Expo push token */
const isExpoPushToken = (t: string): boolean => EXPO_TOKEN_REGEX.test(t);

interface ExpoPushMessage {
  to: string;
  sound: 'default';
  title: string;
  body: string;
  data: Record<string, unknown>;
}

/**
 * Send a push notification to one or more Expo push tokens.
 * Calls Expo's HTTP push API directly — no SDK, no ESM issues.
 * Silently logs errors — never throws, so callers don't need try/catch.
 */
export const sendPushNotification = async (
  tokens: (string | null | undefined)[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> => {
  const validTokens = tokens.filter(
    (t): t is string => typeof t === 'string' && isExpoPushToken(t)
  );

  if (validTokens.length === 0) return;

  const messages: ExpoPushMessage[] = validTokens.map((token) => ({
    to: token,
    sound: 'default',
    title,
    body,
    data: data ?? {},
  }));

  // Chunk into batches of 100 (Expo's limit)
  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE);
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(chunk),
      });

      if (!res.ok) {
        console.error('📵 Expo push API error:', res.status, await res.text());
        continue;
      }

      const { data: tickets } = await res.json() as { data: { status: string; message?: string }[] };
      for (const ticket of tickets) {
        if (ticket.status === 'error') {
          console.error('📵 Push notification error:', ticket.message);
        }
      }
    } catch (err) {
      console.error('📵 Failed to send push notifications:', err);
    }
  }
};
