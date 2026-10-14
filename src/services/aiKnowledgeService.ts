import { db } from '../database/store.js';
import { config } from '../config/index.js';

interface KnowledgeItem {
  id: string;
  category: string;
  question: string;
  keywords: string[];
  answer: string;
  relatedModule?: string;
}

export class AIKnowledgeService {
  private static knowledgeBase: KnowledgeItem[] = [
    {
      id: 'kb-food-policy',
      category: 'Rules & Fasting',
      question: 'Can I bring food, snacks, or fruits to Heavens Gate?',
      keywords: ['food', 'fruits', 'snacks', 'eating', 'cook', 'meals', 'bread', 'soda'],
      answer: 'Strictly NO cooked food, fruits, snacks, or outside edibles are permitted within Heavens Gate Prayer Mountain. The mountain is dedicated to intensive prayer and fasting. Security officers conduct thorough luggage inspections at the entrance gate. Free drinking water, boiling water points, and scheduled tea (at 6:30 AM, 1:00 PM, and 6:30 PM) are provided. Permitted items like sugar, coffee, or milk can be bought at the on-site tuck shop if needed.',
      relatedModule: 'Fasting Guidelines'
    },
    {
      id: 'kb-dress-code',
      category: 'Dress Code',
      question: 'What is the required dress code at Heavens Gate?',
      keywords: ['dress', 'clothes', 'attire', 'skirt', 'trousers', 'wear', 'modesty', 'women', 'men'],
      answer: 'Heavens Gate upholds a strict modesty policy to maintain reverent sanctity. Women are required to wear long dresses or skirts extending well below the knees (no tight trousers, miniskirts, or sleeveless tops). Carrying a warm shawl or lesso is highly recommended. Men should wear clean, modest trousers or shirts (no shorts, vests, or sleeveless shirts).',
      relatedModule: 'Modesty Policy'
    },
    {
      id: 'kb-gate-hours',
      category: 'Gate Operating Hours',
      question: 'What time does the gate open and close?',
      keywords: ['gate', 'time', 'hours', 'open', 'close', 'arrival', 'late', 'night'],
      answer: `The security gates open strictly at 5:00 AM and close at 8:00 PM daily. For security, safety, and order, no visitors are admitted after 8:00 PM without prior emergency pastoral authorization. Please plan your journey along the Nairobi-Nakuru highway to arrive before 7:30 PM.`,
      relatedModule: 'Gate Operations'
    },
    {
      id: 'kb-what-to-bring',
      category: 'Visitor Preparation',
      question: 'What items must I carry when coming to Heavens Gate?',
      keywords: ['bring', 'carry', 'pack', 'checklist', 'items', 'id', 'thermos', 'flask', 'mug', 'cup'],
      answer: 'Essential packing list: 1) Original National ID or valid Passport (mandatory for check-in); 2) Personal flask or thermos (for hot water/tea); 3) Personal cup/mug and spoon; 4) Bible, notebook, and pen; 5) Warm clothing, heavy jacket, socks, and shawl (Gilgil nights get quite cold); 6) Personal toiletries and slippers; 7) Your QR ticket on your phone or printed.',
      relatedModule: 'Packing Checklist'
    },
    {
      id: 'kb-directions-transport',
      category: 'Directions & Transport',
      question: 'How do I get to Heavens Gate from Nairobi or Nakuru?',
      keywords: ['direction', 'transport', 'matatu', 'fare', 'nairobi', 'nakuru', 'gilgil', 'highway', 'boda', 'stage'],
      answer: 'From Nairobi (Accra Rd / Country Bus): Board any shuttle/matatu bound for Nakuru or Eldoret (fare approx KES 400 - 550) and alight at "Heaven\'s Gate Stage" just past the Gilgil weighbridge. From Nakuru: Board Nairobi-bound shuttles and alight at Heaven\'s Gate stage (fare KES 150 - 200). From the stage, take a marked Boda Boda directly to the main gate for KES 100 - 150 (approx 1.5 km).',
      relatedModule: 'Transport Estimator'
    },
    {
      id: 'kb-accommodation-rates',
      category: 'Accommodation',
      question: 'What are the accommodation options and rates?',
      keywords: ['room', 'price', 'rates', 'cost', 'stay', 'accommodation', 'bed', 'dorm', 'single', 'double'],
      answer: 'Heavens Gate offers subsidised rates to keep the mountain accessible to all believers: 1) Single Private Room: KES 600/night; 2) Double Sharing Room: KES 450 per person/night; 3) 4-Person Dormitory Wing: KES 280 per person/night; 4) 6-Person General Hall: KES 180 per person/night. Advance reservations can be completed online via M-Pesa.',
      relatedModule: 'Accommodation Booking'
    },
    {
      id: 'kb-prayer-watches',
      category: 'Spiritual Programs',
      question: 'What are the prayer watch shifts and service times?',
      keywords: ['watch', 'shifts', 'prayer', 'service', 'fellowship', 'schedule', 'midnight', 'worship'],
      answer: 'Daily Services at Shiloh Sanctuary: Morning Glory (6:00 AM - 8:00 AM), Midday Hour of Power (12:00 PM - 1:30 PM), and Evening Mountain Revival (5:00 PM - 7:30 PM). Continuous 3-hour prayer watches operate throughout the night: First Watch (18:00 - 21:00), Second Watch (21:00 - 00:00), Third Apostolic Watch (00:00 - 03:00), and Fourth Watch (03:00 - 06:00).',
      relatedModule: 'Prayer Watches'
    },
    {
      id: 'kb-emergency-firstaid',
      category: 'Medical & Emergency',
      question: 'What medical or emergency help is available during fasting?',
      keywords: ['medical', 'sick', 'emergency', 'doctor', 'first aid', 'hospital', 'clinic', 'faint'],
      answer: `Bethesda Health & First Aid Clinic is situated near Reception and operates 24/7 with trained nurses for blood pressure and glucose checks during long fasts. For emergencies, contact the Emergency Response Desk immediately at ${config.institution.emergencyPhone}.`,
      relatedModule: 'Emergency Assistance'
    }
  ];

  // Grounded search function
  static askQuestion(userQuery: string): {
    answer: string;
    category: string;
    confidence: number;
    relatedModule?: string;
    contactFallback?: string;
  } {
    const query = userQuery.toLowerCase().trim();
    let bestMatch: KnowledgeItem | null = null;
    let highestScore = 0;

    for (const item of this.knowledgeBase) {
      let score = 0;
      for (const kw of item.keywords) {
        if (query.includes(kw)) {
          score += 2;
        }
      }
      if (item.question.toLowerCase().includes(query)) {
        score += 3;
      }
      if (score > highestScore) {
        highestScore = score;
        bestMatch = item;
      }
    }

    if (bestMatch && highestScore >= 2) {
      return {
        answer: bestMatch.answer,
        category: bestMatch.category,
        confidence: Math.min(100, highestScore * 20),
        relatedModule: bestMatch.relatedModule
      };
    }

    // Grounded limitation response with official institutional contacts (Rule BR-14, Module Q5)
    return {
      answer: `Shalom! I am the Heavens Gate Assistant, grounded in the official rules and guidelines for our prayer mountain in Gilgil. I don't have verified information regarding your exact inquiry. For specialized inquiries, please contact our Nehemiah Administration Desk at ${config.institution.contactPhone} or speak with a pastoral officer at the main gate.`,
      category: 'General Guidance',
      confidence: 30,
      contactFallback: config.institution.contactPhone
    };
  }
}
