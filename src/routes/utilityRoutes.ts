import { Router, Request, Response } from 'express';
import { db } from '../database/store.js';
import { AIKnowledgeService } from '../services/aiKnowledgeService.js';
import { config } from '../config/index.js';

const router = Router();

// Campus Map Features & Points of Interest (Module I2, I3)
router.get('/map-features', (req: Request, res: Response) => {
  return res.json({
    campusName: "Heavens Gate Prayer Mountain, Gilgil",
    features: db.mapFeatures
  });
});

// Transport Routes & Fare Matrices (Module S)
router.get('/transport-routes', (req: Request, res: Response) => {
  return res.json({
    destination: "Heavens Gate Prayer Mountain, Gilgil, Nakuru County",
    routes: db.transportRoutes
  });
});

// "Ask Heavens Gate" Grounded AI Assistant (Module Q)
router.post('/ai-assistant/ask', (req: Request, res: Response) => {
  try {
    const { question } = req.body;
    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Please enter a valid question.' });
    }

    const answerResponse = AIKnowledgeService.askQuestion(question);
    return res.json(answerResponse);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// General Institutional Info & Emergency Contacts (Module O, Module R)
router.get('/emergency-contacts', (req: Request, res: Response) => {
  return res.json({
    institution: config.institution,
    emergencyNumbers: [
      { label: "Emergency Response & First Aid Desk", number: config.institution.emergencyPhone, available: "24/7" },
      { label: "Main Security & Gate Office", number: "+254 711 000 002", available: "5:00 AM - 8:00 PM" },
      { label: "Nehemiah Administration & Inquiries", number: config.institution.contactPhone, available: "Daily 8:00 AM - 5:00 PM" },
      { label: "Nakuru County Emergency Ambulance", number: "0800 720 021", available: "Toll Free 24/7" },
      { label: "Gilgil Police Station Hotline", number: "+254 50 401 2222", available: "24/7" }
    ]
  });
});

export default router;
