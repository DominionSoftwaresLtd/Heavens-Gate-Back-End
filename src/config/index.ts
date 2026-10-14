import dotenv from 'dotenv';
dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '5000', 10),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  jwtSecret: process.env.JWT_SECRET || 'heavens_gate_sacred_jwt_secret_key_2026',
  jwtExpiresIn: '7d',
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/heavens_gate_db',
  
  // Safaricom Daraja M-Pesa Configuration (Sandbox defaults with live switch capability)
  mpesa: {
    environment: process.env.MPESA_ENVIRONMENT || 'sandbox',
    consumerKey: process.env.MPESA_CONSUMER_KEY || 'sandbox_consumer_key_placeholder',
    consumerSecret: process.env.MPESA_CONSUMER_SECRET || 'sandbox_consumer_secret_placeholder',
    passkey: process.env.MPESA_PASSKEY || 'bfb279f9aa9bdbcf158e97dd71a467cd2e0c893059b10f78e6b72ada1ed2c919',
    shortcode: process.env.MPESA_SHORTCODE || '174379',
    callbackUrl: process.env.MPESA_CALLBACK_URL || 'http://localhost:5000/api/v1/payments/callback',
    simulateDelayMs: 2000 // For developer testing when Daraja is in simulated sandbox
  },

  // Gate Rules & Operational Timings
  gate: {
    openingHour: 5,  // 5:00 AM
    closingHour: 20, // 8:00 PM (20:00)
    enforceGateHours: true
  },

  // Institution details (Gilgil, Nakuru County, Kenya)
  institution: {
    name: "Heavens Gate Prayer Mountain",
    location: "Gilgil, Nakuru County, Kenya (Off Nairobi-Nakuru Highway)",
    founderVision: "Apostle John Kimani William (Kingdom Seekers Fellowship)",
    contactPhone: "+254 722 000 000 / +254 733 000 000",
    emergencyPhone: "+254 700 999 111",
    teaHours: "06:30 - 07:30, 13:00 - 14:00, 18:30 - 19:30"
  }
};
