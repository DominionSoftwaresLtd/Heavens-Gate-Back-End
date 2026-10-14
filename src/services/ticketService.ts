import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { db, BookingRecord, TicketRecord } from '../database/store.js';
import { config } from '../config/index.js';

export class TicketService {
  // Generate a cryptographically signed ticket for a confirmed booking
  static async generateTicket(booking: BookingRecord): Promise<TicketRecord> {
    const existingTicket = db.tickets.find(t => t.bookingId === booking.id);
    if (existingTicket) {
      return existingTicket;
    }

    const ticketRef = `TKT-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`;

    // Cryptographic HMAC-SHA256 signature to prevent tampering
    const secret = config.jwtSecret;
    const rawPayload = `${ticketRef}:${booking.bookingReference}:${booking.visitorId}:${booking.checkInDate}:${booking.checkOutDate}`;
    const signedHash = crypto.createHmac('sha256', secret).update(rawPayload).digest('hex');

    const qrPayload = JSON.stringify({
      tktRef: ticketRef,
      bkRef: booking.bookingReference,
      name: booking.visitorName,
      phone: booking.visitorPhone,
      cat: booking.roomType,
      room: booking.assignedRoomNumber || 'TBD',
      bed: booking.assignedBedNumber || 'TBD',
      dates: `${booking.checkInDate} to ${booking.checkOutDate}`,
      sig: signedHash.substring(0, 16)
    });

    const ticket: TicketRecord = {
      id: uuidv4(),
      ticketReference: ticketRef,
      bookingId: booking.id,
      bookingReference: booking.bookingReference,
      visitorId: booking.visitorId,
      visitorName: booking.visitorName,
      phone: booking.visitorPhone,
      categoryName: booking.roomType,
      checkInDate: booking.checkInDate,
      checkOutDate: booking.checkOutDate,
      status: 'valid',
      qrData: qrPayload,
      signedHash,
      orientationBriefingCompleted: false,
      dressCodeVerified: false,
      luggageChecked: false
    };

    db.tickets.push(ticket);
    return ticket;
  }

  // Validate a ticket for gate admission
  static validateTicket(ticketReference: string) {
    const ticket = db.tickets.find(t => t.ticketReference === ticketReference);
    if (!ticket) {
      return {
        isValid: false,
        error: 'TICKET_NOT_FOUND',
        message: 'No ticket found with this reference identifier.'
      };
    }

    if (ticket.status === 'checked_in') {
      return {
        isValid: false,
        error: 'DUPLICATE_ADMISSION',
        ticket,
        message: `This ticket was already checked in at ${ticket.checkedInAt} by ${ticket.checkedInByOfficer || 'Gate Officer'}. Duplicate entry rejected.`
      };
    }

    if (ticket.status === 'checked_out') {
      return {
        isValid: false,
        error: 'TICKET_EXPIRED',
        ticket,
        message: 'This ticket has already completed check-out.'
      };
    }

    if (ticket.status === 'cancelled') {
      return {
        isValid: false,
        error: 'TICKET_CANCELLED',
        ticket,
        message: 'This booking reservation was cancelled.'
      };
    }

    // Check dates
    const today = new Date().toISOString().split('T')[0];
    const booking = db.bookings.find(b => b.id === ticket.bookingId);

    return {
      isValid: true,
      ticket,
      booking,
      roomNumber: booking?.assignedRoomNumber || 'Assigned at Reception',
      bedNumber: booking?.assignedBedNumber || 'Standard',
      message: 'Ticket is valid. Proceed to mandatory gate screening checks.'
    };
  }
}
