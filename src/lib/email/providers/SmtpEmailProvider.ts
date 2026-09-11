import 'server-only';

import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailOptions, EmailProvider, Recipient } from '../types';
import type { ResolvedEmailConfig } from '../config';

function normalizeRecipient(recipient?: Recipient): string | undefined {
  if (!recipient) return undefined;
  return Array.isArray(recipient) ? recipient.join(',') : recipient;
}

/**
 * Generic SMTP transport with no vendor host baked in — unlike
 * GmailEmailProvider, which is hardcoded to smtp.gmail.com. Used for local
 * dev / e2e mail capture (Mailpit), pointed at EMAIL_SMTP_HOST/PORT.
 */
export class SmtpEmailProvider implements EmailProvider {
  private transporter: Transporter;
  private readonly defaultFrom: string;

  constructor(config: ResolvedEmailConfig) {
    this.defaultFrom = `"${config.defaultFromName}" <${config.defaultFromEmail}>`;

    this.transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.secure,
    });
  }

  async sendEmail(options: EmailOptions): Promise<void> {
    const to = normalizeRecipient(options.to);
    if (!to) {
      throw new Error('El campo "to" es obligatorio para enviar un correo.');
    }

    await this.transporter.sendMail({
      to,
      from: options.from ?? this.defaultFrom,
      subject: options.subject,
      html: options.html,
      text: options.text,
      cc: normalizeRecipient(options.cc),
      bcc: normalizeRecipient(options.bcc),
      replyTo: options.replyTo,
      headers: options.headers,
      attachments: options.attachments,
    });
  }
}
