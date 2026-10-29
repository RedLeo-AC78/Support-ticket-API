import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { emailValue } from './security.js';

export type Mail = { to: string; subject: string; text: string };
export type MailDelivery = { status: 'local' | 'accepted' };
export type Mailer = (mail: Mail) => Promise<MailDelivery>;

export function createMailer(env: NodeJS.ProcessEnv = process.env, send: typeof fetch = fetch): Mailer {
  const mode = env.MAIL_MODE ?? 'local';
  if (mode === 'local') {
    if (env.NODE_ENV === 'production') throw new Error('MAIL_MODE=local est interdit en production. Configurer Brevo.');
    const directory = resolve('work/mail-outbox');
    return async mail => {
      await mkdir(directory, { recursive: true, mode: 0o700 });
      await writeFile(resolve(directory, `${Date.now()}-${randomUUID()}.json`), JSON.stringify(mail, null, 2), { mode: 0o600, flag: 'wx' });
      return { status: 'local' }; // Un fichier de test, pas un email envoyé.
    };
  }
  if (mode !== 'brevo') throw new Error('MAIL_MODE doit être local ou brevo.');
  const apiKey = env.BREVO_API_KEY;
  if (!apiKey?.trim()) throw new Error('BREVO_API_KEY manque dans .env.');
  const email = emailValue(env.MAIL_FROM_EMAIL);
  const name = env.MAIL_FROM_NAME?.trim() || 'Support Ticket';
  return async mail => {
    try {
      const response = await send('https://api.brevo.com/v3/smtp/email', {
        method: 'POST', signal: AbortSignal.timeout(10000), redirect: 'error',
        headers: { 'api-key': apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ sender: { email, name }, to: [{ email: mail.to }], subject: mail.subject, textContent: mail.text }),
      });
      // Ne pas journaliser le corps fournisseur : il peut contenir des données confidentielles.
      await response.body?.cancel();
      if (response.status !== 201) throw new Error('Envoi refusé.');
      return { status: 'accepted' }; // Accepté par Brevo ; la livraison finale n'est pas garantie.
    } catch { throw new Error('Le fournisseur email est indisponible ou a refusé l’envoi.'); }
  };
}
