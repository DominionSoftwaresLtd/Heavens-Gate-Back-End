import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { db, UserRecord } from '../database/store.js';
import { config } from '../config/index.js';

const router = Router();

// Register new visitor account
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { name, phone, email, password, nationalId } = req.body;

    if (!name || !phone || !password) {
      return res.status(400).json({ error: 'Name, phone number, and password are required.' });
    }

    // Check if phone or email already registered
    const existing = db.users.find(u => u.phone === phone || (email && u.email === email));
    if (existing) {
      return res.status(400).json({ error: 'An account with this phone number or email already exists.' });
    }

    const salt = bcrypt.genSaltSync(10);
    const passwordHash = bcrypt.hashSync(password, salt);

    const newUser: UserRecord = {
      id: uuidv4(),
      name,
      phone,
      email: email || '',
      passwordHash,
      role: 'registered_pilgrim',
      nationalId: nationalId || '',
      isFirstTime: true,
      totalVisits: 0,
      createdAt: new Date().toISOString()
    };

    db.users.push(newUser);

    const token = jwt.sign(
      { id: newUser.id, role: newUser.role, name: newUser.name },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    const { passwordHash: _, ...userSafe } = newUser;
    return res.status(201).json({
      message: 'Account registered successfully.',
      user: userSafe,
      token
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { identifier, password } = req.body; // Phone or email
    if (!identifier || !password) {
      return res.status(400).json({ error: 'Please provide phone/email and password.' });
    }

    const user = db.users.find(u => u.phone === identifier || u.email === identifier);
    if (!user) {
      return res.status(401).json({ error: 'Invalid login credentials.' });
    }

    const isMatch = bcrypt.compareSync(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid login credentials.' });
    }

    const token = jwt.sign(
      { id: user.id, role: user.role, name: user.name },
      config.jwtSecret,
      { expiresIn: '7d' }
    );

    const { passwordHash: _, ...userSafe } = user;
    return res.json({
      message: 'Logged in successfully.',
      user: userSafe,
      token
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
});

// Demo accounts endpoint (provides ready-to-test role accounts for easy testing)
router.get('/demo-accounts', (req: Request, res: Response) => {
  const safeAccounts = db.users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role
  }));
  return res.json({
    defaultPassword: 'HeavensGate@2026',
    accounts: safeAccounts
  });
});

export default router;
