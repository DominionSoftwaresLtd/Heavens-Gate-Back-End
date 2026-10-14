import { Router, Request, Response } from 'express';
import { db } from '../database/store.js';
import { DarajaService } from '../services/darajaService.js';

const router = Router();

// Initiate STK Push
router.post('/stk-push', async (req: Request, res: Response) => {
  try {
    const { bookingId, phone } = req.body;
    if (!bookingId || !phone) {
      return res.status(400).json({ error: 'bookingId and phone are required.' });
    }

    const booking = db.bookings.find(b => b.id === bookingId);
    if (!booking) {
      return res.status(404).json({ error: 'Booking reservation not found.' });
    }

    const result = await DarajaService.initiateSTKPush({
      bookingId: booking.id,
      bookingReference: booking.bookingReference,
      phone,
      amountKES: booking.totalAmountKES
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Safaricom Daraja Webhook Callback Endpoint
router.post('/callback', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    // Standard Daraja STK callback format
    const stkCallback = body?.Body?.stkCallback || body;
    const checkoutRequestId = stkCallback?.CheckoutRequestID || body?.checkoutRequestId;
    const resultCode = stkCallback?.ResultCode !== undefined ? stkCallback.ResultCode : 0;
    const resultDesc = stkCallback?.ResultDesc || 'Success';

    let mpesaReceiptNumber = '';
    const callbackMetadata = stkCallback?.CallbackMetadata?.Item;
    if (Array.isArray(callbackMetadata)) {
      const receiptItem = callbackMetadata.find((i: any) => i.Name === 'MpesaReceiptNumber');
      if (receiptItem) mpesaReceiptNumber = receiptItem.Value;
    }

    const result = await DarajaService.processCallback({
      checkoutRequestId,
      resultCode,
      resultDesc,
      mpesaReceiptNumber: mpesaReceiptNumber || `QKH${Math.floor(1000000 + Math.random() * 9000000)}`
    });

    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Instant payment simulation for developer testing without phone dependency
router.post('/simulate-instant', async (req: Request, res: Response) => {
  try {
    const { bookingId } = req.body;
    if (!bookingId) {
      return res.status(400).json({ error: 'bookingId is required.' });
    }

    const result = await DarajaService.simulateInstantApproval(bookingId);
    return res.json(result);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Finance records list
router.get('/all', (req: Request, res: Response) => {
  const totalRevenue = db.payments
    .filter(p => p.status === 'completed')
    .reduce((sum, p) => sum + p.amountKES, 0);

  return res.json({
    totalRevenueKES: totalRevenue,
    count: db.payments.length,
    payments: db.payments
  });
});

export default router;
