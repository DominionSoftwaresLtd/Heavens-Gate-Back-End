import { db, AccommodationCategory, RoomRecord, BedRecord } from '../database/store.js';

export class AccommodationService {
  // Real-time capacity and occupancy metrics
  static getOccupancyMetrics() {
    const totalBeds = db.beds.length;
    const occupiedBeds = db.beds.filter(b => b.status === 'occupied').length;
    const reservedBeds = db.beds.filter(b => b.status === 'reserved').length;
    const maintenanceBeds = db.beds.filter(b => b.status === 'maintenance').length;
    const availableBeds = db.beds.filter(b => b.status === 'available').length;

    const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

    // Breakdown by category
    const categoryBreakdown = db.categories.map(cat => {
      const categoryRooms = db.rooms.filter(r => r.categoryId === cat.id);
      const roomIds = categoryRooms.map(r => r.id);
      const catBeds = db.beds.filter(b => roomIds.includes(b.roomId));
      const catOccupied = catBeds.filter(b => b.status === 'occupied').length;
      const catAvailable = catBeds.filter(b => b.status === 'available').length;

      return {
        categoryId: cat.id,
        categoryName: cat.name,
        code: cat.code,
        priceKES: cat.pricePerNightKES,
        totalBeds: catBeds.length,
        occupiedBeds: catOccupied,
        availableBeds: catAvailable,
        occupancyPercent: catBeds.length > 0 ? Math.round((catOccupied / catBeds.length) * 100) : 0
      };
    });

    return {
      totalCapacity: totalBeds,
      occupiedCapacity: occupiedBeds,
      reservedCapacity: reservedBeds,
      maintenanceCapacity: maintenanceBeds,
      availableCapacity: availableBeds,
      occupancyPercentage: occupancyRate,
      categoryBreakdown
    };
  }

  // Calculate pricing itemization for a reservation
  static calculatePricing(categoryId: string, checkInDate: string, checkOutDate: string, guestsCount: number) {
    const category = db.categories.find(c => c.id === categoryId);
    if (!category) {
      throw new Error(`Accommodation category with ID '${categoryId}' not found.`);
    }

    const start = new Date(checkInDate);
    const end = new Date(checkOutDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    const nights = Math.max(1, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));

    let unitPrice = category.pricePerNightKES;
    let totalKES = 0;

    if (category.billingUnit === 'per_person') {
      totalKES = unitPrice * guestsCount * nights;
    } else {
      totalKES = unitPrice * nights;
    }

    return {
      categoryName: category.name,
      code: category.code,
      billingUnit: category.billingUnit,
      pricePerUnitNightKES: unitPrice,
      nights,
      guestsCount,
      totalAmountKES: totalKES
    };
  }

  // Find and atomically allocate a room and bed respecting gender constraints (BR-01, BR-07)
  static allocateBed(categoryId: string, gender: 'male' | 'female' | 'any') {
    // Find rooms matching category and gender rule
    const matchingRooms = db.rooms.filter(room => {
      if (room.isMaintenance) return false;
      if (room.categoryId !== categoryId) return false;
      if (room.occupiedBeds >= room.totalBeds) return false;
      
      // Gender checking:
      if (room.gender === 'any') return true;
      if (gender !== 'any' && room.gender !== gender) return false;
      return true;
    });

    for (const room of matchingRooms) {
      const availableBed = db.beds.find(bed => bed.roomId === room.id && bed.status === 'available');
      if (availableBed) {
        // Reserve bed
        availableBed.status = 'reserved';
        room.occupiedBeds += 1;
        return {
          room,
          bed: availableBed
        };
      }
    }

    return null; // Sold out
  }
}
