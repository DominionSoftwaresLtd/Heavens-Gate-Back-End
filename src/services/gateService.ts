import { v4 as uuidv4 } from 'uuid';
import { db, GateEventRecord, VisitRecord } from '../database/store.js';
import { config } from '../config/index.js';
import { EmailService } from './emailService.js';

export class GateService {
  // Check gate opening hours (5:00 AM - 8:00 PM)
  static isGateOpen(): { isOpen: boolean; currentHour: number; message: string } {
    const now = new Date();
    // Use Kenya local time (UTC+3)
    const kenyaHour = (now.getUTCHours() + 3) % 24;

    const isOpen = kenyaHour >= config.gate.openingHour && kenyaHour < config.gate.closingHour;
    return {
      isOpen,
      currentHour: kenyaHour,
      message: isOpen 
        ? `Gates are currently OPEN (Standard operating window: 5:00 AM to 8:00 PM).`
        : `Gates are currently CLOSED (Standard hours: 5:00 AM to 8:00 PM). Emergency exceptions require supervisor approval.`
    };
  }

  // Complete admission check-in atomically
  static checkInPilgrim(params: {
    ticketReference: string;
    officerName: string;
    checks: {
      dressCode: boolean;
      orientation: boolean;
      identity: boolean;
      luggageNoFood: boolean;
    };
    notes?: string;
  }) {
    const { ticketReference, officerName, checks, notes } = params;

    const ticket = db.tickets.find(t => t.ticketReference === ticketReference);
    if (!ticket) {
      throw new Error(`Ticket '${ticketReference}' not found.`);
    }

    if (ticket.status === 'checked_in') {
      throw new Error(`Duplicate check-in rejected. Pilgrim was already checked in at ${ticket.checkedInAt}.`);
    }

    // Verify all mandatory gate checklist requirements
    if (!checks.dressCode || !checks.orientation || !checks.identity || !checks.luggageNoFood) {
      throw new Error('All mandatory gate checks (Modest Dress, Security Orientation, National ID Verification, and Strict Luggage Inspection) must be verified before admission.');
    }

    const nowIso = new Date().toISOString();

    // 1. Update Ticket
    ticket.status = 'checked_in';
    ticket.checkedInAt = nowIso;
    ticket.checkedInByOfficer = officerName;
    ticket.dressCodeVerified = true;
    ticket.orientationBriefingCompleted = true;
    ticket.luggageChecked = true;

    // 2. Update Booking
    const booking = db.bookings.find(b => b.id === ticket.bookingId);
    if (booking) {
      booking.status = 'checked_in';
    }

    // 3. Update User/Visitor record if exists
    const user = db.users.find(u => u.id === ticket.visitorId || (ticket.phone && u.phone === ticket.phone));
    if (user) {
      user.totalVisits = (user.totalVisits || 0) + 1;
      user.isFirstTime = false;
      user.updatedAt = nowIso;
    }

    // 4. Create or Update Separate Chronological Visit Record
    let visit = db.visits.find(v => v.bookingReference === ticket.bookingReference || v.ticketReference === ticket.ticketReference);
    if (visit) {
      visit.status = 'checked_in';
      visit.checkInTime = nowIso;
      visit.officerName = officerName;
      visit.updatedAt = nowIso;
    } else {
      visit = {
        id: uuidv4(),
        memberId: user?.id || ticket.visitorId,
        visitorName: ticket.visitorName,
        visitorPhone: ticket.phone,
        visitorEmail: booking?.visitorEmail || user?.email || '',
        bookingId: booking?.id || ticket.bookingId,
        bookingReference: ticket.bookingReference,
        ticketId: ticket.id,
        ticketReference: ticket.ticketReference,
        checkInDate: ticket.checkInDate,
        checkOutDate: ticket.checkOutDate,
        checkInTime: nowIso,
        status: 'checked_in',
        roomNumber: booking?.assignedRoomNumber,
        bedNumber: booking?.assignedBedNumber,
        officerName,
        notes: notes || 'Admitted via QR Gate Scan.',
        createdAt: nowIso,
        updatedAt: nowIso
      };
      db.visits.push(visit);
    }

    // 5. Create Immutable Gate Event Record
    const gateEvent: GateEventRecord = {
      id: uuidv4(),
      ticketId: ticket.id,
      bookingReference: ticket.bookingReference,
      visitorName: ticket.visitorName,
      eventType: 'check_in',
      timestamp: nowIso,
      officerName,
      notes: notes || 'Standard admission screening cleared successfully.',
      checks
    };

    db.gateEvents.push(gateEvent);

    // 6. Automated Welcome Email Trigger (Safe non-blocking execution)
    const emailToUse = booking?.visitorEmail || user?.email || '';
    if (emailToUse) {
      EmailService.sendWelcomeEmail({
        visitorName: ticket.visitorName,
        visitorEmail: emailToUse,
        visitorId: user?.id || ticket.visitorId,
        bookingReference: ticket.bookingReference,
        ticketReference: ticket.ticketReference
      }).catch(err => console.error('[GateService] Welcome email dispatch error:', err));
    }

    return {
      success: true,
      ticket,
      booking,
      visit,
      assignedRoom: booking?.assignedRoomNumber || 'Mount Zion Z-101',
      assignedBed: booking?.assignedBedNumber || 'Bed 1',
      gateEvent,
      message: `Welcome to Heavens Gate Prayer Mountain, ${ticket.visitorName}! Check-in completed.`
    };
  }

  // Pilgrim Checkout
  static checkOutPilgrim(params: {
    ticketReference: string;
    officerName: string;
    notes?: string;
  }) {
    const { ticketReference, officerName, notes } = params;

    const ticket = db.tickets.find(t => t.ticketReference === ticketReference);
    if (!ticket) {
      throw new Error(`Ticket '${ticketReference}' not found.`);
    }

    if (ticket.status !== 'checked_in') {
      throw new Error(`Cannot check out ticket with status: '${ticket.status}'.`);
    }

    const nowIso = new Date().toISOString();
    ticket.status = 'checked_out';

    const booking = db.bookings.find(b => b.id === ticket.bookingId);
    if (booking) {
      booking.status = 'checked_out';

      // Release bed back to inventory
      if (booking.assignedRoomId) {
        const room = db.rooms.find(r => r.id === booking.assignedRoomId);
        if (room && room.occupiedBeds > 0) {
          room.occupiedBeds -= 1;
        }
      }
    }

    // Update Chronological Visit Record
    const visit = db.visits.find(v => v.bookingReference === ticket.bookingReference || v.ticketReference === ticket.ticketReference);
    if (visit) {
      visit.status = 'checked_out';
      visit.checkOutTime = nowIso;
      visit.updatedAt = nowIso;
    }

    const gateEvent: GateEventRecord = {
      id: uuidv4(),
      ticketId: ticket.id,
      bookingReference: ticket.bookingReference,
      visitorName: ticket.visitorName,
      eventType: 'check_out',
      timestamp: nowIso,
      officerName,
      notes: notes || 'Departure recorded. Pilgrim checked out safely.',
      checks: {
        dressCode: true,
        orientation: true,
        identity: true,
        luggageNoFood: true
      }
    };

    db.gateEvents.push(gateEvent);

    // Automated Thank-You Email Trigger (Safe non-blocking execution)
    const user = db.users.find(u => u.id === ticket.visitorId || (ticket.phone && u.phone === ticket.phone));
    const emailToUse = booking?.visitorEmail || user?.email || '';
    if (emailToUse) {
      EmailService.sendThankYouEmail({
        visitorName: ticket.visitorName,
        visitorEmail: emailToUse,
        visitorId: user?.id || ticket.visitorId,
        bookingReference: ticket.bookingReference,
        ticketReference: ticket.ticketReference
      }).catch(err => console.error('[GateService] Thank-you email dispatch error:', err));
    }

    return {
      success: true,
      ticket,
      booking,
      visit,
      message: `Checkout successful for ${ticket.visitorName}. Go with God's blessings!`
    };
  }
}
