import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { config } from './config/index.js';
import { connectDatabase } from './database/connection.js';

// Route handlers
import authRoutes from './routes/authRoutes.js';
import accommodationRoutes from './routes/accommodationRoutes.js';
import bookingRoutes from './routes/bookingRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import ticketRoutes from './routes/ticketRoutes.js';
import gateRoutes from './routes/gateRoutes.js';
import ministryRoutes from './routes/ministryRoutes.js';
import utilityRoutes from './routes/utilityRoutes.js';
import adminRoutes from './routes/adminRoutes.js';

const app = express();
const server = http.createServer(app);

// Setup Socket.io for real-time admission notifications & prayer watch updates
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Request logger for auditability
app.use((req, res, next) => {
  console.log(`[API] ${req.method} ${req.url}`);
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    platform: 'Heavens Gate Prayer Mountain Digital Management System',
    location: 'Gilgil, Nakuru County, Kenya',
    timestamp: new Date().toISOString()
  });
});

// Versioned API Routes (Requirement 2.3)
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/accommodation', accommodationRoutes);
app.use('/api/v1/bookings', bookingRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/tickets', ticketRoutes);
app.use('/api/v1/gate', gateRoutes);
app.use('/api/v1/ministry', ministryRoutes);
app.use('/api/v1/utility', utilityRoutes);
app.use('/api/v1/admin', adminRoutes);

// Socket.io Real-time connection handler
io.on('connection', (socket) => {
  console.log(`[Socket.io] Client connected: ${socket.id}`);

  socket.on('join_gate_room', () => {
    socket.join('gate_officers');
    console.log(`[Socket.io] Officer joined gate room: ${socket.id}`);
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.io] Client disconnected: ${socket.id}`);
  });
});

// Start Server
async function startServer() {
  await connectDatabase();

  server.listen(config.port, () => {
    console.log(`\n=================================================================`);
    console.log(`✨ HEAVENS GATE PRAYER MOUNTAIN DIGITAL PLATFORM (GILGIL, KENYA)`);
    console.log(`🌐 Backend Server running on port http://localhost:${config.port}`);
    console.log(`📡 Versioned API Base: http://localhost:${config.port}/api/v1`);
    console.log(`=================================================================\n`);
  });
}

startServer();

export { app, io };
