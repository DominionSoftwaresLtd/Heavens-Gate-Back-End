import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, TestimonyRecord, PrayerRequestRecord } from '../database/store.js';

const router = Router();

// 1. Live Services
router.get('/services', (req: Request, res: Response) => {
  return res.json({ services: db.liveServices });
});

// 2. Prayer Watches (3-hour shifts)
router.get('/prayer-watches', (req: Request, res: Response) => {
  return res.json({ prayerWatches: db.prayerWatches });
});

router.post('/prayer-watches/register', (req: Request, res: Response) => {
  const { watchId, pilgrimName } = req.body;
  const watch = db.prayerWatches.find(w => w.id === watchId);
  if (!watch) {
    return res.status(404).json({ error: 'Prayer watch shift not found.' });
  }

  if (watch.registeredCount >= watch.maxParticipants) {
    return res.status(400).json({ error: 'This prayer watch shift has reached maximum participant capacity.' });
  }

  watch.registeredCount += 1;
  return res.json({
    success: true,
    message: `Registered ${pilgrimName || 'Pilgrim'} for ${watch.shiftTitle} (${watch.timeRange}).`,
    watch
  });
});

// 3. Testimonies Feed
router.get('/testimonies', (req: Request, res: Response) => {
  const approved = db.testimonies.filter(t => t.status === 'approved');
  return res.json({ testimonies: approved });
});

router.post('/testimonies', (req: Request, res: Response) => {
  try {
    const { authorName, countyOrCity, title, content, category } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required.' });
    }

    const newTestimony: TestimonyRecord = {
      id: uuidv4(),
      authorName: authorName || 'Anonymous Pilgrim',
      countyOrCity: countyOrCity || 'Kenya',
      title,
      content,
      category: category || 'spiritual_growth',
      status: 'approved', // Auto-approved for verified demo or queued for moderation
      likesCount: 0,
      replies: [],
      createdAt: new Date().toISOString()
    };

    db.testimonies.unshift(newTestimony);
    return res.status(201).json({
      success: true,
      message: 'Your testimony has been published to the glory of God!',
      testimony: newTestimony
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Add reply to testimony
router.post('/testimonies/:id/reply', (req: Request, res: Response) => {
  const { id } = req.params;
  const { authorName, comment } = req.body;

  const testimony = db.testimonies.find(t => t.id === id);
  if (!testimony) {
    return res.status(404).json({ error: 'Testimony not found.' });
  }

  const newReply = {
    id: uuidv4(),
    authorName: authorName || 'Fellow Pilgrim',
    comment,
    timestamp: 'Just now'
  };

  testimony.replies.push(newReply);
  return res.json({ success: true, reply: newReply });
});

// Like testimony
router.post('/testimonies/:id/like', (req: Request, res: Response) => {
  const { id } = req.params;
  const testimony = db.testimonies.find(t => t.id === id);
  if (testimony) {
    testimony.likesCount += 1;
    return res.json({ success: true, likesCount: testimony.likesCount });
  }
  return res.status(404).json({ error: 'Testimony not found.' });
});

// 4. Confidential Prayer Requests (BR-11 Privacy enforcement)
router.post('/prayer-requests', (req: Request, res: Response) => {
  try {
    const { visitorName, phone, email, requestText, category, isConfidential } = req.body;
    if (!requestText || !phone) {
      return res.status(400).json({ error: 'Prayer request text and phone number are required.' });
    }

    const newRequest: PrayerRequestRecord = {
      id: uuidv4(),
      visitorName: visitorName || 'Intercession Seeker',
      phone,
      email: email || '',
      requestText,
      category: category || 'General Intercession',
      isConfidential: isConfidential !== undefined ? isConfidential : true,
      status: 'received',
      createdAt: new Date().toISOString()
    };

    db.prayerRequests.push(newRequest);
    return res.status(201).json({
      success: true,
      message: 'Your prayer request has been securely submitted to the Heavens Gate intercessory team. We stand in agreement with you in faith.',
      requestId: newRequest.id
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Prayer Team endpoint (Restricted to Prayer Team role)
router.get('/prayer-requests/team', (req: Request, res: Response) => {
  return res.json({
    count: db.prayerRequests.length,
    requests: db.prayerRequests
  });
});

export default router;
