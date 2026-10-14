# Heavens Gate Prayer Mountain — Digital Platform (Backend Core)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/badge/Node.js-v20+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![Express.js](https://img.shields.io/badge/Express-4.21-lightgrey.svg)](https://expressjs.com/)
[![Safaricom Daraja](https://img.shields.io/badge/M--Pesa-Daraja%20API-emerald.svg)](https://developer.safaricom.co.ke/)

High-concurrency, secure, modular monolith backend powering the **Heavens Gate Prayer Mountain Digital Management System** in Gilgil, Nakuru County, Kenya.

---

## 🏛️ Project & Operational Overview
Heavens Gate Prayer Mountain is a consecrated spiritual retreat center established under the vision of **Apostle John Kimani William** (Kingdom Seekers Fellowship) along the Nairobi-Nakuru Highway in Gilgil, Kenya.

This backend enforces the institution's real-world operational and spiritual business rules:
- **Strict Fasting Policy:** Consecrated prayer grounds where no cooked food, snacks, or outside fruits are permitted inside the gates (enforced via mandatory luggage screening records). Free boiling water points and scheduled tea are distributed on-site.
- **Gate Hours Enforcement:** Official gates operate strictly between **5:00 AM and 8:00 PM** daily for security and order.
- **Modest Dress Attire:** Long skirts/dresses for ladies below knees; modest trousers for gentlemen.
- **Subsidised Accommodation Rates:** Single rooms (KES 600), Double sharing (KES 450), 4-person dorms (KES 280), and 6-person general halls (KES 180).

---

## 🚀 Key Architectural Capabilities

### 1. Concurrency-Safe Inventory & Hold Engine (Rule BR-01)
- Implements 15-minute atomic reservation holds (`holdExpiresAt`) to prevent double-booking during peak gatherings.
- Automatically calculates live bookable beds:  
  $$\text{Available} = \text{Total Inventory} - (\text{Confirmed} + \text{Active Holds} + \text{Maintenance})$$
- Enforces gender separation constraints across dormitory blocks (Bethany Brothers vs. Bethany Sisters wings).

### 2. Safaricom Daraja M-Pesa Integration (Rules BR-03, BR-13)
- Server-side STK Push initiation via Lipa Na M-Pesa Online.
- Idempotent callback processing protecting against duplicate transaction IDs.
- Dual-mode architecture: seamlessly toggles between live Daraja credentials and a sandbox simulator for local testing.

### 3. Cryptographic QR Ticketing & Duplicate Prevention (Rules BR-04, BR-05)
- Issues tamper-proof admission passes signed with cryptographic HMAC-SHA256 tokens.
- Gate scanner endpoint validates ticket authenticity and atomically blocks duplicate entries with exact timestamp and officer logging.

### 4. 4-Point Mandatory Gate Screening Workflow (Rule BR-08)
- Requires gate officers to verify 4 mandatory checkpoints prior to granting admission:
  1. Modest dress code inspection
  2. Strict luggage inspection (no food/fruits)
  3. National ID / Passport inspection
  4. In-person orientation safety briefing

### 5. Grounded Institutional AI Assistant (Rule BR-14)
- Embedded RAG-style knowledge base answering questions strictly grounded in official Gilgil policies (packing list, stage directions, gate hours, fasting guidelines).

---

## 📡 Versioned API Endpoints (`/api/v1/*`)

| Route Group | Path | Key Operations |
|---|---|---|
| **Authentication** | `/api/v1/auth` | Visitor registration, login, role authentication, demo accounts |
| **Accommodation** | `/api/v1/accommodation` | Categories, physical blocks, real-time occupancy metrics, pricing engine |
| **Bookings** | `/api/v1/bookings` | Create reservation hold, retrieve booking details, manage bookings |
| **Payments** | `/api/v1/payments` | Daraja STK Push, webhook callback, instant sandbox simulator, finance reports |
| **Tickets** | `/api/v1/tickets` | Retrieve ticket, generate QR code Data URL, verify gate scan |
| **Gate Operations**| `/api/v1/gate` | Check gate status (5 AM - 8 PM), admission check-in, checkout inventory release |
| **Ministry** | `/api/v1/ministry` | Live sanctuary broadcasts, 3-hour prayer watches, testimonies feed, private prayer requests |
| **Utilities** | `/api/v1/utility` | Campus map coordinates, transport fare routes, AI assistant Q&A, emergency contacts |
| **Administration** | `/api/v1/admin` | Executive dashboard metrics, occupancy breakdown, audit logs, CSV exports |

---

## 🛠️ Tech Stack & Dependencies
- **Runtime:** Node.js (v20+ / v24+)
- **Framework:** Express.js 4.21
- **Language:** TypeScript 5.7
- **Database:** MongoDB with Mongoose (with automated resilient in-memory fallback store)
- **Real-Time:** Socket.io 4.8
- **Cryptography & Security:** HMAC-SHA256, bcryptjs, jsonwebtoken, CORS, Zod
- **QR Codes:** `qrcode` library

---

## 🏃 Getting Started

### 1. Installation
```bash
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root directory:
```env
PORT=5000
CLIENT_URL=http://localhost:5173
JWT_SECRET=your_super_secret_jwt_key
MONGODB_URI=mongodb://127.0.0.1:27017/heavens_gate_db

# Safaricom Daraja M-Pesa (Sandbox defaults)
MPESA_ENVIRONMENT=sandbox
MPESA_CONSUMER_KEY=your_consumer_key
MPESA_CONSUMER_SECRET=your_consumer_secret
MPESA_PASSKEY=bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919
MPESA_SHORTCODE=174379
MPESA_CALLBACK_URL=http://localhost:5000/api/v1/payments/callback
```

### 3. Run Development Server
```bash
npm run dev
```
The server will start at `http://localhost:5000`.

### 4. Build for Production
```bash
npm run build
npm start
```

---

## 🧪 Automated Testing
Run the comprehensive 11-step enterprise test runner:
```bash
node ../test_runner.mjs
```

---

## 📄 License
This project is proprietary and developed for **Heavens Gate Prayer Mountain**, Gilgil, Kenya by Dominion Softwares Ltd.
