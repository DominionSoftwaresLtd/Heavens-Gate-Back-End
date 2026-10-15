import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, BookingRecord, GateEventRecord } from '../database/store.js';
import { AccommodationService } from '../services/accommodationService.js';

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

export default router;
