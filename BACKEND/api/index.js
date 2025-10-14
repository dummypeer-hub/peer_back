const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const rateLimit = require('express-rate-limit');
const Razorpay = require('razorpay');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// Validation middleware
const { validateBody, schemas } = require('../middleware/validate');

// Environment variables with fallbacks
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key';

// Razorpay configuration
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Initialize database tables
pool.connect(async (err, client, release) => {
  if (err) {
    console.error('Database connection error:', err.stack);
  } else {
    console.log('Database connected successfully');
    
    // Create necessary tables for feedback system
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(255) UNIQUE NOT NULL,
          email VARCHAR(255) NOT NULL,
          phone VARCHAR(20),
          password_hash VARCHAR(255) NOT NULL,
          role VARCHAR(20) NOT NULL CHECK (role IN ('mentor', 'mentee')),
          verified BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS otp_codes (
          id SERIAL PRIMARY KEY,
          email VARCHAR(255) NOT NULL,
          otp_code VARCHAR(6) NOT NULL,
          purpose VARCHAR(20) NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          is_used BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS video_calls (
          id SERIAL PRIMARY KEY,
          mentee_id INTEGER NOT NULL REFERENCES users(id),
          mentor_id INTEGER NOT NULL REFERENCES users(id),
          channel_name VARCHAR(255),
          webrtc_session_id VARCHAR(255),
          status VARCHAR(50) DEFAULT 'pending',
          payment_confirmed BOOLEAN DEFAULT FALSE,
          payment_id VARCHAR(255),
          payment_amount DECIMAL(10,2),
          created_at TIMESTAMP DEFAULT NOW(),
          accepted_at TIMESTAMP,
          started_at TIMESTAMP,
          ended_at TIMESTAMP,
          duration_minutes INTEGER,
          CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'rejected', 'active', 'completed', 'cancelled', 'payment_confirmed'))
        );
        
        -- Add payment columns to existing table if they don't exist
        ALTER TABLE video_calls ADD COLUMN IF NOT EXISTS payment_confirmed BOOLEAN DEFAULT FALSE;
        ALTER TABLE video_calls ADD COLUMN IF NOT EXISTS payment_id VARCHAR(255);
        ALTER TABLE video_calls ADD COLUMN IF NOT EXISTS payment_amount DECIMAL(10,2);
        
        CREATE TABLE IF NOT EXISTS session_feedback (
          id SERIAL PRIMARY KEY,
          session_id INTEGER NOT NULL REFERENCES video_calls(id),
          mentee_id INTEGER NOT NULL REFERENCES users(id),
          mentor_id INTEGER NOT NULL REFERENCES users(id),
          rating INTEGER CHECK (rating >= 1 AND rating <= 5),
          feedback TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE UNIQUE INDEX IF NOT EXISTS idx_session_feedback_unique ON session_feedback(session_id, mentee_id);
        
        CREATE TABLE IF NOT EXISTS mentor_ratings (
          id SERIAL PRIMARY KEY,
          mentor_id INTEGER NOT NULL REFERENCES users(id),
          total_rating DECIMAL(3,2) DEFAULT 0,
          rating_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE UNIQUE INDEX IF NOT EXISTS idx_mentor_ratings_unique ON mentor_ratings(mentor_id);
        
        CREATE TABLE IF NOT EXISTS mentor_upi_details (
          id SERIAL PRIMARY KEY,
          mentor_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          upi_id VARCHAR(255) NOT NULL,
          holder_name VARCHAR(255),
          is_verified BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(mentor_id)
        );
        
        CREATE INDEX IF NOT EXISTS idx_mentor_upi_mentor_id ON mentor_upi_details(mentor_id);
        
        -- Payment system tables
        CREATE TABLE IF NOT EXISTS bookings (
          id SERIAL PRIMARY KEY,
          mentee_id INTEGER NOT NULL REFERENCES users(id),
          mentor_id INTEGER NOT NULL REFERENCES users(id),
          session_fee DECIMAL(10,2) NOT NULL,
          scheduled_time TIMESTAMP,
          payment_status VARCHAR(20) DEFAULT 'pending',
          call_allowed BOOLEAN DEFAULT FALSE,
          status VARCHAR(20) DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT NOW(),
          accepted_at TIMESTAMP,
          CONSTRAINT valid_booking_status CHECK (status IN ('pending', 'accepted', 'rejected', 'completed', 'cancelled'))
        );
        
        CREATE TABLE IF NOT EXISTS payments (
          id SERIAL PRIMARY KEY,
          booking_id INTEGER NOT NULL REFERENCES bookings(id),
          user_id INTEGER NOT NULL REFERENCES users(id),
          mentor_id INTEGER NOT NULL REFERENCES users(id),
          razorpay_order_id VARCHAR(255) UNIQUE,
          razorpay_payment_id VARCHAR(255),
          razorpay_signature VARCHAR(255),
          amount DECIMAL(10,2) NOT NULL,
          mentor_amount DECIMAL(10,2) NOT NULL,
          platform_fee DECIMAL(10,2) NOT NULL,
          status VARCHAR(20) DEFAULT 'created',
          payment_response JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          paid_at TIMESTAMP,
          failed_at TIMESTAMP,
          CONSTRAINT valid_payment_status CHECK (status IN ('created', 'paid', 'failed', 'refunded'))
        );
        
        CREATE TABLE IF NOT EXISTS mentor_payment_details (
          id SERIAL PRIMARY KEY,
          mentor_id INTEGER NOT NULL REFERENCES users(id) UNIQUE,
          upi_id VARCHAR(255) NOT NULL,
          bank_account_number VARCHAR(50),
          ifsc_code VARCHAR(20),
          account_holder_name VARCHAR(255),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS payment_settlements (
          id SERIAL PRIMARY KEY,
          payment_id INTEGER NOT NULL REFERENCES payments(id),
          mentor_id INTEGER NOT NULL REFERENCES users(id),
          amount DECIMAL(10,2) NOT NULL,
          settlement_status VARCHAR(20) DEFAULT 'pending',
          settlement_method VARCHAR(20) DEFAULT 'upi',
          settlement_response JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          settled_at TIMESTAMP,
          CONSTRAINT valid_settlement_status CHECK (settlement_status IN ('pending', 'processing', 'completed', 'failed'))
        );
        
        CREATE TABLE IF NOT EXISTS payment_webhooks (
          id SERIAL PRIMARY KEY,
          event_type VARCHAR(50) NOT NULL,
          razorpay_payment_id VARCHAR(255),
          razorpay_order_id VARCHAR(255),
          payload JSONB NOT NULL,
          processed BOOLEAN DEFAULT FALSE,
          created_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_bookings_mentee ON bookings(mentee_id);
        CREATE INDEX IF NOT EXISTS idx_bookings_mentor ON bookings(mentor_id);
        CREATE INDEX IF NOT EXISTS idx_payments_booking ON payments(booking_id);
        CREATE INDEX IF NOT EXISTS idx_payments_order ON payments(razorpay_order_id);
        CREATE INDEX IF NOT EXISTS idx_settlements_mentor ON payment_settlements(mentor_id);
      `);
      console.log('All database tables created/verified successfully');
    } catch (tableError) {
      console.error('Error creating feedback tables:', tableError);
    }
    
    release();
  }
});

// Mailjet configuration
const mailjet = require('node-mailjet').apiConnect(
  process.env.MAILJET_API_KEY,
  process.env.MAILJET_SECRET_KEY
);

// Clear cache function
const clearCachePattern = (pattern) => {
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key);
    }
  }
};

// In-memory cache for sessions
const cache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

const setCache = (key, data) => {
  cache.set(key, { data, timestamp: Date.now() });
};

const getFromCache = (key) => {
  const item = cache.get(key);
  if (item && Date.now() - item.timestamp < CACHE_TTL) {
    return item.data;
  }
  cache.delete(key);
  return null;
};

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});

// Enhanced CORS configuration for serverless
const corsOptions = {
  origin: [
    'https://www.peerverse.in',
    'https://peerverse.in',
    'https://peerverse-final.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control'
  ],
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// Manual CORS headers as backup
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://www.peerverse.in',
    'https://peerverse.in',
    'https://peerverse-final.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001'
  ];
  
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cache-Control');
  
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  
  next();
});
app.use(express.json({ limit: '10mb' }));
// Handle preflight requests
app.options('*', cors(corsOptions));

app.use('/api/signup', limiter);
app.use('/api/login', limiter);
app.use('/api/forgot-password', limiter);

// Generate OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Send OTP email with retry mechanism
const sendOTPEmail = async (email, otp, purpose, retryCount = 0) => {
  const subject = purpose === 'signup' ? 'PeerVerse - Account Verification' : 
                  purpose === 'login' ? 'PeerVerse - Secure Login Code' : 
                  'PeerVerse - Password Reset';
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>PeerVerse Verification</title>
    </head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; border-radius: 10px; text-align: center; color: white;">
        <h1 style="margin: 0; font-size: 28px;">PeerVerse</h1>
        <p style="margin: 10px 0 0 0; opacity: 0.9;">Your Mentorship Platform</p>
      </div>
      
      <div style="padding: 30px; background: #f8f9fa; border-radius: 10px; margin-top: 20px;">
        <h2 style="color: #333; margin-top: 0;">${purpose === 'signup' ? 'Welcome to PeerVerse!' : purpose === 'login' ? 'Secure Login Request' : 'Password Reset Request'}</h2>
        
        <p style="color: #666; line-height: 1.6;">
          ${purpose === 'signup' ? 'Thank you for joining PeerVerse! To complete your account setup, please use the verification code below:' : 
            purpose === 'login' ? 'We received a login request for your PeerVerse account. Please use the secure code below to continue:' : 
            'You requested to reset your PeerVerse account password. Use the code below to proceed:'}
        </p>
        
        <div style="background: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0; border: 2px dashed #667eea;">
          <p style="margin: 0; color: #999; font-size: 14px;">Your verification code</p>
          <h1 style="margin: 10px 0; color: #667eea; font-size: 32px; letter-spacing: 5px; font-weight: bold;">${otp}</h1>
        </div>
        
        <p style="color: #666; font-size: 14px;">
          <strong>Important:</strong> This code will expire in 10 minutes for your security.
        </p>
        
        <p style="color: #666; font-size: 14px;">
          If you didn't request this code, please ignore this email or contact our support team.
        </p>
      </div>
      
      <div style="text-align: center; margin-top: 30px; color: #999; font-size: 12px;">
        <p>This is an automated message from PeerVerse. Please do not reply to this email.</p>
        <p>© 2024 PeerVerse. All rights reserved.</p>
      </div>
    </body>
    </html>
  `;

  try {
    const request = mailjet.post('send', { version: 'v3.1' }).request({
      Messages: [
        {
          From: {
            Email: process.env.MAILJET_SENDER_EMAIL || 'noreply@peerverse.in',
            Name: 'PeerVerse Security'
          },
          To: [
            {
              Email: email,
              Name: 'PeerVerse User'
            }
          ],
          Subject: subject,
          HTMLPart: html,
          TextPart: `PeerVerse Verification Code: ${otp}. This code expires in 10 minutes. If you didn't request this, please ignore this email.`
        }
      ]
    });
    
    const result = await request;
    console.log('Email sent successfully:', result.body);
    return result;
  } catch (error) {
    console.error('Email sending failed:', error.statusCode, error.message);
    
    // Retry up to 2 times
    if (retryCount < 2) {
      console.log(`Retrying email send (attempt ${retryCount + 1})...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      return sendOTPEmail(email, otp, purpose, retryCount + 1);
    }
    
    throw new Error('Failed to send OTP email after 3 attempts');
  }
};

// Test endpoint with CORS headers
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'PeerSync Backend is running on Railway!',
    timestamp: new Date().toISOString(),
    cors: 'enabled'
  });
});

// CORS test endpoint
app.get('/api/cors-test', (req, res) => {
  res.json({
    message: 'CORS test successful',
    origin: req.headers.origin,
    timestamp: new Date().toISOString()
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', service: 'PeerSync API' });
});

// Check username availability
app.post('/api/check-username', async (req, res) => {
  try {
    const { username } = req.body;
    const result = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    res.json({ available: result.rows.length === 0 });
  } catch (error) {
    console.error('Username check error:', error);
    res.json({ available: true }); // Fallback to available
  }
});

// Signup with OTP
app.post('/api/signup', async (req, res) => {
  try {
    console.log('Signup request received:', req.body);
    const { username, email, phone, password, role } = req.body;

    if (!username || !email || !phone || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND role = $2', 
      [email, role]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists with this email and role' });
    }

    // Check username uniqueness
    const usernameCheck = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (usernameCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate and send OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    
    // Store OTP in database
    await pool.query(
      'INSERT INTO otp_codes (email, otp_code, purpose, expires_at) VALUES ($1, $2, $3, $4)',
      [email, otp, 'signup', expiresAt]
    );
    
    // Send OTP via email
    try {
      await sendOTPEmail(email, otp, 'signup');
      console.log('Signup OTP sent successfully to:', email);
    } catch (emailError) {
      console.error('Failed to send signup OTP:', emailError);
      return res.status(500).json({ error: 'Failed to send verification email. Please try again.' });
    }
    
    // Store temp user data
    const sessionId = 'signup_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    setCache(`signup_session_${sessionId}`, {
      username,
      email,
      phone,
      hashedPassword,
      role
    });
    
    res.json({ 
      sessionId,
      requiresEmailVerification: true
    });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Verify signup OTP
app.post('/api/verify-signup', async (req, res) => {
  try {
    const { sessionId, otp } = req.body;
    
    if (!sessionId || !otp) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Get temp user data from session
    const tempUserData = getFromCache(`signup_session_${sessionId}`);
    if (!tempUserData) {
      return res.status(400).json({ error: 'Invalid or expired session' });
    }
    
    // Verify OTP
    const otpResult = await pool.query(
      'SELECT * FROM otp_codes WHERE email = $1 AND otp_code = $2 AND purpose = $3 AND expires_at > NOW() AND is_used = FALSE',
      [tempUserData.email, otp, 'signup']
    );
    
    if (otpResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }
    
    // Mark OTP as used
    await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE id = $1', [otpResult.rows[0].id]);
    
    const { username, email, phone, hashedPassword, role } = tempUserData;
    
    // Create user in database
    const result = await pool.query(
      'INSERT INTO users (username, email, phone, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING id, username, email, phone, role',
      [username, email, phone, hashedPassword, role]
    );
    
    const user = result.rows[0];
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
    
    // Clear session data
    cache.delete(`signup_session_${sessionId}`);
    
    res.json({ token, user });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Login with OTP
app.post('/api/login', async (req, res) => {
  try {
    console.log('Login request received:', { email: req.body.email, role: req.body.role });
    const { email, password, role } = req.body;
    
    if (!email || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Check if user exists and verify password
    const result = await pool.query(
      'SELECT id, username, email, phone, password_hash, role FROM users WHERE email = $1 AND role = $2',
      [email, role]
    );
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    
    if (!user.password_hash) {
      return res.status(400).json({ error: 'Account setup incomplete. Please contact support.' });
    }
    
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    
    if (!isValidPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    // Generate and send OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    
    // Store OTP in database
    await pool.query(
      'INSERT INTO otp_codes (email, otp_code, purpose, expires_at) VALUES ($1, $2, $3, $4)',
      [user.email, otp, 'login', expiresAt]
    );
    
    // Send OTP via email
    try {
      await sendOTPEmail(user.email, otp, 'login');
      console.log('Login OTP sent successfully to:', user.email);
    } catch (emailError) {
      console.error('Failed to send login OTP:', emailError);
      return res.status(500).json({ error: 'Failed to send verification email. Please try again.' });
    }
    
    // Store user data for verification step
    const sessionId = 'login_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    setCache(`login_session_${sessionId}`, {
      userId: user.id,
      username: user.username,
      email: user.email,
      phone: user.phone,
      role: user.role
    });
    
    res.json({ 
      sessionId,
      userId: user.id,
      requiresEmailVerification: true
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Verify login OTP
app.post('/api/verify-email-otp-login', async (req, res) => {
  try {
    const { sessionId, otp } = req.body;
    
    if (!sessionId || !otp) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Get user data from session
    const userData = getFromCache(`login_session_${sessionId}`);
    if (!userData) {
      return res.status(400).json({ error: 'Invalid or expired session' });
    }
    
    // Verify OTP
    const otpResult = await pool.query(
      'SELECT * FROM otp_codes WHERE email = $1 AND otp_code = $2 AND purpose = $3 AND expires_at > NOW() AND is_used = FALSE',
      [userData.email, otp, 'login']
    );
    
    if (otpResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }
    
    // Mark OTP as used
    await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE id = $1', [otpResult.rows[0].id]);
    
    // Create JWT token
    const token = jwt.sign({ userId: userData.userId, role: userData.role }, JWT_SECRET, { expiresIn: '7d' });
    
    // Clear session data
    cache.delete(`login_session_${sessionId}`);
    
    const user = {
      id: userData.userId,
      username: userData.username,
      email: userData.email,
      phone: userData.phone,
      role: userData.role
    };
    
    res.json({ token, user });
  } catch (error) {
    console.error('Email OTP verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Forgot password
app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    const user = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (user.rows.length === 0) {
      return res.status(400).json({ error: 'Email not found' });
    }

    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      'INSERT INTO otp_codes (email, otp_code, purpose, expires_at) VALUES ($1, $2, $3, $4)',
      [email, otp, 'reset', expiresAt]
    );

    try {
      await sendOTPEmail(email, otp, 'reset');
      console.log('Reset OTP sent successfully to:', email);
    } catch (emailError) {
      console.error('Failed to send reset OTP:', emailError);
      return res.status(500).json({ error: 'Failed to send reset email. Please try again.' });
    }

    res.json({ message: 'Password reset OTP sent to email' });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset password
app.post('/api/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const otpResult = await pool.query(
      'SELECT * FROM otp_codes WHERE email = $1 AND otp_code = $2 AND purpose = $3 AND expires_at > NOW() AND is_used = FALSE',
      [email, otp, 'reset']
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);

    await pool.query('UPDATE users SET password_hash = $1 WHERE email = $2', [hashedPassword, email]);
    await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE id = $1', [otpResult.rows[0].id]);

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Basic endpoints
app.get('/api/mentors', (req, res) => {
  res.json({ mentors: [] });
});

// WebRTC endpoints
app.get('/api/webrtc/status/:userId', (req, res) => {
  res.json({
    connected: true,
    technology: 'WebRTC',
    features: ['HD Video', 'Audio', 'Screen Share', 'Chat'],
    maxDuration: 10,
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      {
        urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ]
  });
});

app.post('/api/webrtc/session/create', (req, res) => {
  const { callId } = req.body;
  res.json({
    sessionId: callId,
    message: 'WebRTC session created',
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      {
        urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
        username: 'openrelayproject',
        credential: 'openrelayproject'
      }
    ]
  });
});

// Video call endpoints
app.get('/api/video-call/:callId/status', (req, res) => {
  res.json({ 
    call: { 
      id: req.params.callId, 
      status: 'pending', 
      started_at: null 
    } 
  });
});

app.post('/api/video-call/:callId/start', (req, res) => {
  res.json({ 
    message: 'Call started', 
    startTime: new Date().toISOString() 
  });
});

app.post('/api/video-call/:callId/end', (req, res) => {
  res.json({ message: 'Call ended' });
});

// Payment success endpoint
app.post('/api/video-call/:callId/payment-success', async (req, res) => {
  try {
    const { callId } = req.params;
    const { razorpay_payment_id, razorpay_order_id, amount } = req.body;
    
    // Update call status to payment confirmed
    await pool.query(
      'UPDATE video_calls SET status = $1, payment_confirmed = TRUE, payment_id = $2, payment_amount = $3 WHERE id = $4',
      ['payment_confirmed', razorpay_payment_id, amount, callId]
    );
    
    res.json({ success: true, message: 'Payment confirmed' });
  } catch (error) {
    console.error('Payment confirmation error:', error);
    res.status(500).json({ error: 'Failed to confirm payment' });
  }
});

// Check payment status
app.get('/api/video-call/:callId/payment-status', async (req, res) => {
  try {
    const { callId } = req.params;
    
    const result = await pool.query(
      'SELECT status, payment_confirmed, payment_amount FROM video_calls WHERE id = $1',
      [callId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    const call = result.rows[0];
    res.json({
      status: call.status,
      paymentConfirmed: call.payment_confirmed || false,
      paymentAmount: call.payment_amount || 0,
      canJoin: call.payment_confirmed === true
    });
  } catch (error) {
    console.error('Payment status check error:', error);
    res.status(500).json({ error: 'Failed to check payment status' });
  }
});

// Get mentor feedback
app.get('/api/mentor/:mentorId/feedback', async (req, res) => {
  try {
    const { mentorId } = req.params;
    const result = await pool.query(`
      SELECT sf.rating, sf.feedback, sf.created_at, sf.session_id,
             u.username as mentee_name
      FROM session_feedback sf
      JOIN users u ON sf.mentee_id = u.id
      WHERE sf.mentor_id = $1
      ORDER BY sf.created_at DESC
      LIMIT 50
    `, [mentorId]);
    
    const ratingResult = await pool.query(
      'SELECT total_rating, rating_count FROM mentor_ratings WHERE mentor_id = $1',
      [mentorId]
    );
    
    const overallRating = ratingResult.rows.length > 0 ? {
      rating: parseFloat(ratingResult.rows[0].total_rating) || 0,
      count: parseInt(ratingResult.rows[0].rating_count) || 0
    } : { rating: 0, count: 0 };
    
    res.json({ 
      feedback: result.rows,
      overallRating
    });
  } catch (error) {
    console.error('Get mentor feedback error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get mentor profile
app.get('/api/mentor/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(
      'SELECT name, profile_picture, bio FROM mentor_profiles WHERE user_id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.json({ profile: null });
    }
    
    const profile = {
      basicInfo: {
        name: result.rows[0].name || '',
        profilePicture: result.rows[0].profile_picture || '',
        bio: result.rows[0].bio || ''
      }
    };
    
    res.json({ profile });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get mentor stats
app.get('/api/mentor/stats/:mentorId', async (req, res) => {
  try {
    const { mentorId } = req.params;
    const sessionsResult = await pool.query('SELECT COUNT(*) as total FROM video_calls WHERE mentor_id = $1', [mentorId]);
    const sessions = sessionsResult.rows[0];
    
    res.json({
      totalSessions: parseInt(sessions.total) || 0,
      completedSessions: 0,
      pendingSessions: 0,
      totalBlogs: 0,
      walletBalance: 0,
      profileCompletion: 50
    });
  } catch (error) {
    console.error('Get mentor stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get mentor UPI details
app.get('/api/mentor/:mentorId/upi', async (req, res) => {
  try {
    const { mentorId } = req.params;
    const result = await pool.query(
      'SELECT upi_id, holder_name, is_verified FROM mentor_upi_details WHERE mentor_id = $1',
      [mentorId]
    );
    
    if (result.rows.length > 0) {
      res.json({ upiDetails: result.rows[0] });
    } else {
      res.json({ upiDetails: null });
    }
  } catch (error) {
    console.error('Get UPI details error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Save/Update mentor UPI details
app.post('/api/mentor/:mentorId/upi', async (req, res) => {
  try {
    const { mentorId } = req.params;
    const { upi_id, holder_name } = req.body;
    
    if (!upi_id || !upi_id.trim()) {
      return res.status(400).json({ error: 'UPI ID is required' });
    }
    
    const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
    if (!upiRegex.test(upi_id.trim())) {
      return res.status(400).json({ error: 'Invalid UPI ID format' });
    }
    
    const existing = await pool.query(
      'SELECT id FROM mentor_upi_details WHERE mentor_id = $1',
      [mentorId]
    );
    
    if (existing.rows.length > 0) {
      await pool.query(
        'UPDATE mentor_upi_details SET upi_id = $1, holder_name = $2, updated_at = CURRENT_TIMESTAMP WHERE mentor_id = $3',
        [upi_id.trim(), holder_name?.trim() || null, mentorId]
      );
    } else {
      await pool.query(
        'INSERT INTO mentor_upi_details (mentor_id, upi_id, holder_name) VALUES ($1, $2, $3)',
        [mentorId, upi_id.trim(), holder_name?.trim() || null]
      );
    }
    
    res.json({ message: 'UPI details saved successfully' });
  } catch (error) {
    console.error('Save UPI details error:', error);
    if (error.code === '23505') {
      res.status(400).json({ error: 'UPI details already exist for this mentor' });
    } else {
      res.status(500).json({ error: 'Server error' });
    }
  }
});

// Delete mentor UPI details
app.delete('/api/mentor/:mentorId/upi', async (req, res) => {
  try {
    const { mentorId } = req.params;
    await pool.query(
      'DELETE FROM mentor_upi_details WHERE mentor_id = $1',
      [mentorId]
    );
    res.json({ message: 'UPI details deleted successfully' });
  } catch (error) {
    console.error('Delete UPI details error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get notifications
app.get('/api/notifications/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    res.json({ notifications: [] });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get video calls
app.get('/api/video-calls/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(`
      SELECT vc.id, vc.status, vc.created_at, vc.accepted_at, vc.started_at, vc.ended_at, vc.channel_name
      FROM video_calls vc
      WHERE vc.mentee_id = $1 OR vc.mentor_id = $1
      ORDER BY vc.created_at DESC
      LIMIT 15
    `, [userId]);
    
    res.json({ calls: result.rows });
  } catch (error) {
    console.error('Get user calls error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Create payment order
app.post('/api/bookings/:id/create-payment', async (req, res) => {
  try {
    const { id: bookingId } = req.params;
    const { userId, mentorId, amount } = req.body;
    
    if (!userId || !mentorId || !amount) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const mentorAmount = (amount * 0.70).toFixed(2);
    const platformFee = (amount * 0.30).toFixed(2);
    
    // Create Razorpay order
    const options = {
      amount: Math.round(amount * 100), // Convert to paise
      currency: 'INR',
      receipt: `booking_${bookingId}_${Date.now()}`
    };
    
    const order = await razorpay.orders.create(options);
    
    // Store payment record
    await pool.query(`
      INSERT INTO payments (booking_id, user_id, mentor_id, razorpay_order_id, amount, mentor_amount, platform_fee, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, 'created')
    `, [bookingId, userId, mentorId, order.id, amount, mentorAmount, platformFee]);
    
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error('Create payment error:', error);
    res.status(500).json({ error: 'Failed to create payment order' });
  }
});

// Verify payment
app.post('/api/payments/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');
    
    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }
    
    // Update payment status
    await pool.query(`
      UPDATE payments 
      SET razorpay_payment_id = $1, razorpay_signature = $2, status = 'paid', paid_at = NOW()
      WHERE razorpay_order_id = $3
    `, [razorpay_payment_id, razorpay_signature, razorpay_order_id]);
    
    // Enable call access
    const paymentResult = await pool.query(
      'SELECT booking_id FROM payments WHERE razorpay_order_id = $1',
      [razorpay_order_id]
    );
    
    if (paymentResult.rows.length > 0) {
      await pool.query(
        'UPDATE bookings SET payment_status = $1, call_allowed = TRUE WHERE id = $2',
        ['paid', paymentResult.rows[0].booking_id]
      );
    }
    
    res.json({ success: true, message: 'Payment verified successfully' });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// Check payment status
app.get('/api/bookings/:id/payment-status', async (req, res) => {
  try {
    const { id: bookingId } = req.params;
    
    const result = await pool.query(`
      SELECT p.status, p.amount, b.call_allowed
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      WHERE p.booking_id = $1
      ORDER BY p.created_at DESC
      LIMIT 1
    `, [bookingId]);
    
    if (result.rows.length === 0) {
      return res.json({ paymentStatus: 'pending', callAllowed: false });
    }
    
    const payment = result.rows[0];
    res.json({
      paymentStatus: payment.status,
      callAllowed: payment.call_allowed,
      amount: payment.amount
    });
  } catch (error) {
    console.error('Payment status check error:', error);
    res.status(500).json({ error: 'Failed to check payment status' });
  }
});

// Razorpay webhook
app.post('/api/webhooks/razorpay', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const body = req.body;
    
    // Verify webhook signature
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(body)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }
    
    const event = JSON.parse(body);
    
    // Log webhook
    await pool.query(`
      INSERT INTO payment_webhooks (event_type, razorpay_payment_id, razorpay_order_id, payload)
      VALUES ($1, $2, $3, $4)
    `, [
      event.event,
      event.payload?.payment?.entity?.id || event.payload?.order?.entity?.id,
      event.payload?.payment?.entity?.order_id || event.payload?.order?.entity?.id,
      event
    ]);
    
    // Handle webhook events
    switch (event.event) {
      case 'payment.captured':
        const orderId = event.payload.payment.entity.order_id;
        await pool.query(`
          UPDATE payments 
          SET status = 'paid', paid_at = NOW(), payment_response = $1
          WHERE razorpay_order_id = $2
        `, [event.payload, orderId]);
        
        const paymentResult = await pool.query(
          'SELECT booking_id FROM payments WHERE razorpay_order_id = $1',
          [orderId]
        );
        
        if (paymentResult.rows.length > 0) {
          await pool.query(
            'UPDATE bookings SET payment_status = $1, call_allowed = TRUE WHERE id = $2',
            ['paid', paymentResult.rows[0].booking_id]
          );
          
          // Initiate automatic payout to mentor
          const paymentDetails = await pool.query(
            'SELECT p.mentor_amount, p.mentor_id, mpd.upi_id FROM payments p JOIN mentor_payment_details mpd ON p.mentor_id = mpd.mentor_id WHERE p.razorpay_order_id = $1',
            [orderId]
          );
          
          if (paymentDetails.rows.length > 0) {
            const { mentor_amount, mentor_id, upi_id } = paymentDetails.rows[0];
            
            // Create settlement record
            await pool.query(`
              INSERT INTO payment_settlements (payment_id, mentor_id, amount, settlement_status, settlement_method)
              SELECT id, $1, $2, 'pending', 'upi' FROM payments WHERE razorpay_order_id = $3
            `, [mentor_id, mentor_amount, orderId]);
            
            console.log(`Payout scheduled: ₹${mentor_amount} to UPI ${upi_id} for mentor ${mentor_id}`);
          }
        }
        break;
        
      case 'payment.failed':
        await pool.query(`
          UPDATE payments 
          SET status = 'failed', failed_at = NOW(), payment_response = $1
          WHERE razorpay_order_id = $2
        `, [event.payload, event.payload.payment.entity.order_id]);
        break;
        
      case 'order.paid':
        await pool.query(`
          UPDATE payments 
          SET status = 'paid', paid_at = NOW(), payment_response = $1
          WHERE razorpay_order_id = $2
        `, [event.payload, event.payload.order.entity.id]);
        break;
        
      case 'refund.created':
      case 'refund.processed':
      case 'refund.failed':
        await pool.query(`
          UPDATE payments 
          SET status = 'refunded', payment_response = $1
          WHERE razorpay_payment_id = $2
        `, [event.payload, event.payload.refund.entity.payment_id]);
        break;
        
      case 'payment_link.paid':
      case 'payment_link.expired':
        // Handle payment link events if needed
        break;
    }
    
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Save mentor payment details
app.post('/api/mentors/payment-details', async (req, res) => {
  try {
    const { mentorId, upiId, bankAccount, ifscCode, accountHolder } = req.body;
    
    if (!mentorId || !upiId) {
      return res.status(400).json({ error: 'Mentor ID and UPI ID are required' });
    }
    
    await pool.query(`
      INSERT INTO mentor_payment_details (mentor_id, upi_id, bank_account_number, ifsc_code, account_holder_name)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (mentor_id) DO UPDATE SET
        upi_id = $2, bank_account_number = $3, ifsc_code = $4, account_holder_name = $5, updated_at = NOW()
    `, [mentorId, upiId, bankAccount, ifscCode, accountHolder]);
    
    res.json({ message: 'Payment details saved successfully' });
  } catch (error) {
    console.error('Save payment details error:', error);
    res.status(500).json({ error: 'Failed to save payment details' });
  }
});

// Submit session feedback and update mentor rating
app.post('/api/session-feedback', validateBody(schemas.sessionFeedbackSchema), async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      console.warn('API session-feedback received empty body');
      return res.status(400).json({ error: 'Request body is required' });
    }
    const { sessionId, menteeId, mentorId, rating, feedback } = req.body;
    
    if (!sessionId || !menteeId || !rating) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Get mentor ID from session if not provided
    let finalMentorId = mentorId;
    if (!finalMentorId) {
      const sessionResult = await pool.query(
        'SELECT mentor_id FROM video_calls WHERE id = $1',
        [sessionId]
      );
      if (sessionResult.rows.length > 0) {
        finalMentorId = sessionResult.rows[0].mentor_id;
      } else {
        return res.status(404).json({ error: 'Session not found' });
      }
    }
    
    // Check if feedback already exists
    const existingFeedback = await pool.query(
      'SELECT id FROM session_feedback WHERE session_id = $1 AND mentee_id = $2',
      [sessionId, menteeId]
    );
    
    if (existingFeedback.rows.length > 0) {
      // Update existing feedback
      await pool.query(
        'UPDATE session_feedback SET rating = $1, feedback = $2, created_at = NOW() WHERE session_id = $3 AND mentee_id = $4',
        [rating, feedback || '', sessionId, menteeId]
      );
    } else {
      // Insert new feedback
      await pool.query(
        'INSERT INTO session_feedback (session_id, mentee_id, mentor_id, rating, feedback) VALUES ($1, $2, $3, $4, $5)',
        [sessionId, menteeId, finalMentorId, rating, feedback || '']
      );
      
      // Update mentor rating only for new feedback
      const existingRating = await pool.query(
        'SELECT total_rating, rating_count FROM mentor_ratings WHERE mentor_id = $1',
        [finalMentorId]
      );
      
      if (existingRating.rows.length > 0) {
        const current = existingRating.rows[0];
        const newCount = current.rating_count + 1;
        const newTotal = ((current.total_rating * current.rating_count) + rating) / newCount;
        
        await pool.query(
          'UPDATE mentor_ratings SET total_rating = $1, rating_count = $2, updated_at = NOW() WHERE mentor_id = $3',
          [newTotal, newCount, finalMentorId]
        );
      } else {
        await pool.query(
          'INSERT INTO mentor_ratings (mentor_id, total_rating, rating_count) VALUES ($1, $2, $3)',
          [finalMentorId, rating, 1]
        );
      }
    }
    
    res.json({ message: 'Feedback submitted successfully' });
  } catch (error) {
    // Enhanced logging for debugging
    console.error('Submit feedback error:', {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      stack: error?.stack
    });
    res.status(500).json({ error: 'Server error: ' + (error?.message || '') });
  }
});

// Catch all
// Payout endpoints
const { processPendingPayouts, getPayoutHistory } = require('./payouts');
app.post('/api/admin/process-payouts', processPendingPayouts);
app.get('/api/mentor/:mentorId/payouts', getPayoutHistory);

// Create booking (request-then-pay flow)
app.post('/api/bookings', async (req, res) => {
  try {
    const { menteeId, mentorId, sessionFee, scheduledTime } = req.body;
    
    if (!menteeId || !mentorId || !sessionFee) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    const result = await pool.query(`
      INSERT INTO bookings (mentee_id, mentor_id, session_fee, scheduled_time, payment_status, call_allowed, status)
      VALUES ($1, $2, $3, $4, 'pending', FALSE, 'pending')
      RETURNING id
    `, [menteeId, mentorId, sessionFee, scheduledTime]);
    
    res.json({ bookingId: result.rows[0].id, status: 'pending', requiresPayment: false });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// Mentor accepts booking
app.post('/api/bookings/:id/accept', async (req, res) => {
  try {
    const { id: bookingId } = req.params;
    const { mentorId } = req.body;
    
    await pool.query(`
      UPDATE bookings 
      SET status = 'accepted', accepted_at = NOW()
      WHERE id = $1 AND mentor_id = $2
    `, [bookingId, mentorId]);
    
    res.json({ message: 'Booking accepted, waiting for payment' });
  } catch (error) {
    console.error('Accept booking error:', error);
    res.status(500).json({ error: 'Failed to accept booking' });
  }
});

// Get mentor booking requests
app.get('/api/mentor/:mentorId/booking-requests', async (req, res) => {
  try {
    const { mentorId } = req.params;
    
    const result = await pool.query(`
      SELECT b.*, u.username as mentee_name
      FROM bookings b
      JOIN users u ON b.mentee_id = u.id
      WHERE b.mentor_id = $1 AND b.status IN ('pending', 'accepted')
      ORDER BY b.created_at DESC
    `, [mentorId]);
    
    res.json({ requests: result.rows });
  } catch (error) {
    console.error('Get booking requests error:', error);
    res.status(500).json({ error: 'Failed to get booking requests' });
  }
});

// Get booking status
app.get('/api/bookings/:id/status', async (req, res) => {
  try {
    const { id: bookingId } = req.params;
    
    const result = await pool.query(`
      SELECT b.*, p.status as payment_status
      FROM bookings b
      LEFT JOIN payments p ON b.id = p.booking_id
      WHERE b.id = $1
    `, [bookingId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    const booking = result.rows[0];
    res.json({
      bookingId: booking.id,
      status: booking.status,
      paymentStatus: booking.payment_status || 'pending',
      callAllowed: booking.call_allowed,
      requiresPayment: booking.status === 'accepted' && !booking.call_allowed
    });
  } catch (error) {
    console.error('Get booking status error:', error);
    res.status(500).json({ error: 'Failed to get booking status' });
  }
});

app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

module.exports = app;