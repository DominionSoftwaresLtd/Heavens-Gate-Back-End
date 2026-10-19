import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { db, UserRecord } from '../database/store.js';

export interface AuthenticatedRequest extends Request {
  user?: UserRecord;
}

/**
 * Mandatory authentication middleware.
 * Verifies JWT token from Authorization header and attaches the user record to req.user.
 */
export function authenticateUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Unauthorized: Authentication token is required to access this resource.'
    });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { id: string; role: string; name: string };
    const user = db.users.find(u => u.id === decoded.id || u.email === decoded.id);

    if (!user) {
      return res.status(401).json({
        error: 'Unauthorized: User account associated with this token was not found.'
      });
    }

    req.user = user;
    next();
  } catch (err: any) {
    return res.status(401).json({
      error: 'Unauthorized: Invalid or expired token. Please log in again.'
    });
  }
}

/**
 * Optional authentication middleware.
 * If a valid Bearer token is provided, attaches req.user. If not, proceeds without error.
 */
export function optionalAuthenticateUser(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { id: string; role: string; name: string };
    const user = db.users.find(u => u.id === decoded.id || u.email === decoded.id);
    if (user) {
      req.user = user;
    }
  } catch (e) {
    // Silently continue for optional auth
  }
  next();
}

/**
 * Role-based authorization middleware.
 * Requires user to have one of the permitted system roles. System admin is always authorized.
 */
export function requireRole(allowedRoles: Array<UserRecord['role']>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        error: 'Unauthorized: Authentication required.'
      });
    }

    if (req.user.role === 'system_admin' || allowedRoles.includes(req.user.role)) {
      return next();
    }

    return res.status(403).json({
      error: `Forbidden: Role '${req.user.role}' does not have sufficient permission for this operation.`
    });
  };
}

/**
 * Generate JWT token for a user record.
 */
export function generateToken(user: UserRecord): string {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn as any }
  );
}
