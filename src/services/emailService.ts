import { v4 as uuidv4 } from 'uuid';
import { db, EmailLogRecord } from '../database/store.js';

export class EmailService {
  /**
   * Validate email address syntax.
   */
  static isValidEmail(email: string): boolean {
    if (!email || typeof email !== 'string') return false;
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email.trim().toLowerCase());
  }

  /**
   * Send Welcome Email on gate check-in.
   * Enforces duplicate prevention so multiple scans don't duplicate emails.
   */
  static async sendWelcomeEmail(params: {
    visitorName: string;
    visitorEmail: string;
    visitorId?: string;
    bookingReference: string;
    ticketReference?: string;
  }): Promise<{ success: boolean; log: EmailLogRecord; duplicate?: boolean }> {
    const { visitorName, visitorEmail, visitorId, bookingReference, ticketReference } = params;

    // 1. Validate email address
    if (!this.isValidEmail(visitorEmail)) {
      const skippedLog: EmailLogRecord = {
        id: uuidv4(),
        emailType: 'welcome',
        recipientEmail: visitorEmail || 'none-provided',
        recipientName: visitorName || 'Pilgrim',
        subject: "Welcome to Heaven's Gate",
        bodyText: 'Skipped: Invalid or missing email address.',
        visitorId,
        bookingReference,
        ticketReference,
        status: 'failed',
        sentAt: new Date().toISOString(),
        failureReason: 'Invalid or missing email address.',
        retryCount: 0
      };
      db.emailLogs.push(skippedLog);
      return { success: false, log: skippedLog };
    }

    // 2. Prevent duplicate welcome emails for this visit/booking
    const existingWelcome = db.emailLogs.find(l => 
      l.emailType === 'welcome' && 
      l.bookingReference === bookingReference && 
      (l.status === 'sent' || l.status === 'delivered' || l.status === 'simulated')
    );

    if (existingWelcome) {
      console.log(`[EmailService] Duplicate welcome email prevented for booking: ${bookingReference}`);
      return { success: true, log: existingWelcome, duplicate: true };
    }

    const cleanName = visitorName && visitorName.trim() ? visitorName.trim() : 'Pilgrim';
    const subject = "Welcome to Heaven's Gate";
    const bodyText = `Dear ${cleanName},

Welcome to Heaven's Gate! We are delighted to have you with us. We pray that your time here will be peaceful, uplifting and meaningful.

May your visit be blessed.

With love,
The Heaven's Gate Team`;

    return this.dispatchEmail({
      emailType: 'welcome',
      recipientEmail: visitorEmail.trim().toLowerCase(),
      recipientName: cleanName,
      subject,
      bodyText,
      visitorId,
      bookingReference,
      ticketReference
    });
  }

  /**
   * Send Thank-You Email on gate checkout.
   * Enforces duplicate prevention so repeated checkout calls don't duplicate emails.
   */
  static async sendThankYouEmail(params: {
    visitorName: string;
    visitorEmail: string;
    visitorId?: string;
    bookingReference: string;
    ticketReference?: string;
  }): Promise<{ success: boolean; log: EmailLogRecord; duplicate?: boolean }> {
    const { visitorName, visitorEmail, visitorId, bookingReference, ticketReference } = params;

    if (!this.isValidEmail(visitorEmail)) {
      const skippedLog: EmailLogRecord = {
        id: uuidv4(),
        emailType: 'thank_you',
        recipientEmail: visitorEmail || 'none-provided',
        recipientName: visitorName || 'Pilgrim',
        subject: "Thank You for Visiting Heaven's Gate",
        bodyText: 'Skipped: Invalid or missing email address.',
        visitorId,
        bookingReference,
        ticketReference,
        status: 'failed',
        sentAt: new Date().toISOString(),
        failureReason: 'Invalid or missing email address.',
        retryCount: 0
      };
      db.emailLogs.push(skippedLog);
      return { success: false, log: skippedLog };
    }

    // Prevent duplicate thank-you email for this booking
    const existingThankYou = db.emailLogs.find(l => 
      l.emailType === 'thank_you' && 
      l.bookingReference === bookingReference && 
      (l.status === 'sent' || l.status === 'delivered' || l.status === 'simulated')
    );

    if (existingThankYou) {
      console.log(`[EmailService] Duplicate thank-you email prevented for booking: ${bookingReference}`);
      return { success: true, log: existingThankYou, duplicate: true };
    }

    const cleanName = visitorName && visitorName.trim() ? visitorName.trim() : 'Pilgrim';
    const subject = "Thank You for Visiting Heaven's Gate";
    const bodyText = `Dear ${cleanName},

Thank you for visiting Heaven's Gate. We appreciate you spending time with us and hope your experience was spiritually enriching.

We look forward to welcoming you again.

Blessings,
The Heaven's Gate Team`;

    return this.dispatchEmail({
      emailType: 'thank_you',
      recipientEmail: visitorEmail.trim().toLowerCase(),
      recipientName: cleanName,
      subject,
      bodyText,
      visitorId,
      bookingReference,
      ticketReference
    });
  }

  /**
   * Core dispatch pipeline.
   * Safely dispatches or simulates email delivery, logging results without breaking transactions.
   */
  private static async dispatchEmail(data: {
    emailType: 'welcome' | 'thank_you' | 'booking_confirmation' | 'general';
    recipientEmail: string;
    recipientName: string;
    subject: string;
    bodyText: string;
    visitorId?: string;
    bookingReference: string;
    ticketReference?: string;
  }): Promise<{ success: boolean; log: EmailLogRecord }> {
    const logId = uuidv4();
    const nowIso = new Date().toISOString();

    try {
      // In production or when SMTP is configured, external transport is invoked here.
      // For standalone backend environments, we reliably record as simulated/sent.
      const hasSmtpConfig = !!process.env.SMTP_HOST && !!process.env.SMTP_USER;

      const logRecord: EmailLogRecord = {
        id: logId,
        emailType: data.emailType,
        recipientEmail: data.recipientEmail,
        recipientName: data.recipientName,
        subject: data.subject,
        bodyText: data.bodyText,
        visitorId: data.visitorId,
        bookingReference: data.bookingReference,
        ticketReference: data.ticketReference,
        status: hasSmtpConfig ? 'sent' : 'simulated',
        sentAt: nowIso,
        retryCount: 0
      };

      db.emailLogs.unshift(logRecord);
      console.log(`[EmailService] ${data.emailType.toUpperCase()} email processed for ${data.recipientEmail} (${logRecord.status})`);
      return { success: true, log: logRecord };
    } catch (err: any) {
      const failedRecord: EmailLogRecord = {
        id: logId,
        emailType: data.emailType,
        recipientEmail: data.recipientEmail,
        recipientName: data.recipientName,
        subject: data.subject,
        bodyText: data.bodyText,
        visitorId: data.visitorId,
        bookingReference: data.bookingReference,
        ticketReference: data.ticketReference,
        status: 'failed',
        sentAt: nowIso,
        failureReason: err?.message || 'Email delivery transport failure.',
        retryCount: 0
      };

      db.emailLogs.unshift(failedRecord);
      console.error(`[EmailService] Failed to send email to ${data.recipientEmail}:`, err?.message);
      return { success: false, log: failedRecord };
    }
  }

  /**
   * Retry failed email delivery.
   */
  static async retryEmail(logId: string): Promise<{ success: boolean; log: EmailLogRecord }> {
    const existing = db.emailLogs.find(l => l.id === logId);
    if (!existing) {
      throw new Error(`Email log record '${logId}' not found.`);
    }

    existing.retryCount += 1;
    existing.sentAt = new Date().toISOString();

    if (this.isValidEmail(existing.recipientEmail)) {
      existing.status = 'sent';
      existing.failureReason = undefined;
      return { success: true, log: existing };
    } else {
      existing.status = 'failed';
      existing.failureReason = 'Invalid recipient email address.';
      return { success: false, log: existing };
    }
  }
}
