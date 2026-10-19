import { Router, Response } from 'express';
import { db } from '../database/store.js';
import { optionalAuthenticateUser, AuthenticatedRequest } from '../middleware/authMiddleware.js';

const router = Router();

/**
 * GET /api/v1/messages/my-messages
 * Secure endpoint retrieving the current user's private prayer requests / messages.
 * Enforces BR-11 Privacy: Never exposes another user's prayer requests.
 */
router.get('/my-messages', optionalAuthenticateUser, (req: AuthenticatedRequest, res: Response) => {
  const { identifier } = req.query;
  const user = req.user;

  // 1. Determine target identity
  const phoneToMatch = user?.phone || (typeof identifier === 'string' ? identifier.trim() : '');
  const emailToMatch = user?.email?.toLowerCase() || (typeof identifier === 'string' && identifier.includes('@') ? identifier.trim().toLowerCase() : '');
  const userIdToMatch = user?.id;

  if (!phoneToMatch && !emailToMatch && !userIdToMatch) {
    return res.status(401).json({
      error: 'Unauthorized: Please log in or provide your registered phone/email identifier to view your messages.'
    });
  }

  // 2. Strict privacy filtering: return only requests matching this specific visitor
  const matchingRequests = db.prayerRequests.filter(pr => {
    const matchesUser = userIdToMatch && pr.visitorId === userIdToMatch;
    const matchesPhone = phoneToMatch && pr.phone.trim() === phoneToMatch;
    const matchesEmail = emailToMatch && pr.email && pr.email.trim().toLowerCase() === emailToMatch;
    return matchesUser || matchesPhone || matchesEmail;
  });

  return res.json({
    success: true,
    count: matchingRequests.length,
    messages: matchingRequests.slice().reverse(),
    requests: matchingRequests.slice().reverse()
  });
});

export default router;
