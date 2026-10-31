import type { Mailer } from './types.js';

/** Sends the login code through Resend (https://resend.com). */
export function resendMailer(
  apiKey: string | undefined,
  from: string,
  fetchImpl: typeof fetch = fetch,
): Mailer {
  return async (to, code) => {
    if (!apiKey) throw new Error('mail_not_configured');
    const res = await fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `Код входа в Дневник: ${code}`,
        text: `Ваш код входа: ${code}\n\nОн действует 10 минут. Если вы не запрашивали вход, просто проигнорируйте письмо.`,
        html: `<p>Ваш код входа в «Дневник»:</p><p style="font-size:28px;letter-spacing:4px;font-weight:700">${code}</p><p style="color:#666">Он действует 10 минут. Если вы не запрашивали вход, просто проигнорируйте письмо.</p>`,
      }),
    });
    if (!res.ok) throw new Error(`mail_failed_${res.status}`);
  };
}
