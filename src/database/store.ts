import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';

// Types and In-Memory Data Store with accurate Gilgil Heavens Gate Prayer Mountain details

export interface UserRecord {
  id: string;
  name: string;
  phone: string;
  email: string;
  passwordHash: string;
  role: 'public_visitor' | 'registered_pilgrim' | 'gate_officer' | 'reception_officer' | 
        'accommodation_officer' | 'finance_officer' | 'prayer_admin' | 'prayer_team' | 
        'testimony_moderator' | 'comms_officer' | 'system_admin' | 'senior_management';
  nationalId?: string;
  isFirstTime?: boolean;
  totalVisits?: number;
  createdAt: string;
}

export interface AccommodationCategory {
  id: string;
  code: string;
  name: string;
  description: string;
  pricePerNightKES: number;
  billingUnit: 'per_room' | 'per_person';
  capacityPerUnit: number;
  genderRestriction: 'male' | 'female' | 'mixed' | 'none';
  amenities: string[];
}

export interface AccommodationBlock {
  id: string;
  name: string;
  zone: string;
  description: string;
  genderAssigned: 'male' | 'female' | 'mixed';
}

export interface RoomRecord {
  id: string;
  blockId: string;
  roomNumber: string;
  categoryId: string;
  gender: 'male' | 'female' | 'any';
  totalBeds: number;
  occupiedBeds: number;
  isMaintenance: boolean;
}

export interface BedRecord {
  id: string;
  roomId: string;
  bedNumber: string;
  status: 'available' | 'occupied' | 'reserved' | 'maintenance';
  currentBookingId?: string;
}

export interface BookingRecord {
  id: string;
  bookingReference: string; // e.g. HG-2026-XXXX
  visitorId: string;
  visitorName: string;
  visitorPhone: string;
  visitorEmail?: string;
  categoryId: string;
  roomType: string;
  checkInDate: string; // YYYY-MM-DD
  checkOutDate: string; // YYYY-MM-DD
  guestsCount: number;
  totalAmountKES: number;
  status: 'pending_payment' | 'confirmed' | 'checked_in' | 'checked_out' | 'cancelled' | 'expired';
  holdExpiresAt?: number; // timestamp
  assignedRoomId?: string;
  assignedRoomNumber?: string;
  assignedBedNumber?: string;
  ticketId?: string;
  createdAt: string;
}

export interface PaymentRecord {
  id: string;
  paymentReference: string;
  bookingId: string;
  bookingReference: string;
  checkoutRequestId: string;
  mpesaReceiptNumber: string;
  phone: string;
  amountKES: number;
  status: 'initiated' | 'completed' | 'failed' | 'reversed';
  paymentMethod: 'MPESA_STK' | 'CASH_OFFICE';
  transactionDate: string;
}

export interface TicketRecord {
  id: string;
  ticketReference: string; // e.g. TKT-XXXX-XXXX
  bookingId: string;
  bookingReference: string;
  visitorId: string;
  visitorName: string;
  phone: string;
  categoryName: string;
  checkInDate: string;
  checkOutDate: string;
  status: 'valid' | 'checked_in' | 'checked_out' | 'cancelled';
  qrData: string;
  signedHash: string;
  checkedInAt?: string;
  checkedInByOfficer?: string;
  orientationBriefingCompleted: boolean;
  dressCodeVerified: boolean;
  luggageChecked: boolean;
}

export interface GateEventRecord {
  id: string;
  ticketId: string;
  bookingReference: string;
  visitorName: string;
  eventType: 'check_in' | 'check_out' | 'denied';
  timestamp: string;
  officerName: string;
  notes?: string;
  checks: {
    dressCode: boolean;
    orientation: boolean;
    identity: boolean;
    luggageNoFood: boolean;
  };
}

export interface MapFeature {
  id: string;
  name: string;
  category: 'gate' | 'sanctuary' | 'prayer_garden' | 'prayer_booth' | 'accommodation' | 'medical' | 'dining' | 'assembly';
  description: string;
  coordinates: { x: number; y: number }; // Percentage coordinate on campus SVG (0-100)
  icon: string;
  rules?: string;
}

export interface LiveService {
  id: string;
  title: string;
  preacher: string;
  startTime: string;
  endTime: string;
  status: 'upcoming' | 'live' | 'ended';
  streamUrl: string;
  viewersCount: number;
}

export interface PrayerWatch {
  id: string;
  shiftTitle: string; // e.g. "Third Watch (Midnight Intercession)"
  timeRange: string; // "00:00 - 03:00"
  focusArea: string;
  leader: string;
  maxParticipants: number;
  registeredCount: number;
}

export interface TestimonyRecord {
  id: string;
  authorName: string;
  countyOrCity: string;
  title: string;
  content: string;
  category: 'healing' | 'deliverance' | 'financial_breakthrough' | 'family_restoration' | 'spiritual_growth';
  status: 'approved' | 'pending' | 'rejected';
  likesCount: number;
  replies: Array<{
    id: string;
    authorName: string;
    comment: string;
    timestamp: string;
  }>;
  createdAt: string;
}

export interface PrayerRequestRecord {
  id: string;
  visitorId?: string;
  visitorName: string;
  phone: string;
  email?: string;
  requestText: string;
  category: string;
  isConfidential: boolean;
  status: 'received' | 'assigned' | 'in_prayer' | 'answered';
  assignedIntercessor?: string;
  responseNote?: string;
  createdAt: string;
}

export interface TransportRoute {
  id: string;
  originCity: string;
  routeTitle: string;
  stageDirections: string;
  matatuFareKES: string;
  bodaBodaFareKES: string;
  travelTime: string;
  advice: string;
}

// Master InMemory Store
class DatabaseStore {
  users: UserRecord[] = [];
  categories: AccommodationCategory[] = [];
  blocks: AccommodationBlock[] = [];
  rooms: RoomRecord[] = [];
  beds: BedRecord[] = [];
  bookings: BookingRecord[] = [];
  payments: PaymentRecord[] = [];
  tickets: TicketRecord[] = [];
  gateEvents: GateEventRecord[] = [];
  mapFeatures: MapFeature[] = [];
  liveServices: LiveService[] = [];
  prayerWatches: PrayerWatch[] = [];
  testimonies: TestimonyRecord[] = [];
  prayerRequests: PrayerRequestRecord[] = [];
  transportRoutes: TransportRoute[] = [];

  constructor() {
    this.seedInitialData();
  }

  seedInitialData() {
    const salt = bcrypt.genSaltSync(10);
    const defaultPasswordHash = bcrypt.hashSync('HeavensGate@2026', salt);

    // 1. Initial Users (All Roles)
    this.users = [
      {
        id: 'usr-admin-1',
        name: 'Pastor Peter Mwangi',
        phone: '0711000001',
        email: 'admin@heavensgate.or.ke',
        passwordHash: defaultPasswordHash,
        role: 'system_admin',
        createdAt: new Date().toISOString()
      },
      {
        id: 'usr-gate-1',
        name: 'Officer David Kiprono',
        phone: '0711000002',
        email: 'gate@heavensgate.or.ke',
        passwordHash: defaultPasswordHash,
        role: 'gate_officer',
        createdAt: new Date().toISOString()
      },
      {
        id: 'usr-reception-1',
        name: 'Sister Mary Wanjiku',
        phone: '0711000003',
        email: 'reception@heavensgate.or.ke',
        passwordHash: defaultPasswordHash,
        role: 'reception_officer',
        createdAt: new Date().toISOString()
      },
      {
        id: 'usr-accom-1',
        name: 'Brother Samuel Otieno',
        phone: '0711000004',
        email: 'accommodation@heavensgate.or.ke',
        passwordHash: defaultPasswordHash,
        role: 'accommodation_officer',
        createdAt: new Date().toISOString()
      },
      {
        id: 'usr-finance-1',
        name: 'Elder James Kariuki',
        phone: '0711000005',
        email: 'finance@heavensgate.or.ke',
        passwordHash: defaultPasswordHash,
        role: 'finance_officer',
        createdAt: new Date().toISOString()
      },
      {
        id: 'usr-prayer-1',
        name: 'Evangelist Grace Muthoni',
        phone: '0711000006',
        email: 'prayer@heavensgate.or.ke',
        passwordHash: defaultPasswordHash,
        role: 'prayer_admin',
        createdAt: new Date().toISOString()
      },
      {
        id: 'usr-pilgrim-1',
        name: 'John Kamau Karanja',
        phone: '0722123456',
        email: 'kamau@example.com',
        passwordHash: defaultPasswordHash,
        role: 'registered_pilgrim',
        nationalId: '29876543',
        isFirstTime: false,
        totalVisits: 3,
        createdAt: new Date().toISOString()
      }
    ];

    // 2. Accommodation Categories
    this.categories = [
      {
        id: 'cat-single',
        code: 'SINGLE_ROOM',
        name: 'Single Private Room',
        description: 'Quiet individual prayer & fasting room with study table, private wardrobe, and self-contained washroom.',
        pricePerNightKES: 600,
        billingUnit: 'per_room',
        capacityPerUnit: 1,
        genderRestriction: 'none',
        amenities: ['Private Washroom', 'Writing Desk & Chair', 'Warm Blanket & Sheets', 'Quiet Solitude']
      },
      {
        id: 'cat-double',
        code: 'DOUBLE_SHARING',
        name: 'Double Sharing Room',
        description: 'Two single beds for two pilgrims of the same gender or married couples with valid documentation.',
        pricePerNightKES: 450,
        billingUnit: 'per_person',
        capacityPerUnit: 2,
        genderRestriction: 'none',
        amenities: ['Two Single Beds', 'Ensuite Bathroom', 'Power Sockets', 'Beddings Included']
      },
      {
        id: 'cat-dorm-4',
        code: 'DORM_4_BED',
        name: '4-Person Dormitory Wing',
        description: 'Spacious shared wing with 4 sturdy single beds. Strictly gender separated with hot shower facilities.',
        pricePerNightKES: 280,
        billingUnit: 'per_person',
        capacityPerUnit: 4,
        genderRestriction: 'none',
        amenities: ['Personal Bed & Locker', 'Hot Water Bathrooms', 'Mosquito Netting', 'Spiritual Atmosphere']
      },
      {
        id: 'cat-hall-6',
        code: 'GENERAL_HALL_6',
        name: '6-Person General Hall',
        description: 'Cost-effective community prayer hall. Clean, warm, and secure with communal amenities.',
        pricePerNightKES: 180,
        billingUnit: 'per_person',
        capacityPerUnit: 6,
        genderRestriction: 'none',
        amenities: ['Bunk Bed with Mattress', 'Shared Clean Ablutions', 'Lockable Luggage Area', 'Drinking Water Point']
      }
    ];

    // 3. Accommodation Blocks
    this.blocks = [
      {
        id: 'blk-zion',
        name: 'Mount Zion Executive Wing',
        zone: 'Upper Plateau - North Ridge',
        description: 'Executive single & double prayer quarters for intensive quiet fasting.',
        genderAssigned: 'mixed'
      },
      {
        id: 'blk-bethany-m',
        name: 'Bethany Hall (Brothers Wing)',
        zone: 'Central Valley - Sector B',
        description: 'Dedicated 4-person dormitory block for male pilgrims.',
        genderAssigned: 'male'
      },
      {
        id: 'blk-bethany-f',
        name: 'Bethany Hall (Sisters Wing)',
        zone: 'Central Valley - Sector C',
        description: 'Dedicated 4-person dormitory block for female pilgrims.',
        genderAssigned: 'female'
      },
      {
        id: 'blk-bethesda',
        name: 'Bethesda General Pavilion',
        zone: 'Eastern Terraces',
        description: 'Spacious 6-bed shared hall accommodations.',
        genderAssigned: 'mixed'
      }
    ];

    // 4. Seed Rooms & Beds
    this.rooms = [];
    this.beds = [];

    // Zion Single Rooms (Z-101 to Z-110)
    for (let i = 1; i <= 10; i++) {
      const roomId = `rm-zion-${100 + i}`;
      this.rooms.push({
        id: roomId,
        blockId: 'blk-zion',
        roomNumber: `Z-${100 + i}`,
        categoryId: 'cat-single',
        gender: 'any',
        totalBeds: 1,
        occupiedBeds: i === 1 ? 1 : 0,
        isMaintenance: false
      });
      this.beds.push({
        id: `bed-zion-${100 + i}-1`,
        roomId,
        bedNumber: 'Bed 1',
        status: i === 1 ? 'occupied' : 'available'
      });
    }

    // Bethany Brothers 4-Bed Dorms (BB-201 to BB-205)
    for (let i = 1; i <= 5; i++) {
      const roomId = `rm-bethm-${200 + i}`;
      this.rooms.push({
        id: roomId,
        blockId: 'blk-bethany-m',
        roomNumber: `BB-${200 + i}`,
        categoryId: 'cat-dorm-4',
        gender: 'male',
        totalBeds: 4,
        occupiedBeds: i === 1 ? 2 : 0,
        isMaintenance: false
      });
      for (let b = 1; b <= 4; b++) {
        this.beds.push({
          id: `bed-bethm-${200 + i}-${b}`,
          roomId,
          bedNumber: `Bed ${b}`,
          status: i === 1 && b <= 2 ? 'occupied' : 'available'
        });
      }
    }

    // Bethany Sisters 4-Bed Dorms (BS-301 to BS-305)
    for (let i = 1; i <= 5; i++) {
      const roomId = `rm-bethf-${300 + i}`;
      this.rooms.push({
        id: roomId,
        blockId: 'blk-bethany-f',
        roomNumber: `BS-${300 + i}`,
        categoryId: 'cat-dorm-4',
        gender: 'female',
        totalBeds: 4,
        occupiedBeds: i === 1 ? 1 : 0,
        isMaintenance: false
      });
      for (let b = 1; b <= 4; b++) {
        this.beds.push({
          id: `bed-bethf-${300 + i}-${b}`,
          roomId,
          bedNumber: `Bed ${b}`,
          status: i === 1 && b === 1 ? 'occupied' : 'available'
        });
      }
    }

    // Bethesda General Halls 6-Person (BH-401 to BH-404)
    for (let i = 1; i <= 4; i++) {
      const roomId = `rm-bethesda-${400 + i}`;
      this.rooms.push({
        id: roomId,
        blockId: 'blk-bethesda',
        roomNumber: `BH-${400 + i}`,
        categoryId: 'cat-hall-6',
        gender: i % 2 === 0 ? 'female' : 'male',
        totalBeds: 6,
        occupiedBeds: i === 1 ? 3 : 0,
        isMaintenance: false
      });
      for (let b = 1; b <= 6; b++) {
        this.beds.push({
          id: `bed-bethesda-${400 + i}-${b}`,
          roomId,
          bedNumber: `Bed ${b}`,
          status: i === 1 && b <= 3 ? 'occupied' : 'available'
        });
      }
    }

    // 5. Pre-seeded Sample Booking, Payment & Ticket
    const sampleBookingId = 'bk-sample-001';
    const sampleTicketId = 'tkt-sample-001';
    const sampleBookingRef = 'HG-2026-8941';
    const sampleTicketRef = 'TKT-2026-9821';

    this.bookings.push({
      id: sampleBookingId,
      bookingReference: sampleBookingRef,
      visitorId: 'usr-pilgrim-1',
      visitorName: 'John Kamau Karanja',
      visitorPhone: '0722123456',
      visitorEmail: 'kamau@example.com',
      categoryId: 'cat-single',
      roomType: 'Single Private Room',
      checkInDate: '2026-10-15',
      checkOutDate: '2026-10-18',
      guestsCount: 1,
      totalAmountKES: 1800,
      status: 'confirmed',
      assignedRoomId: 'rm-zion-101',
      assignedRoomNumber: 'Z-101',
      assignedBedNumber: 'Bed 1',
      ticketId: sampleTicketId,
      createdAt: new Date().toISOString()
    });

    this.payments.push({
      id: 'pay-sample-001',
      paymentReference: 'PAY-DAR-987123',
      bookingId: sampleBookingId,
      bookingReference: sampleBookingRef,
      checkoutRequestId: 'ws_CO_14102026_982138',
      mpesaReceiptNumber: 'QKH9821764',
      phone: '254722123456',
      amountKES: 1800,
      status: 'completed',
      paymentMethod: 'MPESA_STK',
      transactionDate: new Date().toISOString()
    });

    this.tickets.push({
      id: sampleTicketId,
      ticketReference: sampleTicketRef,
      bookingId: sampleBookingId,
      bookingReference: sampleBookingRef,
      visitorId: 'usr-pilgrim-1',
      visitorName: 'John Kamau Karanja',
      phone: '0722123456',
      categoryName: 'Single Private Room',
      checkInDate: '2026-10-15',
      checkOutDate: '2026-10-18',
      status: 'valid',
      qrData: JSON.stringify({
        ref: sampleTicketRef,
        booking: sampleBookingRef,
        visitor: 'John Kamau Karanja',
        idNum: '29876543',
        exp: '2026-10-18',
        secSig: 'HG-SHA256-VALID-TOKEN'
      }),
      signedHash: 'HG-SHA256-VALID-TOKEN',
      orientationBriefingCompleted: true,
      dressCodeVerified: true,
      luggageChecked: true
    });

    // 6. Interactive Campus Map Features (Accurate Layout for Heavens Gate Gilgil)
    this.mapFeatures = [
      {
        id: 'mf-gate',
        name: 'Main Security Gate & Reception Desk',
        category: 'gate',
        description: 'Primary compound entrance, ticket scanning station, luggage screening (strict no-food verification), and orientation briefing.',
        coordinates: { x: 15, y: 75 },
        icon: 'ShieldCheck',
        rules: 'Gate hours strictly 5:00 AM - 8:00 PM. Have National ID / Ticket ready.'
      },
      {
        id: 'mf-reception',
        name: 'Nehemiah Administrative & Registration Office',
        category: 'gate',
        description: 'Visitor identity registration, room allocation keys, inquiries, lost & found, and emergency coordination.',
        coordinates: { x: 25, y: 70 },
        icon: 'Building'
      },
      {
        id: 'mf-shiloh',
        name: 'Shiloh Main Sanctuary & Worship Arena',
        category: 'sanctuary',
        description: 'Flagship multi-thousand capacity auditorium for congregational worship, intercession, and daily services led by Apostle John Kimani William.',
        coordinates: { x: 50, y: 50 },
        icon: 'Church',
        rules: 'Footwear off at designated carpet thresholds. Total silence during personal prayer times.'
      },
      {
        id: 'mf-gethsemane',
        name: 'Gethsemane Prayer Gardens & Hillsides',
        category: 'prayer_garden',
        description: 'Quiet terraced hillside landscaped with acacia, weeping willows, and stone benches for quiet meditation and deep crying out to God.',
        coordinates: { x: 75, y: 35 },
        icon: 'Trees',
        rules: 'Keep to paved stone footpaths. Maintain solemn silence.'
      },
      {
        id: 'mf-carmel',
        name: 'Mount Carmel Prayer Booths',
        category: 'prayer_booth',
        description: 'Individual sheltered prayer cubicles and prayer caves engineered for intense solitary fasting and communion.',
        coordinates: { x: 85, y: 20 },
        icon: 'Tent',
        rules: 'Single occupancy only. No mobile phone audio allowed.'
      },
      {
        id: 'mf-zion-block',
        name: 'Mount Zion Executive Accommodation',
        category: 'accommodation',
        description: 'Single & double prayer rooms with self-contained bathrooms for deep fasting retreats.',
        coordinates: { x: 30, y: 30 },
        icon: 'Home'
      },
      {
        id: 'mf-bethany-block',
        name: 'Bethany Dormitory Wings (Brothers & Sisters)',
        category: 'accommodation',
        description: 'Clean, warm 4-bed dormitories with hot water showers and personal storage lockers.',
        coordinates: { x: 45, y: 25 },
        icon: 'Users'
      },
      {
        id: 'mf-bethesda-block',
        name: 'Bethesda General Prayer Hall',
        category: 'accommodation',
        description: 'Affordable 6-bed shared dormitory hall near the eastern water station.',
        coordinates: { x: 65, y: 28 },
        icon: 'Bed'
      },
      {
        id: 'mf-tea-station',
        name: 'Living Water & Hot Tea Dispensary',
        category: 'dining',
        description: 'Free clean filtered drinking water, 24/7 boiling water boilers, and scheduled nourishing tea for fasting pilgrims.',
        coordinates: { x: 40, y: 65 },
        icon: 'Coffee',
        rules: 'Carry personal thermos/flask and cup. Tea served 06:30, 13:00, and 18:30.'
      },
      {
        id: 'mf-medical',
        name: 'Bethesda Health & First Aid Clinic',
        category: 'medical',
        description: 'On-site medical personnel, blood pressure and glucose monitoring for fasting pilgrims, emergency medication, and ambulance access.',
        coordinates: { x: 30, y: 60 },
        icon: 'HeartPulse'
      },
      {
        id: 'mf-assembly',
        name: 'Emergency Assembly Point Alpha',
        category: 'assembly',
        description: 'Designated muster station in the open clearing between Shiloh Sanctuary and Main Gate.',
        coordinates: { x: 35, y: 80 },
        icon: 'AlertTriangle'
      }
    ];

    // 7. Live Services Schedule
    this.liveServices = [
      {
        id: 'srv-001',
        title: 'Morning Glory & Divine Alignment',
        preacher: 'Apostle John Kimani William',
        startTime: '06:00 AM',
        endTime: '08:00 AM',
        status: 'live',
        streamUrl: 'https://www.youtube.com/embed/live_stream?channel=KingdomSeekersTV',
        viewersCount: 3420
      },
      {
        id: 'srv-002',
        title: 'Midday Hour of Fire & Deliverance',
        preacher: 'Pastor Peter Mwangi',
        startTime: '12:00 PM',
        endTime: '01:30 PM',
        status: 'upcoming',
        streamUrl: '',
        viewersCount: 0
      },
      {
        id: 'srv-003',
        title: 'Evening Mountain Revival & Prophetic Impartation',
        preacher: 'Apostle John Kimani William',
        startTime: '05:00 PM',
        endTime: '07:30 PM',
        status: 'upcoming',
        streamUrl: '',
        viewersCount: 0
      }
    ];

    // 8. 3-Hour Prayer Watches
    this.prayerWatches = [
      {
        id: 'pw-1',
        shiftTitle: 'First Watch: Sunset & Gatekeeping (Evening Watch)',
        timeRange: '18:00 - 21:00',
        focusArea: 'Repentance, Cleansing, Dedication of the Night & National Peace',
        leader: 'Evangelist Grace Muthoni',
        maxParticipants: 100,
        registeredCount: 64
      },
      {
        id: 'pw-2',
        shiftTitle: 'Second Watch: Breaking Yokes & Spiritual Warfare',
        timeRange: '21:00 - 00:00',
        focusArea: 'Overcoming Generational Curses, Witchcraft Demolition & Church Revival',
        leader: 'Pastor David Kiprono',
        maxParticipants: 100,
        registeredCount: 88
      },
      {
        id: 'pw-3',
        shiftTitle: 'Third Watch: Midnight Intercession (The Apostolic Watch)',
        timeRange: '00:00 - 03:00',
        focusArea: 'Prison Gate Breakthroughs (Acts 16), Divine Deliverance & Sudden Miracles',
        leader: 'Elder James Kariuki',
        maxParticipants: 150,
        registeredCount: 120
      },
      {
        id: 'pw-4',
        shiftTitle: 'Fourth Watch: Dawn Rising & Commanding the Morning',
        timeRange: '03:00 - 06:00',
        focusArea: 'Taking the Gates of the Day, Blessing the Work of Our Hands & Divine Favor',
        leader: 'Sister Mary Wanjiku',
        maxParticipants: 120,
        registeredCount: 95
      }
    ];

    // 9. Verified Testimonies
    this.testimonies = [
      {
        id: 'tst-001',
        authorName: 'Catherine Njeri',
        countyOrCity: 'Nairobi County',
        title: 'Instant Healing from 7 Years of Lumbar Spine Spondylosis',
        content: 'I came to Heavens Gate on crutches after doctors in Nairobi recommended spinal fusion. On the third day of dry fasting while praying at the Gethsemane Hillside during the midnight watch, sudden heat enveloped my lower back. I stood up, walked, jumped, and ran without pain! Jesus is Lord!',
        category: 'healing',
        status: 'approved',
        likesCount: 142,
        replies: [
          {
            id: 'rep-01',
            authorName: 'Brother Paul',
            comment: 'Praise Jesus! The God of Heavens Gate never fails.',
            timestamp: '2 hours ago'
          }
        ],
        createdAt: '2026-10-12T14:30:00Z'
      },
      {
        id: 'tst-002',
        authorName: 'Erick Kipkemboi',
        countyOrCity: 'Eldoret, Uasin Gishu',
        title: 'Breakthrough in Stalled Career and Freedom from Addictions',
        content: 'For 5 years I struggled with secret substance dependencies and repeated job rejections. While attending the Shiloh Sanctuary services and spending days in the Mount Carmel prayer booth, God completely delivered me. Just two days after checking out, I received an official appointment letter from a global NGO!',
        category: 'deliverance',
        status: 'approved',
        likesCount: 98,
        replies: [],
        createdAt: '2026-10-10T09:15:00Z'
      }
    ];

    // 10. Accurate Gilgil Transport Routes & Fare Estimator
    this.transportRoutes = [
      {
        id: 'tr-nbo',
        originCity: 'Nairobi (Country Bus / Tea Room / Accra Road)',
        routeTitle: 'Nairobi to Heavens Gate via Nairobi-Nakuru Highway',
        stageDirections: 'Board any 2NK, North Rift, Great Rift, or Western Express shuttle to Nakuru/Eldoret. Instruct conductor you will alight at "Heaven\'s Gate Stage" just after Gilgil weighbridge.',
        matatuFareKES: '400 - 550',
        bodaBodaFareKES: '100 - 150',
        travelTime: '2 hrs 15 mins (approx 125 km)',
        advice: 'Carry a warm jacket or shawl as Gilgil winds can be cold in the morning and evening.'
      },
      {
        id: 'tr-nkr',
        originCity: 'Nakuru City (Mashambani / Pipeline Stage)',
        routeTitle: 'Nakuru to Heavens Gate Stage',
        stageDirections: 'Take any shuttle heading towards Nairobi or Naivasha. Alight directly at Heaven\'s Gate junction stage near Gilgil.',
        matatuFareKES: '150 - 200',
        bodaBodaFareKES: '100 - 150',
        travelTime: '35 mins (approx 35 km)',
        advice: 'Boda bodas are readily stationed at the stage with Heavens Gate signage.'
      },
      {
        id: 'tr-nvs',
        originCity: 'Naivasha Town (Main Matatu Terminus)',
        routeTitle: 'Naivasha to Heavens Gate Stage',
        stageDirections: 'Board Nakuru-bound matatus. Alight at Heaven\'s Gate stage before Gilgil town.',
        matatuFareKES: '150 - 200',
        bodaBodaFareKES: '100 - 150',
        travelTime: '30 mins (approx 32 km)',
        advice: 'Ensure you arrive before 8:00 PM when security gates close.'
      }
    ];
  }
}

export const db = new DatabaseStore();
