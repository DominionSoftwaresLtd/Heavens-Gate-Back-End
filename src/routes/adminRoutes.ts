import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, BookingRecord, GateEventRecord, UserRecord, VisitRecord, EmailLogRecord, TestimonyRecord } from '../database/store.js';
import { AccommodationService } from '../services/accommodationService.js';
import { EmailService } from '../services/emailService.js';

const router = Router();

// 1. Executive & Management Dashboard Overview
router.get('/dashboard-stats', (req: Request, res: Response) => {
  const totalBookings = db.bookings.length;
  const confirmedBookings = db.bookings.filter(b => b.status === 'confirmed').length;
  const checkedInVisitors = db.bookings.filter(b => b.status === 'checked_in').length;
  const checkedOutVisitors = db.bookings.filter(b => b.status === 'checked_out').length;
  const expectedArrivals = db.bookings.filter(b => b.status === 'confirmed').length;

  // Financial Stats
  const completedPayments = db.payments.filter(p => p.status === 'completed');
  const totalRevenueKES = completedPayments.reduce((sum, p) => sum + p.amountKES, 0);

  // Accommodation metrics
  const occupancy = AccommodationService.getOccupancyMetrics();

  // Visitor classification (First-time vs Returning)
  const totalRegistered = db.users.filter(u => u.role === 'registered_pilgrim');
  const returningCount = totalRegistered.filter(u => (u.totalVisits || 0) > 1).length;
  const firstTimeCount = totalRegistered.length - returningCount;

  return res.json({
    metrics: {
      checkedInVisitors,
      expectedArrivals,
      checkedOutVisitors,
      totalBookings,
      totalRevenueKES,
      occupancyPercentage: occupancy.occupancyPercentage,
      totalBeds: occupancy.totalCapacity,
      occupiedBeds: occupancy.occupiedCapacity,
      availableBeds: occupancy.availableCapacity,
      firstTimePilgrims: Math.max(firstTimeCount, 0),
      returningPilgrims: returningCount,
      prayerRequestsCount: db.prayerRequests.length,
      testimoniesCount: db.testimonies.length
    },
    occupancyBreakdown: occupancy.categoryBreakdown,
    recentBookings: db.bookings.slice(-10).reverse(),
    recentPayments: completedPayments.slice(-10).reverse(),
    recentGateEvents: db.gateEvents.slice(-10).reverse(),
    announcements: db.announcements || []
  });
});

// 2. All Bookings with Search & Filter
router.get('/bookings', (req: Request, res: Response) => {
  const { status, q } = req.query;
  let results = [...db.bookings];

  if (status && status !== 'all') {
    results = results.filter(b => b.status === status);
  }

  if (q && typeof q === 'string') {
    const term = q.toLowerCase().trim();
    results = results.filter(b => 
      b.visitorName.toLowerCase().includes(term) ||
      b.bookingReference.toLowerCase().includes(term) ||
      b.visitorPhone.includes(term) ||
      (b.assignedRoomNumber && b.assignedRoomNumber.toLowerCase().includes(term))
    );
  }

  return res.json({
    total: results.length,
    bookings: results.reverse()
  });
});

// 3. Update Booking Status (Check In, Check Out, Cancel, Reassign)
router.patch('/bookings/:id/status', (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, notes, officerName } = req.body;

  const booking = db.bookings.find(b => b.id === id || b.bookingReference === id);
  if (!booking) {
    return res.status(404).json({ error: 'Booking reservation not found.' });
  }

  const prevStatus = booking.status;
  booking.status = status;

  // Free or occupy beds based on status transition
  if (booking.assignedBedId) {
    const bed = db.beds.find(b => b.id === booking.assignedBedId);
    if (bed) {
      if (status === 'checked_in') {
        bed.status = 'occupied';
      } else if (status === 'checked_out' || status === 'cancelled') {
        bed.status = 'available';
        // Decrement room occupied count
        const room = db.rooms.find(r => r.id === bed.roomId);
        if (room && room.occupiedBeds > 0) {
          room.occupiedBeds -= 1;
        }
      }
    }
  }

  // Update associated ticket if any
  const ticket = db.tickets.find(t => t.bookingId === booking.id || t.bookingReference === booking.bookingReference);
  if (ticket) {
    if (status === 'checked_in') {
      ticket.status = 'checked_in';
      ticket.checkedInAt = new Date().toISOString();
      ticket.checkedInByOfficer = officerName || 'System Admin';
    } else if (status === 'checked_out') {
      ticket.status = 'checked_out';
    } else if (status === 'cancelled') {
      ticket.status = 'cancelled';
    }
  }

  // Log Gate Event if transitioning to checked_in or checked_out
  if (status === 'checked_in' || status === 'checked_out') {
    const event: GateEventRecord = {
      id: uuidv4(),
      ticketId: ticket?.id || booking.id,
      bookingReference: booking.bookingReference,
      visitorName: booking.visitorName,
      eventType: status === 'checked_in' ? 'check_in' : 'check_out',
      timestamp: new Date().toISOString(),
      officerName: officerName || 'System Admin',
      notes: notes || `Direct administration update: ${prevStatus} -> ${status}`,
      checks: {
        dressCode: true,
        orientation: true,
        identity: true,
        luggageNoFood: true
      }
    };
    db.gateEvents.push(event);
  }

  return res.json({
    message: `Booking ${booking.bookingReference} status updated to ${status}.`,
    booking
  });
});

// 4. Create Manual / Walk-in Booking
router.post('/bookings/walk-in', (req: Request, res: Response) => {
  try {
    const { visitorName, visitorPhone, categoryId, nights, roomPreference, gender } = req.body;

    if (!visitorName || !visitorPhone || !categoryId) {
      return res.status(400).json({ error: 'Pilgrim name, phone, and accommodation category are required.' });
    }

    const category = db.categories.find(c => c.id === categoryId);
    if (!category) {
      return res.status(404).json({ error: 'Accommodation category not found.' });
    }

    const nightsCount = parseInt(nights || '1', 10);
    const totalKES = category.pricePerNightKES * nightsCount;

    // Allocate bed
    const allocation = AccommodationService.allocateBed(categoryId, gender || 'any');
    if (!allocation) {
      return res.status(409).json({ error: 'No beds currently available in this category.' });
    }

    const checkIn = new Date().toISOString().split('T')[0];
    const checkOutDate = new Date();
    checkOutDate.setDate(checkOutDate.getDate() + nightsCount);
    const checkOut = checkOutDate.toISOString().split('T')[0];

    const refNumber = Math.floor(1000 + Math.random() * 9000);
    const bookingRef = `HG-2026-${refNumber}`;

    const newBooking: BookingRecord = {
      id: uuidv4(),
      bookingReference: bookingRef,
      visitorId: uuidv4(),
      visitorName,
      visitorPhone,
      categoryId,
      roomType: category.name,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      guestsCount: 1,
      totalAmountKES: totalKES,
      status: 'checked_in', // Immediate walk-in admission
      assignedRoomId: allocation.room.id,
      assignedRoomNumber: allocation.room.roomNumber,
      assignedBedId: allocation.bed.id,
      assignedBedNumber: allocation.bed.bedNumber,
      createdAt: new Date().toISOString()
    };

    allocation.bed.status = 'occupied';
    db.bookings.push(newBooking);

    // Record cash payment
    db.payments.push({
      id: uuidv4(),
      paymentReference: `PAY-WALK-${uuidv4().substring(0, 8)}`,
      bookingId: newBooking.id,
      bookingReference: bookingRef,
      checkoutRequestId: 'N/A-CASH-OFFICE',
      mpesaReceiptNumber: `CSH${refNumber}WALK`,
      phone: visitorPhone,
      amountKES: totalKES,
      status: 'completed',
      paymentMethod: 'CASH_OFFICE',
      transactionDate: new Date().toISOString()
    });

    // Generate Gate Ticket Pass
    const ticketRef = `TKT-2026-${Math.floor(100000 + Math.random() * 900000)}`;
    db.tickets.push({
      id: uuidv4(),
      ticketReference: ticketRef,
      bookingId: newBooking.id,
      bookingReference: bookingRef,
      visitorId: newBooking.visitorId,
      visitorName: newBooking.visitorName,
      phone: newBooking.visitorPhone,
      categoryName: category.name,
      checkInDate: checkIn,
      checkOutDate: checkOut,
      status: 'checked_in',
      qrData: JSON.stringify({ ticketRef, bookingRef, room: allocation.room.roomNumber, bed: allocation.bed.bedNumber }),
      signedHash: 'WALK-IN-VERIFIED-SEAL',
      checkedInAt: new Date().toISOString(),
      checkedInByOfficer: 'Reception Admin Desk',
      orientationBriefingCompleted: true,
      dressCodeVerified: true,
      luggageChecked: true
    });

    return res.status(201).json({
      message: `Walk-in pilgrim admitted: assigned Room ${allocation.room.roomNumber}, Bed ${allocation.bed.bedNumber}.`,
      booking: newBooking
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// 5. User & Staff Management
router.get('/users', (req: Request, res: Response) => {
  const safeUsers = db.users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    nationalId: u.nationalId,
    totalVisits: u.totalVisits || 0,
    createdAt: u.createdAt
  }));
  return res.json({ users: safeUsers });
});

router.patch('/users/:id/role', (req: Request, res: Response) => {
  const { id } = req.params;
  const { role } = req.body;

  const user = db.users.find(u => u.id === id || u.email === id);
  if (!user) {
    return res.status(404).json({ error: 'User not found.' });
  }

  user.role = role;
  return res.json({
    message: `Updated role for ${user.name} to ${role}.`,
    user: { id: user.id, name: user.name, role: user.role }
  });
});

// 6. Altar Prayer Requests Management
router.get('/prayer-requests', (req: Request, res: Response) => {
  return res.json({
    total: db.prayerRequests.length,
    requests: db.prayerRequests.slice().reverse()
  });
});

router.patch('/prayer-requests/:id/status', (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, assignedIntercessor, responseNote } = req.body;

  const pr = db.prayerRequests.find(p => p.id === id);
  if (!pr) {
    return res.status(404).json({ error: 'Prayer request record not found.' });
  }

  if (status) pr.status = status;
  if (assignedIntercessor) pr.assignedIntercessor = assignedIntercessor;
  if (responseNote) pr.responseNote = responseNote;

  return res.json({
    message: 'Prayer request status updated by intercession team.',
    prayerRequest: pr
  });
});

// 7. Mountain Broadcast Announcements
router.get('/announcements', (req: Request, res: Response) => {
  return res.json({ announcements: db.announcements || [] });
});

router.post('/announcements', (req: Request, res: Response) => {
  const { title, message, type, author } = req.body;
  if (!title || !message) {
    return res.status(400).json({ error: 'Announcement title and message are required.' });
  }

  const newAnn = {
    id: `ann-${Date.now()}`,
    title,
    message,
    type: type || 'info',
    active: true,
    createdAt: new Date().toISOString(),
    author: author || 'Pastor Peter Mwangi'
  };

  if (!db.announcements) db.announcements = [];
  db.announcements.unshift(newAnn);

  return res.status(201).json({
    message: 'Announcement broadcasted to campus network.',
    announcement: newAnn
  });
});

router.delete('/announcements/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  if (db.announcements) {
    db.announcements = db.announcements.filter(a => a.id !== id);
  }
  return res.json({ message: 'Announcement deleted.' });
});

// 8. Gate Events Log
router.get('/gate-events', (req: Request, res: Response) => {
  return res.json({
    total: db.gateEvents.length,
    events: db.gateEvents.slice().reverse()
  });
});

// =========================================================================
// 9. MEMBER MANAGEMENT & VISITOR PROFILES (Module C)
// =========================================================================

/**
 * GET /admin/members
 * Search and filter registered members/visitors with visit history analytics.
 */
router.get('/members', (req: Request, res: Response) => {
  const { q, role, classification, page, limit } = req.query;

  let members = db.users.map(u => {
    // Collect distinct chronological visits
    const userVisits = db.visits.filter(v => 
      v.memberId === u.id || 
      (u.phone && v.visitorPhone === u.phone) || 
      (u.email && v.visitorEmail && v.visitorEmail.toLowerCase() === u.email.toLowerCase())
    );

    const userBookings = db.bookings.filter(b => 
      b.visitorId === u.id || 
      (u.phone && b.visitorPhone === u.phone) || 
      (u.email && b.visitorEmail && b.visitorEmail.toLowerCase() === u.email.toLowerCase())
    );

    const totalVisits = Math.max(u.totalVisits || 0, userVisits.length, userBookings.length);
    const isReturning = totalVisits > 1;

    const sortedVisits = [...userVisits].sort((a, b) => new Date(b.checkInDate).getTime() - new Date(a.checkInDate).getTime());
    const lastVisitDate = sortedVisits[0]?.checkInDate || userBookings[userBookings.length - 1]?.checkInDate;

    return {
      id: u.id,
      name: u.name,
      email: u.email,
      phone: u.phone,
      nationalId: u.nationalId,
      role: u.role,
      totalVisits,
      classification: isReturning ? 'returning' : 'first_time',
      lastVisitDate,
      communicationPreferences: u.communicationPreferences || {
        welcomeEmail: true,
        departureEmail: true,
        smsAlerts: true
      },
      createdAt: u.createdAt
    };
  });

  if (role && role !== 'all' && typeof role === 'string') {
    members = members.filter(m => m.role === role);
  }

  if (classification && typeof classification === 'string') {
    members = members.filter(m => m.classification === classification);
  }

  if (q && typeof q === 'string') {
    const term = q.toLowerCase().trim();
    members = members.filter(m => 
      m.name.toLowerCase().includes(term) ||
      m.phone.includes(term) ||
      (m.email && m.email.toLowerCase().includes(term)) ||
      (m.nationalId && m.nationalId.toLowerCase().includes(term))
    );
  }

  const pageNum = parseInt(page as string || '1', 10);
  const limitNum = parseInt(limit as string || '50', 10);
  const startIndex = (pageNum - 1) * limitNum;
  const paginated = members.slice(startIndex, startIndex + limitNum);

  return res.json({
    total: members.length,
    page: pageNum,
    limit: limitNum,
    members: paginated,
    users: paginated
  });
});

/**
 * GET /admin/members/:id
 * Retrieve individual member profile and visit statistics.
 */
router.get('/members/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const user = db.users.find(u => u.id === id || u.phone === id || u.email.toLowerCase() === id.toLowerCase());

  if (!user) {
    return res.status(404).json({ error: 'Member profile not found.' });
  }

  const visits = db.visits.filter(v => 
    v.memberId === user.id || 
    (user.phone && v.visitorPhone === user.phone) || 
    (user.email && v.visitorEmail && v.visitorEmail.toLowerCase() === user.email.toLowerCase())
  ).sort((a, b) => new Date(b.checkInDate).getTime() - new Date(a.checkInDate).getTime());

  const totalVisits = Math.max(user.totalVisits || 0, visits.length);

  return res.json({
    member: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      nationalId: user.nationalId,
      role: user.role,
      totalVisits,
      classification: totalVisits > 1 ? 'returning' : 'first_time',
      communicationPreferences: user.communicationPreferences || {
        welcomeEmail: true,
        departureEmail: true,
        smsAlerts: true
      },
      createdAt: user.createdAt
    },
    visitsSummary: {
      totalVisits,
      firstVisitDate: visits[visits.length - 1]?.checkInDate,
      latestVisitDate: visits[0]?.checkInDate
    },
    visits
  });
});

/**
 * GET /admin/members/:id/visits
 * Chronological separate visit records for this member without overwriting past history.
 */
router.get('/members/:id/visits', (req: Request, res: Response) => {
  const { id } = req.params;
  const user = db.users.find(u => u.id === id || u.phone === id || u.email.toLowerCase() === id.toLowerCase());

  let userVisits = db.visits.filter(v => 
    v.memberId === id || 
    (user && (v.visitorPhone === user.phone || (user.email && v.visitorEmail && v.visitorEmail.toLowerCase() === user.email.toLowerCase())))
  );

  // If no visits recorded directly in db.visits, synthesize from db.bookings to preserve history
  if (userVisits.length === 0 && user) {
    const bookings = db.bookings.filter(b => 
      b.visitorId === user.id || 
      (user.phone && b.visitorPhone === user.phone) || 
      (user.email && b.visitorEmail && b.visitorEmail.toLowerCase() === user.email.toLowerCase())
    );
    userVisits = bookings.map(b => ({
      id: `v-synth-${b.id}`,
      memberId: user.id,
      visitorName: b.visitorName,
      visitorPhone: b.visitorPhone,
      visitorEmail: b.visitorEmail,
      bookingId: b.id,
      bookingReference: b.bookingReference,
      checkInDate: b.checkInDate,
      checkOutDate: b.checkOutDate,
      status: b.status === 'checked_in' ? 'checked_in' : b.status === 'checked_out' ? 'checked_out' : 'expected',
      roomNumber: b.assignedRoomNumber,
      bedNumber: b.assignedBedNumber,
      createdAt: b.createdAt,
      updatedAt: b.createdAt
    }));
  }

  const sortedVisits = [...userVisits].sort((a, b) => new Date(b.checkInDate).getTime() - new Date(a.checkInDate).getTime());

  return res.json({
    memberId: id,
    totalVisits: sortedVisits.length,
    visits: sortedVisits
  });
});

/**
 * PATCH /admin/members/:id
 * Update editable member profile fields and communication preferences.
 */
router.patch('/members/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const user = db.users.find(u => u.id === id || u.email === id);

  if (!user) {
    return res.status(404).json({ error: 'Member not found.' });
  }

  const { name, phone, email, nationalId, role, communicationPreferences } = req.body;

  if (name && typeof name === 'string') user.name = name.trim();
  if (phone && typeof phone === 'string') user.phone = phone.trim();
  if (email && typeof email === 'string') user.email = email.trim().toLowerCase();
  if (nationalId !== undefined) user.nationalId = nationalId;
  if (role) user.role = role;
  if (communicationPreferences) {
    user.communicationPreferences = {
      ...user.communicationPreferences,
      ...communicationPreferences
    };
  }
  user.updatedAt = new Date().toISOString();

  return res.json({
    message: 'Member details updated successfully.',
    member: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      nationalId: user.nationalId,
      role: user.role,
      totalVisits: user.totalVisits || 0,
      communicationPreferences: user.communicationPreferences,
      updatedAt: user.updatedAt
    }
  });
});

// =========================================================================
// 10. VISIT RECORDS HISTORY (Global)
// =========================================================================

router.get('/visits', (req: Request, res: Response) => {
  const { q, status } = req.query;
  let results = [...db.visits];

  if (status && typeof status === 'string' && status !== 'all') {
    results = results.filter(v => v.status === status);
  }

  if (q && typeof q === 'string') {
    const term = q.toLowerCase().trim();
    results = results.filter(v => 
      v.visitorName.toLowerCase().includes(term) ||
      v.bookingReference.toLowerCase().includes(term) ||
      v.visitorPhone.includes(term) ||
      (v.roomNumber && v.roomNumber.toLowerCase().includes(term))
    );
  }

  return res.json({
    total: results.length,
    visits: results.reverse()
  });
});

router.get('/visits/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const visit = db.visits.find(v => v.id === id || v.bookingReference === id);
  if (!visit) {
    return res.status(404).json({ error: 'Visit record not found.' });
  }
  return res.json({ visit });
});

// =========================================================================
// 11. VISITOR COMMUNICATIONS & AUTOMATED EMAIL LOGS (Module B)
// =========================================================================

/**
 * GET /admin/email-status
 * Inspect email delivery logs with delivery status, statistics, and filtering.
 */
router.get('/email-status', (req: Request, res: Response) => {
  const { bookingRef, recipient, type, status, page, limit } = req.query;
  let results = [...db.emailLogs];

  if (bookingRef && typeof bookingRef === 'string') {
    results = results.filter(l => l.bookingReference.toLowerCase().includes(bookingRef.toLowerCase().trim()));
  }

  if (recipient && typeof recipient === 'string') {
    const rec = recipient.toLowerCase().trim();
    results = results.filter(l => 
      l.recipientEmail.toLowerCase().includes(rec) || 
      l.recipientName.toLowerCase().includes(rec)
    );
  }

  if (type && typeof type === 'string' && type !== 'all') {
    results = results.filter(l => l.emailType === type);
  }

  if (status && typeof status === 'string' && status !== 'all') {
    results = results.filter(l => l.status === status);
  }

  const sentCount = results.filter(l => l.status === 'sent').length;
  const simulatedCount = results.filter(l => l.status === 'simulated').length;
  const failedCount = results.filter(l => l.status === 'failed').length;

  const pageNum = parseInt(page as string || '1', 10);
  const limitNum = parseInt(limit as string || '50', 10);
  const startIndex = (pageNum - 1) * limitNum;
  const paginated = results.slice(startIndex, startIndex + limitNum);

  return res.json({
    total: results.length,
    sentCount: sentCount + simulatedCount,
    failedCount,
    simulatedCount,
    page: pageNum,
    limit: limitNum,
    logs: paginated,
    statuses: paginated
  });
});

/**
 * POST /admin/email-status/:id/retry
 * Safely retry failed email delivery.
 */
router.post('/email-status/:id/retry', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const result = await EmailService.retryEmail(id);
    return res.json({
      success: result.success,
      message: result.success 
        ? 'Email retry sent successfully.' 
        : `Email retry failed: ${result.log.failureReason || 'unknown failure'}`,
      log: result.log
    });
  } catch (err: any) {
    return res.status(404).json({ error: err.message });
  }
});

// =========================================================================
// 12. TESTIMONIES MODERATION (Module A)
// =========================================================================

/**
 * GET /admin/testimonies
 * Retrieve all testimonies for pastoral review and moderation.
 */
router.get('/testimonies', (req: Request, res: Response) => {
  const { status, q, category } = req.query;
  let results = [...db.testimonies];

  if (status && typeof status === 'string' && status !== 'all') {
    results = results.filter(t => t.status === status);
  }

  if (category && typeof category === 'string' && category !== 'all') {
    results = results.filter(t => t.category === category);
  }

  if (q && typeof q === 'string') {
    const term = q.toLowerCase().trim();
    results = results.filter(t => 
      t.title.toLowerCase().includes(term) ||
      t.content.toLowerCase().includes(term) ||
      t.authorName.toLowerCase().includes(term)
    );
  }

  return res.json({
    total: results.length,
    testimonies: results.reverse()
  });
});

/**
 * PATCH /admin/testimonies/:id/status
 * Pastoral moderation: approve or reject a testimony.
 */
router.patch('/testimonies/:id/status', (req: Request, res: Response) => {
  const { id } = req.params;
  const { status, moderatorName } = req.body;

  const testimony = db.testimonies.find(t => t.id === id);
  if (!testimony) {
    return res.status(404).json({ error: 'Testimony not found.' });
  }

  if (!['approved', 'pending', 'rejected'].includes(status)) {
    return res.status(400).json({ error: "Invalid status. Must be 'approved', 'pending', or 'rejected'." });
  }

  testimony.status = status;
  testimony.updatedAt = new Date().toISOString();

  return res.json({
    message: `Testimony marked as ${status} by ${moderatorName || 'Moderator'}.`,
    testimony
  });
});

export default router;
