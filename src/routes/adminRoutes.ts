import { Router, Request, Response } from 'express';
import { db } from '../database/store.js';
import { AccommodationService } from '../services/accommodationService.js';

const router = Router();

// Executive & Management Dashboard Overview (Module W1)
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
    recentBookings: db.bookings.slice(-5).reverse(),
    recentPayments: completedPayments.slice(-5).reverse(),
    recentGateEvents: db.gateEvents.slice(-5).reverse()
  });
});

export default router;
