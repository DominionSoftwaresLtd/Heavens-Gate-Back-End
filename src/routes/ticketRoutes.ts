import { Router, Request, Response } from 'express';
import QRCode from 'qrcode';
import { db } from '../database/store.js';
import { TicketService } from '../services/ticketService.js';

const router = Router();

// Retrieve ticket by reference or booking reference
router.get('/:reference', async (req: Request, res: Response) => {
  try {
    const { reference } = req.params;
    const ticket = db.tickets.find(
      t => t.ticketReference === reference || t.bookingReference === reference || t.id === reference
    );

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket not found.' });
    }

    const booking = db.bookings.find(b => b.id === ticket.bookingId);
    const payment = db.payments.find(p => p.bookingId === ticket.bookingId && p.status === 'completed');

    // Generate QR code Data URL
    const qrDataUrl = await QRCode.toDataURL(ticket.qrData, {
      errorCorrectionLevel: 'H',
      margin: 2,
      width: 280,
      color: {
        dark: '#0F172A',
        light: '#FFFFFF'
      }
    });

    return res.json({
      ticket,
      booking,
      payment,
      qrDataUrl
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Gate scan verification endpoint
router.post('/verify-scan', (req: Request, res: Response) => {
  try {
    const { qrContent, ticketReference } = req.body;
    let ref = ticketReference;

    if (!ref && qrContent) {
      try {
        const parsed = JSON.parse(qrContent);
        ref = parsed.tktRef || parsed.ref;
      } catch (e) {
        ref = qrContent;
      }
    }

    if (!ref) {
      return res.status(400).json({ error: 'Missing ticket reference or QR content.' });
    }

    const result = TicketService.validateTicket(ref);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

export default router;
