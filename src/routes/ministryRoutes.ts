import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { db, TestimonyRecord, PrayerRequestRecord } from '../database/store.js';
import { optionalAuthenticateUser, authenticateUser, requireRole, AuthenticatedRequest } from '../middleware/authMiddleware.js';

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

// =========================================================================
// 3. TESTIMONIES MODULE (Module A)
// =========================================================================

/**
 * GET /ministry/testimonies
 * Browse publicly approved testimonies with category filtering and search.
 */
router.get('/testimonies', (req: Request, res: Response) => {
  const { category, q, page, limit } = req.query;

  // Only approved testimonies are publicly exposed
  let results = db.testimonies.filter(t => t.status === 'approved');

  if (category && category !== 'all' && typeof category === 'string') {
    results = results.filter(t => t.category === category);
  }

  if (q && typeof q === 'string') {
    const term = q.toLowerCase().trim();
    results = results.filter(t => 
      t.title.toLowerCase().includes(term) ||
      t.content.toLowerCase().includes(term) ||
      t.authorName.toLowerCase().includes(term) ||
      t.countyOrCity.toLowerCase().includes(term)
    );
  }

  const pageNum = parseInt(page as string || '1', 10);
  const limitNum = parseInt(limit as string || '50', 10);
  const startIndex = (pageNum - 1) * limitNum;
  const paginated = results.slice(startIndex, startIndex + limitNum);

  return res.json({
    total: results.length,
    page: pageNum,
    limit: limitNum,
    testimonies: paginated
  });
});

/**
 * GET /ministry/testimonies/:id
 * Retrieve a specific published testimony.
 */
router.get('/testimonies/:id', optionalAuthenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const testimony = db.testimonies.find(t => t.id === id);

  if (!testimony) {
    return res.status(404).json({ error: 'Testimony not found.' });
  }

  // Non-approved testimonies can only be viewed by author or admins/moderators
  if (testimony.status !== 'approved') {
    const isAuthor = req.user && req.user.id === testimony.authorId;
    const isStaff = req.user && ['system_admin', 'testimony_moderator', 'senior_management'].includes(req.user.role);
    if (!isAuthor && !isStaff) {
      return res.status(404).json({ error: 'Testimony not found or pending pastoral moderation.' });
    }
  }

  return res.json({ testimony });
});

/**
 * POST /ministry/testimonies
 * Submit a new praise report / testimony.
 */
router.post('/testimonies', optionalAuthenticateUser, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { authorName, countyOrCity, title, content, category } = req.body;

    if (!title || typeof title !== 'string' || title.trim().length < 3) {
      return res.status(400).json({ error: 'A meaningful title of at least 3 characters is required.' });
    }

    if (!content || typeof content !== 'string' || content.trim().length < 10) {
      return res.status(400).json({ error: 'Testimony content must be at least 10 characters describing what God has done.' });
    }

    if (content.length > 5000) {
      return res.status(400).json({ error: 'Testimony content exceeds maximum permitted length (5000 characters).' });
    }

    const validCategories = ['healing', 'deliverance', 'financial_breakthrough', 'family_restoration', 'spiritual_growth'];
    const chosenCategory = validCategories.includes(category) ? category : 'spiritual_growth';

    const nowIso = new Date().toISOString();
    const newTestimony: TestimonyRecord = {
      id: uuidv4(),
      authorId: req.user?.id,
      authorName: (req.user?.name || authorName || 'Anonymous Pilgrim').trim(),
      countyOrCity: (countyOrCity || 'Kenya').trim(),
      title: title.trim(),
      content: content.trim(),
      category: chosenCategory,
      status: 'approved', // Auto-approved for verified faith building
      likesCount: 0,
      likedBy: [],
      replies: [],
      createdAt: nowIso,
      updatedAt: nowIso
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

/**
 * POST /ministry/testimonies/:id/like (and /likes)
 * Persistent like registration with duplicate prevention.
 */
const handleLike = (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const testimony = db.testimonies.find(t => t.id === id);

  if (!testimony) {
    return res.status(404).json({ error: 'Testimony not found.' });
  }

  if (!testimony.likedBy) {
    testimony.likedBy = [];
  }

  // Identify liker (authenticated user ID, request body userId, or client IP)
  const likerId = req.user?.id || req.body?.userId || req.ip || 'anonymous-user';

  if (testimony.likedBy.includes(likerId)) {
    // Idempotent: already liked
    return res.json({
      success: true,
      alreadyLiked: true,
      likesCount: testimony.likesCount,
      message: 'You have already praised God for this testimony.'
    });
  }

  testimony.likedBy.push(likerId);
  testimony.likesCount = testimony.likedBy.length;

  return res.json({
    success: true,
    alreadyLiked: false,
    likesCount: testimony.likesCount,
    message: 'Praise God! Your encouragement has been added.'
  });
};

router.post('/testimonies/:id/like', optionalAuthenticateUser, handleLike);
router.post('/testimonies/:id/likes', optionalAuthenticateUser, handleLike);

/**
 * DELETE /ministry/testimonies/:id/like (and /likes)
 * Remove like if user changes mind.
 */
const handleUnlike = (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const testimony = db.testimonies.find(t => t.id === id);

  if (!testimony) {
    return res.status(404).json({ error: 'Testimony not found.' });
  }

  if (!testimony.likedBy) {
    testimony.likedBy = [];
  }

  const likerId = req.user?.id || req.body?.userId || req.ip || 'anonymous-user';
  const index = testimony.likedBy.indexOf(likerId);

  if (index !== -1) {
    testimony.likedBy.splice(index, 1);
    testimony.likesCount = Math.max(0, testimony.likesCount - 1);
  }

  return res.json({
    success: true,
    unliked: true,
    likesCount: testimony.likesCount
  });
};

router.delete('/testimonies/:id/like', optionalAuthenticateUser, handleUnlike);
router.delete('/testimonies/:id/likes', optionalAuthenticateUser, handleUnlike);

/**
 * GET /ministry/testimonies/:id/comments
 * Retrieve comments for a specific testimony.
 */
router.get('/testimonies/:id/comments', (req: Request, res: Response) => {
  const { id } = req.params;
  const testimony = db.testimonies.find(t => t.id === id);

  if (!testimony) {
    return res.status(404).json({ error: 'Testimony not found.' });
  }

  return res.json({
    testimonyId: id,
    count: (testimony.replies || []).length,
    comments: testimony.replies || []
  });
});

/**
 * POST /ministry/testimonies/:id/reply (and /comments)
 * Post a comment or encouragement on a testimony.
 */
const handleAddComment = (req: AuthenticatedRequest, res: Response) => {
  const { id } = req.params;
  const { authorName, comment, text } = req.body;
  const rawComment = comment || text;

  if (!rawComment || typeof rawComment !== 'string' || !rawComment.trim()) {
    return res.status(400).json({ error: 'Comment content cannot be empty.' });
  }

  if (rawComment.trim().length > 1000) {
    return res.status(400).json({ error: 'Comment exceeds maximum allowed length of 1000 characters.' });
  }

  const testimony = db.testimonies.find(t => t.id === id);
  if (!testimony) {
    return res.status(404).json({ error: 'Testimony not found.' });
  }

  if (!testimony.replies) {
    testimony.replies = [];
  }

  const commenterName = req.user?.name || (authorName && authorName.trim()) || 'Fellow Pilgrim';
  const newReply = {
    id: uuidv4(),
    authorId: req.user?.id,
    authorName: commenterName,
    comment: rawComment.trim(),
    timestamp: 'Just now',
    status: 'approved' as const
  };

  testimony.replies.push(newReply);
  return res.status(201).json({
    success: true,
    message: 'Comment posted successfully.',
    reply: newReply
  });
};

router.post('/testimonies/:id/reply', optionalAuthenticateUser, handleAddComment);
router.post('/testimonies/:id/comments', optionalAuthenticateUser, handleAddComment);

// =========================================================================
// 4. CONFIDENTIAL PRAYER REQUESTS MODULE (Module B)
// =========================================================================

/**
 * POST /ministry/prayer-requests
 * Submit confidential prayer request to the Mountain Altar.
 * Enforces BR-11 Privacy & duplicate prevention.
 */
router.post('/prayer-requests', optionalAuthenticateUser, (req: AuthenticatedRequest, res: Response) => {
  try {
    const { visitorName, phone, email, requestText, category, isConfidential } = req.body;

    if (!requestText || typeof requestText !== 'string' || requestText.trim().length < 5) {
      return res.status(400).json({ error: 'Please describe your prayer request with at least 5 characters.' });
    }

    if (requestText.length > 3000) {
      return res.status(400).json({ error: 'Prayer request exceeds maximum length of 3000 characters.' });
    }

    const cleanPhone = (phone || req.user?.phone || '').trim();
    if (!cleanPhone || cleanPhone.length < 8) {
      return res.status(400).json({ error: 'A valid phone number is required for pastoral SMS follow-up.' });
    }

    const nowIso = new Date().toISOString();
    const cleanEmail = (email || req.user?.email || '').trim().toLowerCase();
    const cleanText = requestText.trim();

    // Duplicate submission check: if identical phone & text submitted in last 60 seconds
    const recentDuplicate = db.prayerRequests.find(pr => {
      const isSamePhone = pr.phone === cleanPhone;
      const isSameText = pr.requestText.toLowerCase() === cleanText.toLowerCase();
      const timeDiffMs = Date.now() - new Date(pr.createdAt).getTime();
      return isSamePhone && isSameText && timeDiffMs < 60000;
    });

    if (recentDuplicate) {
      return res.status(409).json({
        error: 'Duplicate prayer request: An identical request was received within the last 60 seconds. Our intercessors are already standing in agreement with you.',
        requestId: recentDuplicate.id,
        duplicate: true
      });
    }

    const newRequest: PrayerRequestRecord = {
      id: uuidv4(),
      visitorId: req.user?.id,
      visitorName: (visitorName || req.user?.name || 'Intercession Seeker').trim(),
      phone: cleanPhone,
      email: cleanEmail,
      requestText: cleanText,
      category: (category || 'General Intercession').trim(),
      isConfidential: isConfidential !== undefined ? Boolean(isConfidential) : true,
      status: 'received',
      duplicateCheckKey: `${cleanPhone}:${cleanText.substring(0, 30)}`,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    db.prayerRequests.push(newRequest);

    return res.status(201).json({
      success: true,
      message: 'Your prayer request has been securely submitted to the Heavens Gate intercessory team. We stand in agreement with you in faith.',
      requestId: newRequest.id,
      prayerRequest: newRequest
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /ministry/prayer-requests/my
 * Retrieve authenticated user's own prayer requests.
 */
router.get('/prayer-requests/my', authenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user?.id;
  const userPhone = req.user?.phone;
  const userEmail = req.user?.email?.toLowerCase();

  const userRequests = db.prayerRequests.filter(pr => 
    (userId && pr.visitorId === userId) ||
    (userPhone && pr.phone === userPhone) ||
    (userEmail && pr.email && pr.email.toLowerCase() === userEmail)
  );

  return res.json({
    count: userRequests.length,
    requests: userRequests.slice().reverse()
  });
});

/**
 * GET /ministry/prayer-requests/team
 * Restricted endpoint for authorized pastoral prayer intercession teams.
 */
router.get('/prayer-requests/team', authenticateUser, requireRole(['prayer_admin', 'prayer_team', 'system_admin', 'senior_management']), (req: AuthenticatedRequest, res: Response) => {
  const { status, category } = req.query;
  let requests = [...db.prayerRequests];

  if (status && typeof status === 'string') {
    requests = requests.filter(r => r.status === status);
  }
  if (category && typeof category === 'string') {
    requests = requests.filter(r => r.category === category);
  }

  return res.json({
    count: requests.length,
    requests: requests.reverse()
  });
});

export default router;
