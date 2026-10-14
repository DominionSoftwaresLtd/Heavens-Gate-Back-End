import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, BookingRecord } from '../database/store.js';
import { AccommodationService } from '../services/accommodationService.js';

const router = Router();

// Create reservation
router.post('/create', async (req: Request, res: Response) => {
  try {
    const {
      visitorId,
      visitorName,
      visitorPhone,
      visitorEmail,
      categoryId,
      checkInDate,
      checkOutDate,
      guestsCount,
      gender
    } = req.body;

    if (!visitorName || !visitorPhone || !categoryId || !checkInDate || !checkOutDate) {
      return res.status(400).json({ error: 'Missing required reservation fields.' });
    }

    // 1. Calculate pricing snapshot
    const pricing = AccommodationService.calculatePricing(
      categoryId,
      checkInDate,
      checkOutDate,
      parseInt(guestsCount || '1', 10)
    );

    // 2. Check bed availability and reserve allocation
    const allocation = AccommodationService.allocateBed(categoryId, gender || 'any');
    if (!allocation) {
      return res.status(409).json({
        error: 'SOLD_OUT',
        message: 'No available beds matching your selected accommodation category and dates. Please select an alternative wing.'
      });
    }

    const bookingRef = `HG-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const bookingId = uuidv4();
    const holdExpiresAt = Date.now() + 15 * 60 * 1000; // 15-minute hold

    const newBooking: BookingRecord = {
      id: bookingId,
      bookingReference: bookingRef,
      visitorId: visitorId || 'guest-' + uuidv4().substring(0, 8),
      visitorName,
      visitorPhone,
      visitorEmail: visitorEmail || '',
      categoryId,
      roomType: pricing.categoryName,
      checkInDate,
      checkOutDate,
      guestsCount: parseInt(guestsCount || '1', 10),
      totalAmountKES: pricing.totalAmountKES,
      status: 'pending_payment',
      holdExpiresAt,
      assignedRoomId: allocation.room.id,
      assignedRoomNumber: allocation.room.roomNumber,
      assignedBedNumber: allocation.bed.bedNumber,
      createdAt: new Date().toISOString()
    };

    db.bookings.push(newBooking);

    return res.status(201).json({
      message: 'Reservation hold created successfully.',
      booking: newBooking,
      pricing
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Get all bookings (Management)
router.get('/all', (req: Request, res: Response) => {
  return res.json({ bookings: db.bookings });
});

// Get bookings for a specific phone number or visitor
router.get('/my-bookings', (req: Request, res: Response) => {
  const { phone, visitorId } = req.query;
  const filtered = db.bookings.filter(b => 
    (phone && b.visitorPhone === phone) || 
    (visitorId && b.visitorId === visitorId)
  );
  return res.json({ bookings: filtered });
});

// Get single booking by reference or ID
router.get('/:identifier', (req: Request, res: Response) => {
  const { identifier } = req.params;
  const booking = db.bookings.find(b => b.id === identifier || b.bookingReference === identifier);
  if (!booking) {
    return res.status(404).json({ error: 'Booking reservation not found.' });
  }

  const payment = db.payments.find(p => p.bookingId === booking.id && p.status === 'completed');
  const ticket = db.tickets.find(t => t.bookingId === booking.id);

  return res.json({
    booking,
    payment,
    ticket
  });
});

export default router;
