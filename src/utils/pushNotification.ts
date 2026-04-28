import { Expo, ExpoPushMessage, ExpoPushTicket } from 'expo-server-sdk';

const expo = new Expo();

/**
 * Send a push notification to one or more Expo push tokens.
 * Silently logs errors — never throws, so callers don't need try/catch.
 */
export const sendPushNotification = async (
  tokens: (string | null | undefined)[],
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> => {
  // Filter valid Expo push tokens
  const validTokens = tokens.filter(
    (t): t is string => typeof t === 'string' && Expo.isExpoPushToken(t)
  );

  if (validTokens.length === 0) return;

  const messages: ExpoPushMessage[] = validTokens.map((token) => ({
    to: token,
    sound: 'default',
    title,
    body,
    data: data ?? {},
  }));

  try {
    const chunks = expo.chunkPushNotifications(messages);

    for (const chunk of chunks) {
      const tickets: ExpoPushTicket[] = await expo.sendPushNotificationsAsync(chunk);

      for (const ticket of tickets) {
        if (ticket.status === 'error') {
          console.error('📵 Push notification error:', ticket.message, ticket.details);
        }
      }
    }
  } catch (err) {
    console.error('📵 Failed to send push notifications:', err);
  }
};
