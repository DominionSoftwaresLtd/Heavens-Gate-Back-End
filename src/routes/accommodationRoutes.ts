import { Router, Request, Response } from 'express';
import { db } from '../database/store.js';
import { AccommodationService } from '../services/accommodationService.js';

const router = Router();

// List all categories
router.get('/categories', (req: Request, res: Response) => {
  return res.json({ categories: db.categories });
});

// List all physical blocks
router.get('/blocks', (req: Request, res: Response) => {
  return res.json({ blocks: db.blocks });
});

// Real-time occupancy metrics (Module C4, Module W)
router.get('/occupancy', (req: Request, res: Response) => {
  const metrics = AccommodationService.getOccupancyMetrics();
  return res.json(metrics);
});

// Price estimate calculation endpoint (BR-02)
router.post('/calculate-price', (req: Request, res: Response) => {
  try {
    const { categoryId, checkInDate, checkOutDate, guestsCount } = req.body;
    if (!categoryId || !checkInDate || !checkOutDate) {
      return res.status(400).json({ error: 'categoryId, checkInDate, and checkOutDate are required.' });
    }

    const priceBreakdown = AccommodationService.calculatePricing(
      categoryId,
      checkInDate,
      checkOutDate,
      parseInt(guestsCount || '1', 10)
    );

    return res.json(priceBreakdown);
  } catch (err: any) {
    return res.status(400).json({ error: err.message });
  }
});

export default router;
