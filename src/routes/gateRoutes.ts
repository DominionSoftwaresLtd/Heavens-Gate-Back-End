import { Router, Request, Response } from 'express';
import { db } from '../database/store.js';
import { GateService } from '../services/gateService.js';

const router = Router();

// Gate status (5 AM - 8 PM rules)
router.get('/status', (req: Request, res: Response) => {
  const status = GateService.isGateOpen();
  return res.json(status);
});

// Process gate admission check-in
router.post('/check-in', (req: Request, res: Response) => {
  try {
    const { ticketReference, officerName, checks, notes } = req.body;
    if (!ticketReference) {
      return res.status(400).json({ error: 'ticketReference is required.' });
    }

    const result = GateService.checkInPilgrim({
      ticketReference,
      officerName: officerName || 'Gate Officer on Duty',
      checks: checks || {
        dressCode: true,
        orientation: true,
        identity: true,
        luggageNoFood: true
      },
      notes
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Process pilgrim departure check-out
router.post('/check-out', (req: Request, res: Response) => {
  try {
    const { ticketReference, officerName, notes } = req.body;
    if (!ticketReference) {
      return res.status(400).json({ error: 'ticketReference is required.' });
    }

    const result = GateService.checkOutPilgrim({
      ticketReference,
      officerName: officerName || 'Gate Officer on Duty',
      notes
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

// Audit log of gate events
router.get('/events', (req: Request, res: Response) => {
  return res.json({ events: db.gateEvents });
});

// Expected arrivals for gate officers
router.get('/expected-arrivals', (req: Request, res: Response) => {
  const confirmedNotArrived = db.bookings.filter(b => b.status === 'confirmed');
  return res.json({
    count: confirmedNotArrived.length,
    arrivals: confirmedNotArrived
  });
});

export default router;
