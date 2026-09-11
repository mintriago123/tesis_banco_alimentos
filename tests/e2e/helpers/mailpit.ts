const MAILPIT_API_URL = process.env.MAILPIT_API_URL ?? 'http://127.0.0.1:8025';

interface MailpitSearchResult {
  messages: Array<{ ID: string }>;
}

interface MailpitMessage {
  Text: string;
  HTML: string;
}

export async function isMailpitReachable(): Promise<boolean> {
  try {
    const response = await fetch(`${MAILPIT_API_URL}/api/v1/info`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

export async function purgeMailpitInbox(): Promise<void> {
  await fetch(`${MAILPIT_API_URL}/api/v1/messages`, { method: 'DELETE' });
}

/** Polls Mailpit for the newest message to `recipientEmail`, retrying until `timeoutMs`. */
export async function waitForMailpitMessage(
  recipientEmail: string,
  options: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<{ id: string; text: string; html: string }> {
  const timeoutMs = options.timeoutMs ?? 15_000;
  const intervalMs = options.intervalMs ?? 500;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const searchUrl = `${MAILPIT_API_URL}/api/v1/search?query=${encodeURIComponent(`to:${recipientEmail}`)}`;
    const searchResponse = await fetch(searchUrl);
    if (searchResponse.ok) {
      const { messages }: MailpitSearchResult = await searchResponse.json();
      if (messages.length > 0) {
        const messageResponse = await fetch(`${MAILPIT_API_URL}/api/v1/message/${messages[0].ID}`);
        const message: MailpitMessage = await messageResponse.json();
        return { id: messages[0].ID, text: message.Text, html: message.HTML };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }

  throw new Error(`No llegó ningún correo a Mailpit para ${recipientEmail} dentro de ${timeoutMs}ms.`);
}

export function extractResetUrl(emailBody: string): string {
  const match = emailBody.match(/https?:\/\/[^\s"<]+\/auth\/restablecer-contrasena\?token=[a-f0-9]+/);
  if (!match) {
    throw new Error('No se encontró un enlace de restablecimiento en el correo capturado.');
  }
  return match[0];
}
