import { v4 as uuidv4 } from 'uuid';
import { db, PaymentRecord } from '../database/store.js';
import { TicketService } from './ticketService.js';
import { config } from '../config/index.js';

export class DarajaService {
  // Initiates M-Pesa STK Push
  static async initiateSTKPush(params: {
    bookingId: string;
    bookingReference: string;
    phone: string;
    amountKES: number;
  }) {
    const { bookingId, bookingReference, phone, amountKES } = params;
    const booking = db.bookings.find(b => b.id === bookingId);
    if (!booking) {
      throw new Error(`Booking ${bookingId} not found.`);
    }

    // Format phone to standard Kenyan format (2547XXXXXXXX or 2541XXXXXXXX)
    let formattedPhone = phone.trim().replace(/\s+/g, '');
    if (formattedPhone.startsWith('0')) {
      formattedPhone = '254' + formattedPhone.slice(1);
    } else if (formattedPhone.startsWith('+254')) {
      formattedPhone = formattedPhone.slice(1);
    }

    const checkoutRequestId = `ws_CO_${Date.now()}_${Math.floor(100000 + Math.random() * 900000)}`;
    const paymentRef = `PAY-MPESA-${Date.now()}`;

    // Create initiated payment record
    const paymentRecord: PaymentRecord = {
      id: uuidv4(),
      paymentReference: paymentRef,
      bookingId,
      bookingReference,
      checkoutRequestId,
      mpesaReceiptNumber: '',
      phone: formattedPhone,
      amountKES,
      status: 'initiated',
      paymentMethod: 'MPESA_STK',
      transactionDate: new Date().toISOString()
    };

    db.payments.push(paymentRecord);

    return {
      success: true,
      checkoutRequestId,
      paymentReference: paymentRef,
      phone: formattedPhone,
      amountKES,
      message: `M-Pesa STK push prompt initiated for KES ${amountKES} to ${formattedPhone}. Please enter your M-Pesa PIN on your phone.`
    };
  }

  // Idempotent callback handler for Safaricom Daraja Webhook
  static async processCallback(callbackData: {
    checkoutRequestId: string;
    resultCode: number;
    resultDesc: string;
    mpesaReceiptNumber?: string;
    amount?: number;
    phone?: string;
  }) {
    const { checkoutRequestId, resultCode, resultDesc, mpesaReceiptNumber } = callbackData;

    const payment = db.payments.find(p => p.checkoutRequestId === checkoutRequestId);
    if (!payment) {
      console.warn(`[Daraja] Unknown checkoutRequestId in callback: ${checkoutRequestId}`);
      return { success: false, message: 'Payment record not found' };
    }

    // Idempotency: if already completed, do not re-process
    if (payment.status === 'completed') {
      console.log(`[Daraja] Duplicate callback received for receipt ${payment.mpesaReceiptNumber}. Ignoring.`);
      return { success: true, message: 'Payment already completed (Idempotent)' };
    }

    if (resultCode === 0 && mpesaReceiptNumber) {
      // Check for duplicate receipt number across all payments (BR-03, BR-13)
      const existingReceipt = db.payments.find(p => p.mpesaReceiptNumber === mpesaReceiptNumber);
      if (existingReceipt) {
        console.warn(`[Daraja] Duplicate receipt detected: ${mpesaReceiptNumber}`);
        return { success: false, message: 'Duplicate receipt number detected' };
      }

      payment.status = 'completed';
      payment.mpesaReceiptNumber = mpesaReceiptNumber;
      payment.transactionDate = new Date().toISOString();

      // Transition booking to confirmed
      const booking = db.bookings.find(b => b.id === payment.bookingId);
      if (booking) {
        booking.status = 'confirmed';
        
        // Generate cryptographic QR Ticket
        const ticket = await TicketService.generateTicket(booking);
        booking.ticketId = ticket.id;

        console.log(`✅ [Daraja] Booking ${booking.bookingReference} confirmed. Ticket issued: ${ticket.ticketReference}`);
      }

      return { success: true, message: 'Payment verified and booking confirmed', ticketId: booking?.ticketId };
    } else {
      payment.status = 'failed';
      console.warn(`❌ [Daraja] Payment failed for request ${checkoutRequestId}: ${resultDesc}`);
      return { success: false, message: resultDesc };
    }
  }

  // Developer simulation helper for immediate end-to-end testing without phone interaction
  static async simulateInstantApproval(bookingId: string) {
    const booking = db.bookings.find(b => b.id === bookingId);
    if (!booking) throw new Error('Booking not found');

    const receipt = `QKH${Math.floor(1000000 + Math.random() * 9000000)}`;
    const checkoutRequestId = `ws_CO_SIM_${Date.now()}`;

    const payment: PaymentRecord = {
      id: uuidv4(),
      paymentReference: `PAY-SIM-${Date.now()}`,
      bookingId: booking.id,
      bookingReference: booking.bookingReference,
      checkoutRequestId,
      mpesaReceiptNumber: receipt,
      phone: booking.visitorPhone,
      amountKES: booking.totalAmountKES,
      status: 'completed',
      paymentMethod: 'MPESA_STK',
      transactionDate: new Date().toISOString()
    };

    db.payments.push(payment);
    booking.status = 'confirmed';

    const ticket = await TicketService.generateTicket(booking);
    booking.ticketId = ticket.id;

    return {
      success: true,
      receiptNumber: receipt,
      ticket
    };
  }
}
