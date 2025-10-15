const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
// Email OTP authentication system using Mailjet
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const http = require('http');
const { Server } = require('socket.io');
const Razorpay = require('razorpay');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1); // Trust Railway proxy
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: ['https://peerverse-final.vercel.app', 'https://peerverse.in', 'https://www.peerverse.in', 'http://localhost:3000', 'http://localhost:3001'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling'],
  allowEIO3: true
});
const PORT = process.env.PORT || 3000;

// Cloudflare WebRTC Configuration
const CLOUDFLARE_APP_ID = 'ccb11479d57e58d6450a4743bad9a1e8';
const CLOUDFLARE_API_TOKEN = '75063d2f78527ff8115025d127e87619d62c4428ed6ff1b001fc3cf03d0ba514';
const TURN_KEY_ID = CLOUDFLARE_APP_ID;

// CORS configuration - placed early so it applies to all routes
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
// Preflight handler for all routes
app.options('*', cors(corsOptions));

// Manual CORS fallback (keeps behavior if cors middleware ever misses a case)
app.use((req, res, next) => {
  const allowedOrigins = [
    'https://www.peerverse.in',
    'https://peerverse.in',
    'https://peerverse-final.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001'
  ];
  const origin = req.headers.origin;

  if (origin && (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app'))) {
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

// Body parsing middleware: ensure this runs before any route handlers so req.body is defined
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Helper to provide allowed origins list to handlers that set headers manually
const getAllowedOrigins = () => [
  'https://www.peerverse.in',
  'https://peerverse.in',
  'https://peerverse-final.vercel.app',
  'http://localhost:3000',
  'http://localhost:3001'
];

// Optimized in-memory cache
const cache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes for faster updates
const LONG_CACHE_TTL = 30 * 60 * 1000; // 30 minutes for static data

const getFromCache = (key, ttl = CACHE_TTL) => {
  const item = cache.get(key);
  if (item && Date.now() - item.timestamp < ttl) {
    return item.data;
  }
  cache.delete(key);
  return null;
};

const setCache = (key, data, ttl = CACHE_TTL) => {
  cache.set(key, { data, timestamp: Date.now(), ttl });
};

const getLongCache = (key) => getFromCache(key, LONG_CACHE_TTL);
const setLongCache = (key, data) => setCache(key, data, LONG_CACHE_TTL);

const clearCachePattern = (pattern) => {
  for (const key of cache.keys()) {
    if (key.includes(pattern)) {
      cache.delete(key);
    }
  }
};

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const mailjet = require('node-mailjet').apiConnect(
  process.env.MAILJET_API_KEY,
  process.env.MAILJET_SECRET_KEY
);

// Razorpay configuration with fallback handling
let razorpay;
try {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  
  // Handle Railway environment variable boolean issue
  const actualKeyId = keyId === 'true' || keyId === true ? 'rzp_test_RQcLsZjjR737Hz' : keyId;
  const actualKeySecret = keySecret === 'true' || keySecret === true ? 'IPR4mpexvQsMQWwtF1x' : keySecret;
  
  console.log('Razorpay initialization:', {
    originalKeyId: keyId,
    originalKeySecret: keySecret,
    actualKeyId: actualKeyId?.substring(0, 8),
    actualKeySecretLength: actualKeySecret?.length
  });
  
  razorpay = new Razorpay({
    key_id: actualKeyId,
    key_secret: actualKeySecret
  });
  
  console.log('Razorpay initialized successfully');
} catch (error) {
  console.error('Razorpay initialization failed:', error);
}

// Validation middleware (Joi)
const { validateBody, schemas } = require('./middleware/validate');

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
            Email: process.env.MAILJET_SENDER_EMAIL,
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
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      return sendOTPEmail(email, otp, purpose, retryCount + 1);
    }
    
    throw new Error('Failed to send OTP email after 3 attempts');
  }
};

// Test database connection and create tables
pool.connect(async (err, client, release) => {
  if (err) {
    console.error('Database connection error:', err.stack);
  } else {
    console.log('Database connected successfully');
    
    // Create video_calls and zoom_tokens tables
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
          created_at TIMESTAMP DEFAULT NOW(),
          accepted_at TIMESTAMP,
          started_at TIMESTAMP,
          ended_at TIMESTAMP,
          duration_minutes INTEGER,
          payment_confirmed BOOLEAN DEFAULT FALSE,
          payment_id VARCHAR(255),
          payment_amount DECIMAL(10,2) DEFAULT 0,
          CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'rejected', 'active', 'completed', 'cancelled'))
        );
        
        -- Add payment columns if they don't exist
        ALTER TABLE video_calls ADD COLUMN IF NOT EXISTS payment_confirmed BOOLEAN DEFAULT FALSE;
        ALTER TABLE video_calls ADD COLUMN IF NOT EXISTS payment_id VARCHAR(255);
        ALTER TABLE video_calls ADD COLUMN IF NOT EXISTS payment_amount DECIMAL(10,2) DEFAULT 0;
        
        -- Make channel_name nullable for bookings
        DO $$ 
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'video_calls' AND column_name = 'channel_name' AND is_nullable = 'NO') THEN
            ALTER TABLE video_calls ALTER COLUMN channel_name DROP NOT NULL;
          END IF;
        END $$;
        
        CREATE TABLE IF NOT EXISTS webrtc_sessions (
          id SERIAL PRIMARY KEY,
          call_id INTEGER NOT NULL REFERENCES video_calls(id),
          offer_data JSONB,
          answer_data JSONB,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS mentee_profiles (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) UNIQUE,
          name VARCHAR(255),
          profile_picture TEXT,
          bio TEXT,
          interests JSONB DEFAULT '[]',
          skills JSONB DEFAULT '[]',
          education JSONB DEFAULT '[]',
          goals TEXT,
          location VARCHAR(255),
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS mentor_earnings (
          id SERIAL PRIMARY KEY,
          mentor_id INTEGER NOT NULL REFERENCES users(id),
          session_id INTEGER REFERENCES video_calls(id),
          amount DECIMAL(10,2) NOT NULL DEFAULT 0,
          type VARCHAR(50) DEFAULT 'session', -- session, bonus, tip
          created_at TIMESTAMP DEFAULT NOW()
        );
        
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
        
        CREATE TABLE IF NOT EXISTS mentor_feedback (
          id SERIAL PRIMARY KEY,
          mentor_id INTEGER NOT NULL REFERENCES users(id),
          mentee_id INTEGER NOT NULL REFERENCES users(id),
          session_id INTEGER REFERENCES video_calls(id),
          overall_rating INTEGER CHECK (overall_rating >= 1 AND overall_rating <= 5),
          communication_rating INTEGER CHECK (communication_rating >= 1 AND communication_rating <= 5),
          knowledge_rating INTEGER CHECK (knowledge_rating >= 1 AND knowledge_rating <= 5),
          helpfulness_rating INTEGER CHECK (helpfulness_rating >= 1 AND helpfulness_rating <= 5),
          feedback_text TEXT,
          would_recommend BOOLEAN DEFAULT true,
          tags JSONB DEFAULT '[]',
          is_anonymous BOOLEAN DEFAULT false,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS mentor_ratings (
          id SERIAL PRIMARY KEY,
          mentor_id INTEGER NOT NULL REFERENCES users(id),
          total_rating DECIMAL(3,2) DEFAULT 0,
          rating_count INTEGER DEFAULT 0,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS blog_views (
          id SERIAL PRIMARY KEY,
          blog_id INTEGER NOT NULL REFERENCES blogs(id),
          user_id INTEGER REFERENCES users(id),
          ip_address INET,
          created_at TIMESTAMP DEFAULT NOW()
        );
        

        
        CREATE TABLE IF NOT EXISTS notifications (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id),
          type VARCHAR(50) NOT NULL,
          title VARCHAR(255) NOT NULL,
          message TEXT NOT NULL,
          is_read BOOLEAN DEFAULT FALSE,
          related_id INTEGER,
          related_type VARCHAR(50),
          created_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS mentee_favorites (
          id SERIAL PRIMARY KEY,
          mentee_id INTEGER NOT NULL REFERENCES users(id),
          mentor_id INTEGER NOT NULL REFERENCES users(id),
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(mentee_id, mentor_id)
        );
        
        CREATE TABLE IF NOT EXISTS mentor_profiles (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id) UNIQUE,
          name VARCHAR(255),
          profile_picture TEXT,
          bio TEXT,
          education JSONB DEFAULT '[]',
          skills JSONB DEFAULT '[]',
          background JSONB DEFAULT '[]',
          interests JSONB DEFAULT '[]',
          languages JSONB DEFAULT '[]',
          availability JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS blogs (
          id SERIAL PRIMARY KEY,
          mentor_id INTEGER NOT NULL REFERENCES users(id),
          title VARCHAR(255) NOT NULL,
          description TEXT,
          content TEXT NOT NULL,
          category VARCHAR(100),
          tags JSONB DEFAULT '[]',
          images JSONB DEFAULT '[]',
          likes_count INTEGER DEFAULT 0,
          comments_count INTEGER DEFAULT 0,
          is_published BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS blog_likes (
          id SERIAL PRIMARY KEY,
          blog_id INTEGER NOT NULL REFERENCES blogs(id),
          mentee_id INTEGER NOT NULL REFERENCES users(id),
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(blog_id, mentee_id)
        );
        
        CREATE TABLE IF NOT EXISTS blog_comments (
          id SERIAL PRIMARY KEY,
          blog_id INTEGER NOT NULL REFERENCES blogs(id),
          user_id INTEGER NOT NULL REFERENCES users(id),
          content TEXT NOT NULL,
          parent_comment_id INTEGER REFERENCES blog_comments(id),
          created_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS communities (
          id SERIAL PRIMARY KEY,
          mentor_id INTEGER NOT NULL REFERENCES users(id),
          name VARCHAR(255) NOT NULL,
          description TEXT,
          interest_category VARCHAR(100),
          member_count INTEGER DEFAULT 0,
          is_active BOOLEAN DEFAULT TRUE,
          created_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS community_members (
          id SERIAL PRIMARY KEY,
          community_id INTEGER NOT NULL REFERENCES communities(id),
          mentee_id INTEGER NOT NULL REFERENCES users(id),
          joined_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(community_id, mentee_id)
        );
        
        CREATE TABLE IF NOT EXISTS community_posts (
          id SERIAL PRIMARY KEY,
          community_id INTEGER NOT NULL REFERENCES communities(id),
          mentor_id INTEGER NOT NULL REFERENCES users(id),
          content TEXT,
          file_url TEXT,
          file_name VARCHAR(255),
          file_type VARCHAR(50),
          file_size BIGINT,
          post_type VARCHAR(20) DEFAULT 'text',
          created_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE TABLE IF NOT EXISTS community_post_reactions (
          id SERIAL PRIMARY KEY,
          post_id INTEGER NOT NULL REFERENCES community_posts(id),
          user_id INTEGER NOT NULL REFERENCES users(id),
          reaction_type VARCHAR(20) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          UNIQUE(post_id, user_id)
        );
        
        CREATE INDEX IF NOT EXISTS idx_video_calls_mentor_id ON video_calls(mentor_id);
        CREATE INDEX IF NOT EXISTS idx_video_calls_mentee_id ON video_calls(mentee_id);
        CREATE INDEX IF NOT EXISTS idx_video_calls_status ON video_calls(status);
        CREATE INDEX IF NOT EXISTS idx_webrtc_sessions_call_id ON webrtc_sessions(call_id);
        CREATE INDEX IF NOT EXISTS idx_mentee_profiles_user_id ON mentee_profiles(user_id);
        CREATE INDEX IF NOT EXISTS idx_mentor_earnings_mentor_id ON mentor_earnings(mentor_id);
        CREATE INDEX IF NOT EXISTS idx_session_feedback_session_id ON session_feedback(session_id);
        CREATE INDEX IF NOT EXISTS idx_mentor_feedback_mentor_id ON mentor_feedback(mentor_id);
        CREATE INDEX IF NOT EXISTS idx_mentor_feedback_mentee_id ON mentor_feedback(mentee_id);
        CREATE INDEX IF NOT EXISTS idx_mentor_feedback_session_id ON mentor_feedback(session_id);
        CREATE INDEX IF NOT EXISTS idx_mentor_ratings_mentor_id ON mentor_ratings(mentor_id);
        CREATE INDEX IF NOT EXISTS idx_blog_views_blog_id ON blog_views(blog_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_mentor_ratings_unique ON mentor_ratings(mentor_id);
      `);
      console.log('Video calls and WebRTC tables created/verified successfully');
    } catch (tableError) {
      console.error('Error creating video_calls table:', tableError);
    }
    
    release();
  }
});

// Get recommended mentors based on mentee interests
app.get('/api/mentors/recommended/:menteeId', async (req, res) => {
  try {
    const { menteeId } = req.params;
    
    // Get mentee interests
    const menteeProfile = await pool.query(
      'SELECT interests FROM mentee_profiles WHERE user_id = $1',
      [menteeId]
    );
    
    let menteeInterests = [];
    if (menteeProfile.rows.length > 0 && menteeProfile.rows[0].interests) {
      menteeInterests = menteeProfile.rows[0].interests;
    }
    
    // Get mentors with matching interests
    const result = await pool.query(`
      SELECT mp.user_id, mp.name, mp.bio, mp.profile_picture, mp.skills, mp.interests, 
             u.username, COALESCE(mr.total_rating, 0) as rating, COALESCE(mr.rating_count, 0) as review_count
      FROM mentor_profiles mp 
      JOIN users u ON mp.user_id = u.id 
      LEFT JOIN mentor_ratings mr ON mp.user_id = mr.mentor_id
      WHERE u.role = 'mentor' AND mp.name IS NOT NULL AND mp.name != ''
      ORDER BY mr.total_rating DESC NULLS LAST
      LIMIT 50
    `);
    
    const mentors = result.rows.map(mentor => {
      let mentorInterests = [];
      try {
        const interestsData = mentor.interests ? (typeof mentor.interests === 'string' ? JSON.parse(mentor.interests) : mentor.interests) : [];
        if (Array.isArray(interestsData)) {
          mentorInterests = interestsData;
        } else if (interestsData.interests) {
          mentorInterests = interestsData.interests;
        }
      } catch (e) { mentorInterests = []; }
      
      // Calculate match score
      const commonInterests = mentorInterests.filter(interest => 
        menteeInterests.includes(interest)
      ).length;
      const matchScore = menteeInterests.length > 0 ? (commonInterests / menteeInterests.length) * 100 : 0;
      
      return {
        id: mentor.user_id,
        name: mentor.name || mentor.username,
        bio: mentor.bio || 'Experienced mentor ready to help you grow.',
        profilePicture: mentor.profile_picture,
        skills: mentor.skills || [],
        interests: mentorInterests,
        rating: parseFloat(mentor.rating) || 0,
        reviewCount: parseInt(mentor.review_count) || 0,
        matchScore
      };
    });
    
    // Sort by match score and rating, take top 9
    const recommended = mentors
      .sort((a, b) => (b.matchScore * 0.7 + b.rating * 0.3) - (a.matchScore * 0.7 + a.rating * 0.3))
      .slice(0, 9);
    
    res.json({ mentors: recommended });
  } catch (error) {
    console.error('Get recommended mentors error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get favorite mentors
app.get('/api/mentee/:menteeId/favorite-mentors', async (req, res) => {
  try {
    const { menteeId } = req.params;
    
    const result = await pool.query(`
      SELECT mp.user_id, mp.name, mp.bio, mp.profile_picture, mp.skills, 
             u.username, COALESCE(mr.total_rating, 0) as rating, COALESCE(mr.rating_count, 0) as review_count,
             mf.created_at as favorited_at
      FROM mentee_favorites mf
      JOIN mentor_profiles mp ON mf.mentor_id = mp.user_id
      JOIN users u ON mp.user_id = u.id
      LEFT JOIN mentor_ratings mr ON mp.user_id = mr.mentor_id
      WHERE mf.mentee_id = $1
      ORDER BY mf.created_at DESC
    `, [menteeId]);
    
    const favorites = result.rows.map(mentor => ({
      id: mentor.user_id,
      name: mentor.name || mentor.username,
      bio: mentor.bio || 'Experienced mentor ready to help you grow.',
      profilePicture: mentor.profile_picture,
      skills: mentor.skills || [],
      rating: parseFloat(mentor.rating) || 0,
      reviewCount: parseInt(mentor.review_count) || 0,
      favoritedAt: mentor.favorited_at
    }));
    
    res.json({ favorites });
  } catch (error) {
    console.error('Get favorite mentors error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Handle preflight OPTIONS request for session-feedback
app.options('/api/session-feedback', (req, res) => {
  res.sendStatus(200);
});

// Handle preflight OPTIONS request for UPI endpoints
app.options('/api/mentor/:mentorId/upi', (req, res) => {
  res.sendStatus(200);
});

// Submit session feedback and update mentor rating
app.post('/api/session-feedback', validateBody(schemas.sessionFeedbackSchema), async (req, res) => {
  // CORS handled by middleware
  
  try {
    if (!req.body || typeof req.body !== 'object') {
      console.warn('Session feedback received empty body');
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
    
    clearCachePattern(`mentor_${finalMentorId}`);
    clearCachePattern('mentors_list');
    
    res.json({ message: 'Feedback submitted successfully' });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Submit detailed mentor feedback
app.post('/api/mentor-feedback', async (req, res) => {
  try {
    const { 
      mentorId, 
      menteeId, 
      sessionId, 
      overallRating, 
      communicationRating, 
      knowledgeRating, 
      helpfulnessRating, 
      feedbackText, 
      wouldRecommend, 
      tags, 
      isAnonymous 
    } = req.body;
    
    if (!mentorId || !menteeId || !overallRating) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    await pool.query(
      'INSERT INTO mentor_feedback (mentor_id, mentee_id, session_id, overall_rating, communication_rating, knowledge_rating, helpfulness_rating, feedback_text, would_recommend, tags, is_anonymous) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
      [mentorId, menteeId, sessionId, overallRating, communicationRating, knowledgeRating, helpfulnessRating, feedbackText, wouldRecommend, JSON.stringify(tags || []), isAnonymous]
    );
    
    clearCachePattern(`mentor_${mentorId}`);
    res.json({ message: 'Detailed feedback submitted successfully' });
  } catch (error) {
    console.error('Submit detailed feedback error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get mentor detailed feedback
app.get('/api/mentor/:mentorId/detailed-feedback', async (req, res) => {
  try {
    const { mentorId } = req.params;
    
    const result = await pool.query(`
      SELECT mf.*, u.username as mentee_name
      FROM mentor_feedback mf
      LEFT JOIN users u ON mf.mentee_id = u.id
      WHERE mf.mentor_id = $1 AND mf.is_anonymous = false
      ORDER BY mf.created_at DESC
      LIMIT 50
    `, [mentorId]);
    
    const stats = await pool.query(`
      SELECT 
        AVG(overall_rating) as avg_overall,
        AVG(communication_rating) as avg_communication,
        AVG(knowledge_rating) as avg_knowledge,
        AVG(helpfulness_rating) as avg_helpfulness,
        COUNT(*) as total_feedback,
        COUNT(CASE WHEN would_recommend = true THEN 1 END) as recommendations
      FROM mentor_feedback 
      WHERE mentor_id = $1
    `, [mentorId]);
    
    res.json({ 
      feedback: result.rows,
      stats: stats.rows[0]
    });
  } catch (error) {
    console.error('Get detailed feedback error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get mentor feedback and ratings
app.get('/api/mentor/:mentorId/feedback', async (req, res) => {
  // CORS handled by middleware
  
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
    
    // Get overall rating
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

// Get mentor UPI details
app.get('/api/mentor/:mentorId/upi', async (req, res) => {
  // CORS handled by middleware
  
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
app.post('/api/mentor/:mentorId/upi', validateBody(schemas.mentorUpiSchema), async (req, res) => {
  // CORS handled by middleware
  
  try {
    const { mentorId } = req.params;
    if (!req.body || typeof req.body !== 'object') {
      console.warn('Save UPI received empty body for mentorId:', mentorId);
      return res.status(400).json({ error: 'Request body is required' });
    }
    const { upi_id, holder_name } = req.body;
    
    if (!upi_id || !upi_id.trim()) {
      return res.status(400).json({ error: 'UPI ID is required' });
    }
    
    // Validate UPI ID format (basic validation)
    const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
    if (!upiRegex.test(upi_id.trim())) {
      return res.status(400).json({ error: 'Invalid UPI ID format' });
    }
    
    // Check if UPI details already exist
    const existing = await pool.query(
      'SELECT id FROM mentor_upi_details WHERE mentor_id = $1',
      [mentorId]
    );
    
    if (existing.rows.length > 0) {
      // Update existing UPI details
      await pool.query(
        'UPDATE mentor_upi_details SET upi_id = $1, holder_name = $2, updated_at = CURRENT_TIMESTAMP WHERE mentor_id = $3',
        [upi_id.trim(), holder_name?.trim() || null, mentorId]
      );
    } else {
      // Insert new UPI details
      await pool.query(
        'INSERT INTO mentor_upi_details (mentor_id, upi_id, holder_name) VALUES ($1, $2, $3)',
        [mentorId, upi_id.trim(), holder_name?.trim() || null]
      );
    }
    
    // Clear cache
    clearCachePattern(`mentor_${mentorId}`);
    
    res.json({ message: 'UPI details saved successfully' });
  } catch (error) {
    // Enhanced logging for debugging
    console.error('Save UPI details error:', {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      stack: error?.stack
    });
    if (error.code === '23505') { // Unique constraint violation
      res.status(400).json({ error: 'UPI details already exist for this mentor' });
    } else {
      res.status(500).json({ error: 'Server error' });
    }
  }
});

// Delete mentor UPI details
app.delete('/api/mentor/:mentorId/upi', async (req, res) => {
  // CORS handled by middleware
  
  try {
    const { mentorId } = req.params;
    
    await pool.query(
      'DELETE FROM mentor_upi_details WHERE mentor_id = $1',
      [mentorId]
    );
    
    // Clear cache
    clearCachePattern(`mentor_${mentorId}`);
    
    res.json({ message: 'UPI details deleted successfully' });
  } catch (error) {
    console.error('Delete UPI details error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Get latest blogs (most recent first)
app.get('/api/blogs/popular', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT b.id, b.title, b.description, b.content, b.category, b.tags, b.images,
             b.likes_count, b.comments_count, b.created_at, b.mentor_id,
             COALESCE(mp.name, u.username) as mentor_name,
             mp.profile_picture as mentor_avatar,
             COUNT(bv.id) as view_count
      FROM blogs b
      JOIN users u ON b.mentor_id = u.id
      LEFT JOIN mentor_profiles mp ON b.mentor_id = mp.user_id
      LEFT JOIN blog_views bv ON b.id = bv.blog_id
      WHERE b.is_published = true
      GROUP BY b.id, b.title, b.description, b.content, b.category, b.tags, b.images,
               b.likes_count, b.comments_count, b.created_at, b.mentor_id, mp.name, u.username, mp.profile_picture
      ORDER BY b.created_at DESC
      LIMIT 9
    `);
    
    const blogs = result.rows.map(blog => ({
      id: blog.id,
      title: blog.title,
      description: blog.description,
      content: blog.content,
      category: blog.category,
      tags: blog.tags || [],
      images: blog.images || [],
      likes_count: blog.likes_count || 0,
      comments_count: blog.comments_count || 0,
      view_count: parseInt(blog.view_count) || 0,
      created_at: blog.created_at,
      mentor_id: blog.mentor_id,
      mentor_name: blog.mentor_name,
      mentor_avatar: blog.mentor_avatar
    }));
    
    res.json({ blogs });
  } catch (error) {
    console.error('Get popular blogs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Track blog view
app.post('/api/blogs/:blogId/view', validateBody(schemas.blogViewSchema), async (req, res) => {
  try {
    const { blogId } = req.params;
    if (!req.body || typeof req.body !== 'object') {
      console.warn('Track blog view received empty body for blogId:', blogId);
      return res.status(400).json({ error: 'Request body is required' });
    }
    const { userId } = req.body;
    const ipAddress = req.ip;
    
    // Check if view already exists for this user/IP in last 24 hours
    const existing = await pool.query(
      'SELECT id FROM blog_views WHERE blog_id = $1 AND (user_id = $2 OR ip_address = $3) AND created_at > NOW() - INTERVAL \'24 hours\'',
      [blogId, userId, ipAddress]
    );
    
    if (existing.rows.length === 0) {
      await pool.query(
        'INSERT INTO blog_views (blog_id, user_id, ip_address) VALUES ($1, $2, $3)',
        [blogId, userId, ipAddress]
      );
    }
    
    res.json({ message: 'View tracked' });
  } catch (error) {
    // Enhanced logging for debugging
    console.error('Track blog view error:', {
      message: error?.message,
      code: error?.code,
      detail: error?.detail,
      stack: error?.stack
    });
    res.status(500).json({ error: 'Server error' });
  }
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased limit for development
  standardHeaders: true,
  legacyHeaders: false,
});
// Apply rate limiter only to auth routes
app.use('/api/login', limiter);
app.use('/api/signup', limiter);
app.use('/api/verify-login', limiter);
app.use('/api/verify-signup', limiter);

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

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// TURN credentials endpoint for WebRTC
app.get('/api/turn-credentials', async (req, res) => {
  try {
    const response = await axios.post(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${TURN_KEY_ID}/credentials/generate`,
      { ttl: 3600 }, // 1 hour TTL
      {
        headers: {
          'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Add STUN server as fallback
    const iceServers = [
      ...response.data.iceServers,
      { urls: 'stun:stun.cloudflare.com:3478' }
    ];
    
    res.json({ iceServers });
  } catch (error) {
    console.error('TURN credential generation failed:', error.response?.data || error.message);
    
    // Fallback to public STUN servers if TURN fails
    res.json({
      iceServers: [
        { urls: 'stun:stun.cloudflare.com:3478' },
        { urls: 'stun:stun.l.google.com:19302' }
      ]
    });
  }
});

// Generate OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Create Razorpay order
app.post('/api/create-razorpay-order', async (req, res) => {
  try {
    const { amount, bookingId } = req.body;
    
    if (!amount || !bookingId) {
      return res.status(400).json({ error: 'Amount and bookingId are required' });
    }
    // validate amount is a positive number
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      console.error('Invalid amount provided for Razorpay order:', amount);
      return res.status(400).json({ error: 'Invalid amount' });
    }
    
    // Check if Razorpay is configured
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      console.error('Razorpay credentials not configured (env missing)');
      return res.status(500).json({ error: 'Payment service not configured' });
    }
    // Ensure the razorpay client exists; try to initialize if it was not set earlier
    if (!razorpay) {
      try {
        const keyId = process.env.RAZORPAY_KEY_ID;
        const keySecret = process.env.RAZORPAY_KEY_SECRET;
        razorpay = new Razorpay({ key_id: keyId, key_secret: keySecret });
        console.log('Razorpay client lazily initialized in create-order handler');
      } catch (initErr) {
        console.error('Failed to initialize Razorpay client on-demand:', initErr);
        return res.status(500).json({ error: 'Payment provider initialization failed' });
      }
    }
    
    const options = {
      amount: numericAmount * 100, // Convert to paise
      currency: 'INR',
      receipt: `booking_${bookingId}_${Date.now()}`
    };
    
    // DEBUG: Check environment variables
    console.log('Environment check:', {
      hasKeyId: !!process.env.RAZORPAY_KEY_ID,
      hasKeySecret: !!process.env.RAZORPAY_KEY_SECRET,
      keyIdFirst8: process.env.RAZORPAY_KEY_ID?.substring(0, 8),
      secretLength: process.env.RAZORPAY_KEY_SECRET?.length
    });
    
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ error: 'Razorpay credentials not configured' });
    }
    
    console.log('Creating Razorpay order with options:', { amount: options.amount, currency: options.currency, receipt: options.receipt });
    let order;
    try {
      order = await razorpay.orders.create(options);
      console.log('Razorpay order created:', order && order.id);
    } catch (rpError) {
      // Razorpay SDK often includes a .error or .response; log useful parts
      console.error('Razorpay.orders.create failed:', rpError && (rpError.error || rpError));
      const message = (rpError && (rpError.error?.description || rpError.message)) || 'Razorpay order creation failed';
      return res.status(502).json({ error: message });
    }

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      // key_id is public (not a secret) and required by Checkout in the client
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error('Create Razorpay order error (unexpected):', error);
    res.status(500).json({ error: 'Failed to create payment order: ' + (error && error.message ? error.message : 'unknown error') });
  }
});

// Temporary debug endpoint to test Razorpay credentials from production safely
app.post('/api/debug/razorpay-order', async (req, res) => {
  // This endpoint attempts to create a very small Razorpay order and returns
  // non-sensitive provider response details. REMOVE this endpoint after debugging.
  try {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      return res.status(500).json({ ok: false, message: 'Razorpay env missing' });
    }

    // Lazy initialize if needed
    if (!razorpay) {
      try {
        razorpay = new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
      } catch (e) {
        console.error('Debug init failed:', e);
        return res.status(500).json({ ok: false, message: 'Failed to init Razorpay client' });
      }
    }

    const options = { amount: 100, currency: 'INR', receipt: `debug_${Date.now()}` };
    try {
      const order = await razorpay.orders.create(options);
      return res.json({ ok: true, provider: 'razorpay', created: true, orderId: order.id });
    } catch (rpErr) {
      // Return sanitized provider error
      const providerError = rpErr && (rpErr.error || rpErr);
      console.error('Razorpay debug create failed:', providerError);
      return res.status(502).json({ ok: false, provider: 'razorpay', error: providerError?.description || providerError?.message || String(providerError) });
    }
  } catch (err) {
    console.error('Unexpected debug endpoint error:', err);
    return res.status(500).json({ ok: false, message: 'Unexpected error' });
  }
});

// Verify payment
app.post('/api/payments/verify', async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, bookingId } = req.body;
    
    // Verify signature
    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body.toString())
      .digest('hex');
    
    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Invalid payment signature' });
    }
    
    // Update booking payment status if bookingId is provided
    if (bookingId) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Update payment status
        await client.query(
          'UPDATE video_calls SET payment_confirmed = $1, payment_id = $2 WHERE id = $3',
          [true, razorpay_payment_id, bookingId]
        );
        
        // Get booking details
        const booking = await client.query(
          'SELECT mentee_id, mentor_id, payment_amount FROM video_calls WHERE id = $1',
          [bookingId]
        );
        
        if (booking.rows.length > 0) {
          const { mentee_id, mentor_id, payment_amount } = booking.rows[0];
          
          // Add earnings for mentor using environment variable
          const mentorSharePercentage = process.env.MENTOR_SHARE_PERCENTAGE || 70;
          const mentorEarning = (payment_amount * (mentorSharePercentage / 100)).toFixed(2);
          await client.query(
            'INSERT INTO mentor_earnings (mentor_id, session_id, amount, type) VALUES ($1, $2, $3, $4)',
            [mentor_id, bookingId, mentorEarning, 'session']
          );
          
          await client.query('COMMIT');
        
          // Create notifications
          await client.query(
            'INSERT INTO notifications (user_id, type, title, message, related_id, related_type) VALUES ($1, $2, $3, $4, $5, $6)',
            [mentee_id, 'payment_success', 'Payment Successful', 'Your payment has been confirmed. You can now join the session.', bookingId, 'booking']
          );
          
          await client.query(
            'INSERT INTO notifications (user_id, type, title, message, related_id, related_type) VALUES ($1, $2, $3, $4, $5, $6)',
            [mentor_id, 'payment_received', 'Payment Received', `Payment of ₹${payment_amount} received for your session. You earned ₹${mentorEarning}.`, bookingId, 'booking']
          );
        
          // Send real-time notifications
          if (io) {
            io.to(`user_${mentee_id}`).emit('payment_success', {
              bookingId,
              message: 'Payment successful! You can now join the session.'
            });
            
            io.to(`user_${mentor_id}`).emit('payment_received', {
              bookingId,
              amount: payment_amount,
              earning: mentorEarning,
              message: `Payment received for your session.`
            });
          }
        }
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }
    
    res.json({ success: true, message: 'Payment verified successfully' });
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// Razorpay webhook handler
app.post('/api/payments/webhook', async (req, res) => {
  try {
    const webhookSignature = req.headers['x-razorpay-signature'];
    const webhookBody = JSON.stringify(req.body);
    
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET)
      .update(webhookBody)
      .digest('hex');
    
    if (webhookSignature !== expectedSignature) {
      return res.status(400).json({ error: 'Invalid webhook signature' });
    }
    
    const event = req.body.event;
    const paymentEntity = req.body.payload.payment.entity;
    
    if (event === 'payment.captured') {
      // Find booking by payment ID and confirm payment
      await pool.query(
        'UPDATE video_calls SET payment_confirmed = true WHERE payment_id = $1',
        [paymentEntity.id]
      );
      console.log('Payment confirmed via webhook:', paymentEntity.id);
    }
    
    res.json({ status: 'ok' });
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// Create booking (request-then-pay flow)
app.post('/api/bookings', async (req, res) => {
  try {
    const { menteeId, mentorId, sessionFee, scheduledTime } = req.body;
    
    if (!menteeId || !mentorId || !sessionFee) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Create booking in database with required channel_name
    const channelName = `booking_${Date.now()}_${menteeId}_${mentorId}`;
    const result = await pool.query(
      'INSERT INTO video_calls (mentee_id, mentor_id, channel_name, status, created_at, payment_confirmed, payment_amount) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [menteeId, mentorId, channelName, 'pending', new Date().toISOString(), false, sessionFee]
    );
    
    const bookingId = result.rows[0].id;
    
    // Get mentor and mentee details for notification
    const mentee = await pool.query('SELECT username FROM users WHERE id = $1', [menteeId]);
    const mentor = await pool.query('SELECT username FROM users WHERE id = $1', [mentorId]);
    
    if (mentee.rows.length > 0 && mentor.rows.length > 0) {
      // Create notification for mentor
      await pool.query(
        'INSERT INTO notifications (user_id, type, title, message, related_id, related_type) VALUES ($1, $2, $3, $4, $5, $6)',
        [mentorId, 'booking_request', 'New Session Request', `${mentee.rows[0].username} wants to book a session with you for ₹${sessionFee}`, bookingId, 'booking']
      );
      
      // Send real-time notification to mentor
      if (io) {
        io.to(`user_${mentorId}`).emit('booking_request', {
          bookingId,
          menteeId,
          menteeName: mentee.rows[0].username,
          sessionFee,
          message: `${mentee.rows[0].username} wants to book a session with you`
        });
      }
    }
    
    res.json({ bookingId, status: 'pending', requiresPayment: false });
  } catch (error) {
    console.error('Create booking error:', error);
    res.status(500).json({ error: 'Failed to create booking' });
  }
});

// Get booking status
app.get('/api/bookings/:id/status', async (req, res) => {
  try {
    const { id: bookingId } = req.params;
    
    const result = await pool.query(
      'SELECT status, payment_confirmed, payment_amount FROM video_calls WHERE id = $1',
      [bookingId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    const booking = result.rows[0];
    
    res.json({
      bookingId,
      status: booking.status,
      paymentStatus: booking.payment_confirmed ? 'completed' : 'pending',
      callAllowed: booking.status === 'accepted' && booking.payment_confirmed,
      requiresPayment: booking.status === 'accepted' && !booking.payment_confirmed
    });
  } catch (error) {
    console.error('Get booking status error:', error);
    res.status(500).json({ error: 'Failed to get booking status' });
  }
});

// Accept booking request
app.post('/api/bookings/:id/accept', async (req, res) => {
  try {
    const { id: bookingId } = req.params;
    const { mentorId } = req.body;
    
    // Update booking status
    const result = await pool.query(
      'UPDATE video_calls SET status = $1, accepted_at = $2 WHERE id = $3 AND mentor_id = $4 AND status = $5 RETURNING mentee_id',
      ['accepted', new Date().toISOString(), bookingId, mentorId, 'pending']
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found or already processed' });
    }
    
    const menteeId = result.rows[0].mentee_id;
    
    // Create notification for mentee
    await pool.query(
      'INSERT INTO notifications (user_id, type, title, message, related_id, related_type) VALUES ($1, $2, $3, $4, $5, $6)',
      [menteeId, 'booking_accepted', 'Session Request Accepted', 'Your session request has been accepted. Please complete payment to join the session.', bookingId, 'booking']
    );
    
    // Send real-time notification to mentee
    if (io) {
      io.to(`user_${menteeId}`).emit('booking_accepted', {
        bookingId,
        message: 'Your session request has been accepted. Please complete payment.'
      });
    }
    
    res.json({ message: 'Booking accepted successfully' });
  } catch (error) {
    console.error('Accept booking error:', error);
    res.status(500).json({ error: 'Failed to accept booking' });
  }
});

// Reject booking request
app.post('/api/bookings/:id/reject', async (req, res) => {
  try {
    const { id: bookingId } = req.params;
    const { mentorId } = req.body;
    
    // Update booking status
    const result = await pool.query(
      'UPDATE video_calls SET status = $1, ended_at = $2 WHERE id = $3 AND mentor_id = $4 AND status = $5 RETURNING mentee_id',
      ['rejected', new Date().toISOString(), bookingId, mentorId, 'pending']
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found or already processed' });
    }
    
    const menteeId = result.rows[0].mentee_id;
    
    // Send real-time notification to mentee
    if (io) {
      io.to(`user_${menteeId}`).emit('booking_rejected', {
        bookingId,
        message: 'Your session request was declined by the mentor.'
      });
    }
    
    res.json({ message: 'Booking rejected successfully' });
  } catch (error) {
    console.error('Reject booking error:', error);
    res.status(500).json({ error: 'Failed to reject booking' });
  }
});





// Check username availability
app.post('/api/check-username', async (req, res) => {
  try {
    const { username } = req.body;
    const result = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    res.json({ available: result.rows.length === 0 });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Signup
app.post('/api/signup', async (req, res) => {
  try {
    console.log('Signup request received:', req.body);
    const { username, email, phone, password, role } = req.body;

    if (!username || !email || !phone || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    // Check if user already exists with same email and role
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
    
    // Send OTP via email with error handling
    try {
      await sendOTPEmail(email, otp, 'signup');
      console.log('Signup OTP sent successfully to:', email);
    } catch (emailError) {
      console.error('Failed to send signup OTP:', emailError);
      return res.status(500).json({ error: 'Failed to send verification email. Please try again.' });
    }
    
    // Store temp user data
    const sessionId = 'signup_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // Store in cache temporarily
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

// Verify email OTP for signup
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
    const token = jwt.sign({ userId: user.id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
    // Clear session data
    cache.delete(`signup_session_${sessionId}`);
    
    res.json({ token, user });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});





// Login with email and password
app.post('/api/login', async (req, res) => {
  try {
    console.log('Login request received:', { email: req.body.email, role: req.body.role });
    const { email, password, role } = req.body;
    
    if (!email || !password || !role) {
      console.log('Missing fields:', { email: !!email, password: !!password, role: !!role });
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Check if user exists and verify password
    const result = await pool.query(
      'SELECT id, username, email, phone, password_hash, role FROM users WHERE email = $1 AND role = $2',
      [email, role]
    );
    
    console.log('User query result:', result.rows.length > 0 ? 'User found' : 'User not found');
    
    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }
    
    const user = result.rows[0];
    
    // Check if password field exists and is not null
    if (!user.password_hash) {
      console.error('User password is null or undefined for user:', user.id);
      return res.status(400).json({ error: 'Account setup incomplete. Please contact support.' });
    }
    
    const isValidPassword = await bcrypt.compare(password, user.password_hash);
    console.log('Password validation:', isValidPassword ? 'Valid' : 'Invalid');
    
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
    await sendOTPEmail(user.email, otp, 'login');
    
    // Store user data for verification step
    const sessionId = 'login_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    setCache(`login_session_${sessionId}`, {
      userId: user.id,
      username: user.username,
      email: user.email,
      phone: user.phone,
      role: user.role
    });
    
    console.log('Login OTP sent and session created:', sessionId);
    
    res.json({ 
      sessionId,
      userId: user.id,
      requiresEmailVerification: true
    });
  } catch (error) {
    console.error('Login error details:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Verify email OTP for login
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
    const token = jwt.sign({ userId: userData.userId, role: userData.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
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

// Verify phone OTP for login
app.post('/api/verify-phone-login', async (req, res) => {
  try {
    const { sessionId, firebaseToken } = req.body;
    
    if (!sessionId || !firebaseToken) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    // Get user data from session
    const userData = getFromCache(`login_session_${sessionId}`);
    if (!userData) {
      return res.status(400).json({ error: 'Invalid or expired session' });
    }
    
    // Create JWT token
    const token = jwt.sign({ userId: userData.userId, role: userData.role }, process.env.JWT_SECRET, { expiresIn: '7d' });
    
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
    console.error('Phone verification error:', error);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Forgot password
app.post('/api/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

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
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Reset password
app.post('/api/reset-password', async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

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
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mentor Profile endpoints - Optimized
app.get('/api/mentor/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const cacheKey = `mentor_profile_${userId}`;
    const cached = getFromCache(cacheKey);
    if (cached) {
      return res.json({ profile: cached });
    }
    
    const result = await pool.query(
      'SELECT name, profile_picture, bio, education, skills, background, interests, languages, availability FROM mentor_profiles WHERE user_id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.json({ profile: null });
    }
    
    const profile = result.rows[0];
    
    // Parse interests data quickly
    let interestsData = { selectedCategories: [], interests: [] };
    if (profile.interests) {
      try {
        const parsed = typeof profile.interests === 'string' ? JSON.parse(profile.interests) : profile.interests;
        interestsData = Array.isArray(parsed) ? { interests: parsed, selectedCategories: [] } : parsed;
      } catch (e) {
        interestsData = { selectedCategories: [], interests: [] };
      }
    }
    
    // Return structured data immediately
    const profileData = {
      basicInfo: {
        name: profile.name || '',
        profilePicture: profile.profile_picture || '',
        bio: profile.bio || ''
      },
      education: profile.education || [],
      skills: profile.skills || [],
      background: profile.background || [],
      interests: interestsData.interests || [],
      selectedCategories: interestsData.selectedCategories || [],
      languages: profile.languages || [],
      availability: profile.availability || {}
    };
    
    setCache(cacheKey, profileData);
    res.json({ profile: profileData });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/mentor/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { basicInfo, education, skills, background, interests, languages, availability } = req.body;
    
    // Check if profile exists
    const existing = await pool.query(
      'SELECT id FROM mentor_profiles WHERE user_id = $1',
      [userId]
    );
    
    let profileId;
    
    if (existing.rows.length === 0) {
      // Create new profile
      const result = await pool.query(
        'INSERT INTO mentor_profiles (user_id, name, profile_picture, bio, education, skills, background, languages, availability, interests) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
        [userId, basicInfo.name, basicInfo.profilePicture, basicInfo.bio, JSON.stringify(education), JSON.stringify(skills), JSON.stringify(background), JSON.stringify(languages), JSON.stringify(availability), JSON.stringify(interests)]
      );
      profileId = result.rows[0].id;
    } else {
      // Update existing profile
      await pool.query(
        'UPDATE mentor_profiles SET name = $1, profile_picture = $2, bio = $3, education = $4, skills = $5, background = $6, languages = $7, availability = $8, interests = $9, updated_at = NOW() WHERE user_id = $10',
        [basicInfo.name, basicInfo.profilePicture, basicInfo.bio, JSON.stringify(education), JSON.stringify(skills), JSON.stringify(background), JSON.stringify(languages), JSON.stringify(availability), JSON.stringify(interests), userId]
      );
      profileId = existing.rows[0].id;
    }
    
    // Handle tags
    if (interests && interests.length > 0) {
      // Delete existing tags
      await pool.query('DELETE FROM mentor_profile_tags WHERE mentor_profile_id = $1', [profileId]);
      
      // Insert new tags
      for (const interest of interests) {
        const tagResult = await pool.query('SELECT id FROM tags WHERE name = $1', [interest]);
        if (tagResult.rows.length > 0) {
          await pool.query(
            'INSERT INTO mentor_profile_tags (mentor_profile_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [profileId, tagResult.rows[0].id]
          );
        }
      }
    }
    
    res.json({ message: 'Profile saved successfully' });
  } catch (error) {
    console.error('Save profile error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Update specific section of mentor profile
app.patch('/api/mentor/profile/:userId/section', async (req, res) => {
  try {
    console.log('Section update request:', req.body);
    const { userId } = req.params;
    const { section, data } = req.body;
    
    // Check if profile exists, create if not
    let existing = await pool.query(
      'SELECT * FROM mentor_profiles WHERE user_id = $1',
      [userId]
    );
    
    let profileId;
    if (existing.rows.length === 0) {
      // Create new profile with default values
      const result = await pool.query(
        'INSERT INTO mentor_profiles (user_id, name, profile_picture, bio, education, skills, background, languages, availability, interests) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id',
        [userId, '', '', '', '[]', '[]', '[]', '[]', '{}', '[]']
      );
      profileId = result.rows[0].id;
    } else {
      profileId = existing.rows[0].id;
    }
    
    // Update specific section
    switch (section) {
      case 'basic':
        await pool.query(
          'UPDATE mentor_profiles SET name = $1, profile_picture = $2, bio = $3, updated_at = NOW() WHERE user_id = $4',
          [data.name || '', data.profilePicture || '', data.bio || '', userId]
        );
        break;
      case 'education':
        await pool.query(
          'UPDATE mentor_profiles SET education = $1, updated_at = NOW() WHERE user_id = $2',
          [JSON.stringify(data || []), userId]
        );
        break;
      case 'skills':
        await pool.query(
          'UPDATE mentor_profiles SET skills = $1, updated_at = NOW() WHERE user_id = $2',
          [JSON.stringify(data || []), userId]
        );
        break;
      case 'background':
        await pool.query(
          'UPDATE mentor_profiles SET background = $1, updated_at = NOW() WHERE user_id = $2',
          [JSON.stringify(data || []), userId]
        );
        break;
      case 'interests':
        // Save both selected categories and interests in the interests column
        const interestData = {
          selectedCategories: data.selectedCategories || [],
          interests: data.interests || []
        };
        await pool.query(
          'UPDATE mentor_profiles SET interests = $1, updated_at = NOW() WHERE user_id = $2',
          [JSON.stringify(interestData), userId]
        );
        break;
      case 'languages':
        await pool.query(
          'UPDATE mentor_profiles SET languages = $1, updated_at = NOW() WHERE user_id = $2',
          [JSON.stringify(data || []), userId]
        );
        break;
      case 'availability':
        await pool.query(
          'UPDATE mentor_profiles SET availability = $1, updated_at = NOW() WHERE user_id = $2',
          [JSON.stringify(data || {}), userId]
        );
        break;
      default:
        return res.status(400).json({ error: 'Invalid section' });
    }
    
    res.json({ message: 'Section saved successfully' });
  } catch (error) {
    console.error('Save section error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Get all mentors for mentee dashboard - Optimized
app.get('/api/mentors', async (req, res) => {
  try {
    const cacheKey = 'mentors_list';
    const cached = getLongCache(cacheKey);
    if (cached) {
      return res.json({ mentors: cached });
    }
    
    const result = await pool.query(`
      SELECT mp.user_id, mp.name, mp.bio, mp.profile_picture, mp.skills, mp.interests, mp.education, mp.background, mp.languages, mp.availability, 
             u.username, COALESCE(mr.total_rating, 0) as rating, COALESCE(mr.rating_count, 0) as review_count
      FROM mentor_profiles mp 
      JOIN users u ON mp.user_id = u.id 
      LEFT JOIN mentor_ratings mr ON mp.user_id = mr.mentor_id
      WHERE u.role = $1 AND mp.name IS NOT NULL AND mp.name != ''
    `, ['mentor']);
    
    const mentors = result.rows.map(mentor => {
      // Parse JSON fields safely
      let skills = [];
      let interests = [];
      let languages = [];
      let availability = {};
      
      try {
        skills = mentor.skills ? (typeof mentor.skills === 'string' ? JSON.parse(mentor.skills) : mentor.skills) : [];
      } catch (e) { skills = []; }
      
      try {
        const interestsData = mentor.interests ? (typeof mentor.interests === 'string' ? JSON.parse(mentor.interests) : mentor.interests) : [];
        if (Array.isArray(interestsData)) {
          interests = interestsData;
        } else if (interestsData.interests) {
          interests = interestsData.interests;
        } else {
          interests = [];
        }
      } catch (e) { interests = []; }
      
      let interestsByCategory = {};
      let selectedCategories = [];
      try {
        const interestsData = mentor.interests ? (typeof mentor.interests === 'string' ? JSON.parse(mentor.interests) : mentor.interests) : {};
        
        if (interestsData.interestsByCategory) {
          interestsByCategory = interestsData.interestsByCategory;
          selectedCategories = interestsData.selectedCategories || Object.keys(interestsByCategory);
        } else if (Array.isArray(interestsData.interests) && interestsData.interests.length > 0) {
          // Auto-detect categories for flat interests array
          const interestTags = {
            placement: ['DSA', 'Frontend Development', 'Backend Development', 'Full Stack', 'Mobile Development', 'DevOps', 'Cloud Computing', 'Machine Learning', 'Data Science', 'Cybersecurity', 'System Design', 'Database Management', 'API Development', 'Testing', 'UI/UX Design', 'Product Management', 'Aptitude', 'Resume Building', 'Interview Preparation', 'Coding Practice'],
            college_reviews: ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi', 'Mumbai'],
            skills_learning: ['JavaScript', 'Python', 'Java', 'C++', 'React', 'Angular', 'Vue.js', 'Node.js', 'Spring Boot', 'Django', 'Flask', 'MongoDB', 'MySQL', 'PostgreSQL', 'AWS', 'Azure', 'Docker', 'Kubernetes', 'Git', 'Linux'],
            projects: ['Web Development', 'Mobile Apps', 'Desktop Applications', 'Game Development', 'AI/ML Projects', 'Data Analytics', 'Blockchain', 'IoT', 'AR/VR', 'E-commerce', 'Social Media', 'Healthcare', 'Education', 'Finance', 'Entertainment', 'Open Source', 'Startup Ideas', 'Research Projects', 'Hackathon Projects', 'Portfolio Projects'],
            hackathons: ['Problem Solving', 'Team Formation', 'Idea Generation', 'Prototype Development', 'Presentation Skills', 'Time Management', 'Technology Selection', 'UI/UX Design', 'Backend Development', 'Frontend Development', 'Database Design', 'API Integration', 'Deployment', 'Testing', 'Documentation', 'Pitch Preparation', 'Demo Creation', 'Judging Criteria', 'Networking', 'Post-Hackathon Steps'],
            study_help: ['Mathematics', 'Physics', 'Chemistry', 'Computer Science', 'Electronics', 'Mechanical', 'Civil Engineering', 'Electrical Engineering', 'GATE Preparation', 'JEE Preparation', 'NEET Preparation', 'CAT Preparation', 'GRE Preparation', 'TOEFL Preparation', 'IELTS Preparation', 'Semester Exams', 'Assignment Help', 'Project Reports', 'Research Papers', 'Thesis Writing']
          };
          
          // Auto-detect categories based on interests
          const detectedCategories = [];
          Object.keys(interestTags).forEach(category => {
            const categoryTags = interestsData.interests.filter(interest => 
              interestTags[category] && interestTags[category].includes(interest)
            );
            if (categoryTags.length > 0) {
              interestsByCategory[category] = categoryTags;
              detectedCategories.push(category);
            }
          });
          selectedCategories = interestsData.selectedCategories || detectedCategories;
        }
      } catch (e) { interestsByCategory = {}; }
      
      let education = [];
      try {
        education = mentor.education ? (typeof mentor.education === 'string' ? JSON.parse(mentor.education) : mentor.education) : [];
      } catch (e) { education = []; }
      
      let background = [];
      try {
        background = mentor.background ? (typeof mentor.background === 'string' ? JSON.parse(mentor.background) : mentor.background) : [];
      } catch (e) { background = []; }
      
      try {
        languages = mentor.languages ? (typeof mentor.languages === 'string' ? JSON.parse(mentor.languages) : mentor.languages) : [];
      } catch (e) { languages = []; }
      
      try {
        availability = mentor.availability ? (typeof mentor.availability === 'string' ? JSON.parse(mentor.availability) : mentor.availability) : {};
      } catch (e) { availability = {}; }
      
      return {
        id: mentor.user_id,
        name: mentor.name || mentor.username,
        bio: mentor.bio || 'Experienced mentor ready to help you grow.',
        profilePicture: mentor.profile_picture,
        skills,
        interests,
        interestsByCategory,
        selectedCategories,
        education,
        background,
        languages,
        availability,
        rating: parseFloat(mentor.rating) || 0,
        reviewCount: parseInt(mentor.review_count) || 0
      };
    });
    
    setLongCache(cacheKey, mentors);
    res.json({ mentors });
  } catch (error) {
    console.error('Get mentors error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add mentee-specific endpoints
app.post('/api/mentee/favorite', async (req, res) => {
  try {
    const { menteeId, mentorId } = req.body;
    
    // Check if already favorited
    const existing = await pool.query(
      'SELECT id FROM mentee_favorites WHERE mentee_id = $1 AND mentor_id = $2',
      [menteeId, mentorId]
    );
    
    if (existing.rows.length > 0) {
      // Remove from favorites
      await pool.query(
        'DELETE FROM mentee_favorites WHERE mentee_id = $1 AND mentor_id = $2',
        [menteeId, mentorId]
      );
      res.json({ message: 'Removed from favorites', favorited: false });
    } else {
      // Add to favorites
      await pool.query(
        'INSERT INTO mentee_favorites (mentee_id, mentor_id) VALUES ($1, $2)',
        [menteeId, mentorId]
      );
      res.json({ message: 'Added to favorites', favorited: true });
    }
  } catch (error) {
    console.error('Favorite error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/mentee/:menteeId/favorites', async (req, res) => {
  try {
    const { menteeId } = req.params;
    
    const result = await pool.query(
      'SELECT mentor_id FROM mentee_favorites WHERE mentee_id = $1',
      [menteeId]
    );
    
    const favoriteIds = result.rows.map(row => row.mentor_id);
    res.json({ favorites: favoriteIds });
  } catch (error) {
    console.error('Get favorites error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/mentee/:menteeId/liked-blogs', async (req, res) => {
  try {
    const { menteeId } = req.params;
    
    const result = await pool.query(
      'SELECT blog_id FROM blog_likes WHERE mentee_id = $1',
      [menteeId]
    );
    
    const likedBlogs = result.rows.map(row => row.blog_id);
    res.json({ likedBlogs });
  } catch (error) {
    console.error('Get liked blogs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Blog endpoints - Optimized
app.get('/api/blogs', async (req, res) => {
  try {
    const cacheKey = 'all_blogs';
    const cached = getLongCache(cacheKey);
    if (cached) {
      return res.json({ blogs: cached });
    }
    
    const result = await pool.query(`
      SELECT b.id, b.title, b.description, b.content, b.category, b.tags, b.images, 
             b.likes_count, b.comments_count, b.created_at, b.mentor_id,
             COALESCE(mp.name, u.username) as mentor_name, 
             mp.profile_picture as mentor_avatar
      FROM blogs b 
      JOIN users u ON b.mentor_id = u.id 
      LEFT JOIN mentor_profiles mp ON b.mentor_id = mp.user_id
      WHERE b.is_published = true 
      ORDER BY b.created_at DESC
      LIMIT 50
    `);
    
    const blogs = result.rows.map(blog => ({
      id: blog.id,
      title: blog.title,
      description: blog.description,
      content: blog.content,
      category: blog.category,
      tags: blog.tags || [],
      images: blog.images || [],
      likes_count: blog.likes_count || 0,
      comments_count: blog.comments_count || 0,
      created_at: blog.created_at,
      mentor_id: blog.mentor_id,
      mentor_name: blog.mentor_name,
      mentor_avatar: blog.mentor_avatar
    }));
    
    setLongCache(cacheKey, blogs);
    res.json({ blogs });
  } catch (error) {
    console.error('Get blogs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/blogs/mentor/:mentorId', async (req, res) => {
  try {
    const { mentorId } = req.params;
    const cacheKey = `mentor_blogs_${mentorId}`;
    const cached = getFromCache(cacheKey);
    if (cached) {
      return res.json({ blogs: cached });
    }
    
    const result = await pool.query(
      'SELECT id, title, description, content, category, tags, images, likes_count, comments_count, created_at, is_published FROM blogs WHERE mentor_id = $1 ORDER BY created_at DESC LIMIT 20',
      [mentorId]
    );
    
    const blogs = result.rows.map(blog => ({
      id: blog.id,
      title: blog.title,
      description: blog.description,
      content: blog.content,
      category: blog.category,
      tags: blog.tags || [],
      images: blog.images || [],
      likes_count: blog.likes_count || 0,
      comments_count: blog.comments_count || 0,
      created_at: blog.created_at,
      is_published: blog.is_published
    }));
    
    setCache(cacheKey, blogs);
    res.json({ blogs });
  } catch (error) {
    console.error('Get mentor blogs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/blogs', async (req, res) => {
  try {
    const { mentorId, title, description, content, category, tags, images } = req.body;
    
    const result = await pool.query(
      'INSERT INTO blogs (mentor_id, title, description, content, category, tags, images) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [mentorId, title, description, content, category, tags || [], images || []]
    );
    
    // Clear relevant caches
    clearCachePattern('blogs');
    clearCachePattern(`mentor_${mentorId}`);
    
    res.json({ message: 'Blog created successfully', blog: result.rows[0] });
  } catch (error) {
    console.error('Create blog error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/blogs/:blogId', async (req, res) => {
  try {
    const { blogId } = req.params;
    const { mentorId } = req.body;
    
    await pool.query(
      'DELETE FROM blogs WHERE id = $1 AND mentor_id = $2',
      [blogId, mentorId]
    );
    
    res.json({ message: 'Blog deleted successfully' });
  } catch (error) {
    console.error('Delete blog error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Blog likes
app.post('/api/blogs/:blogId/like', async (req, res) => {
  try {
    const { blogId } = req.params;
    const { menteeId } = req.body;
    
    const existing = await pool.query(
      'SELECT id FROM blog_likes WHERE blog_id = $1 AND mentee_id = $2',
      [blogId, menteeId]
    );
    
    if (existing.rows.length > 0) {
      await pool.query(
        'DELETE FROM blog_likes WHERE blog_id = $1 AND mentee_id = $2',
        [blogId, menteeId]
      );
      await pool.query(
        'UPDATE blogs SET likes_count = likes_count - 1 WHERE id = $1',
        [blogId]
      );
      res.json({ liked: false });
    } else {
      await pool.query(
        'INSERT INTO blog_likes (blog_id, mentee_id) VALUES ($1, $2)',
        [blogId, menteeId]
      );
      await pool.query(
        'UPDATE blogs SET likes_count = likes_count + 1 WHERE id = $1',
        [blogId]
      );
      
      // Create notification for mentor
      const blog = await pool.query('SELECT mentor_id, title FROM blogs WHERE id = $1', [blogId]);
      const mentee = await pool.query('SELECT username FROM users WHERE id = $1', [menteeId]);
      
      if (blog.rows.length > 0 && mentee.rows.length > 0 && blog.rows[0].mentor_id !== menteeId) {
        await pool.query(
          'INSERT INTO notifications (user_id, type, title, message, related_id, related_type) VALUES ($1, $2, $3, $4, $5, $6)',
          [blog.rows[0].mentor_id, 'blog_like', 'New Like', `${mentee.rows[0].username} liked your blog "${blog.rows[0].title}"`, blogId, 'blog']
        );
        // Clear notification cache
        clearCachePattern(`notifications_${blog.rows[0].mentor_id}`);
      }
      
      res.json({ liked: true });
    }
  } catch (error) {
    console.error('Like blog error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Blog comments
app.get('/api/blogs/:blogId/comments', async (req, res) => {
  try {
    const { blogId } = req.params;
    const result = await pool.query(`
      SELECT bc.*, u.username, u.role, mp.name as display_name, mp.profile_picture
      FROM blog_comments bc
      JOIN users u ON bc.user_id = u.id
      LEFT JOIN mentor_profiles mp ON bc.user_id = mp.user_id
      WHERE bc.blog_id = $1
      ORDER BY bc.created_at ASC
    `, [blogId]);
    
    const comments = result.rows.map(comment => ({
      ...comment,
      author_name: comment.display_name || comment.username,
      author_avatar: comment.profile_picture
    }));
    
    res.json({ comments });
  } catch (error) {
    console.error('Get comments error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/blogs/:blogId/comments', async (req, res) => {
  try {
    const { blogId } = req.params;
    const { userId, content, parentCommentId } = req.body;
    
    const result = await pool.query(
      'INSERT INTO blog_comments (blog_id, user_id, content, parent_comment_id) VALUES ($1, $2, $3, $4) RETURNING *',
      [blogId, userId, content, parentCommentId || null]
    );
    
    await pool.query(
      'UPDATE blogs SET comments_count = comments_count + 1 WHERE id = $1',
      [blogId]
    );
    
    // Create notification for blog owner
    const blog = await pool.query('SELECT mentor_id, title FROM blogs WHERE id = $1', [blogId]);
    const user = await pool.query('SELECT username FROM users WHERE id = $1', [userId]);
    
    if (blog.rows.length > 0 && user.rows.length > 0 && blog.rows[0].mentor_id !== userId) {
      const commentPreview = content.length > 50 ? content.substring(0, 50) + '...' : content;
      await pool.query(
        'INSERT INTO notifications (user_id, type, title, message, related_id, related_type) VALUES ($1, $2, $3, $4, $5, $6)',
        [blog.rows[0].mentor_id, 'blog_comment', 'New Comment', `${user.rows[0].username} commented on "${blog.rows[0].title}": "${commentPreview}"`, blogId, 'blog']
      );
      // Clear notification cache
      clearCachePattern(`notifications_${blog.rows[0].mentor_id}`);
    }
    
    // Create notification for parent comment author if it's a reply
    if (parentCommentId) {
      const parentComment = await pool.query(
        'SELECT bc.user_id, bc.content FROM blog_comments bc WHERE bc.id = $1', 
        [parentCommentId]
      );
      if (parentComment.rows.length > 0 && parentComment.rows[0].user_id !== userId && blog.rows.length > 0) {
        const replyPreview = content.length > 50 ? content.substring(0, 50) + '...' : content;
        const originalComment = parentComment.rows[0].content.length > 30 ? 
          parentComment.rows[0].content.substring(0, 30) + '...' : parentComment.rows[0].content;
        
        await pool.query(
          'INSERT INTO notifications (user_id, type, title, message, related_id, related_type) VALUES ($1, $2, $3, $4, $5, $6)',
          [parentComment.rows[0].user_id, 'blog_reply', 'New Reply', `${user.rows[0].username} replied to your comment on "${blog.rows[0].title}": "${replyPreview}" (Original: "${originalComment}")`, blogId, 'blog']
        );
        // Clear notification cache
        clearCachePattern(`notifications_${parentComment.rows[0].user_id}`);
      }
    }
    
    res.json({ message: 'Comment added successfully', comment: result.rows[0] });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/comments/:commentId', async (req, res) => {
  try {
    const { commentId } = req.params;
    const { userId, userRole } = req.body;
    
    const comment = await pool.query('SELECT * FROM blog_comments WHERE id = $1', [commentId]);
    
    if (comment.rows.length === 0) {
      return res.status(404).json({ error: 'Comment not found' });
    }
    
    const blog = await pool.query('SELECT mentor_id FROM blogs WHERE id = $1', [comment.rows[0].blog_id]);
    
    // Allow deletion if user owns comment or is the blog's mentor
    if (comment.rows[0].user_id === userId || (userRole === 'mentor' && blog.rows[0].mentor_id === userId)) {
      await pool.query('DELETE FROM blog_comments WHERE id = $1', [commentId]);
      await pool.query(
        'UPDATE blogs SET comments_count = comments_count - 1 WHERE id = $1',
        [comment.rows[0].blog_id]
      );
      res.json({ message: 'Comment deleted successfully' });
    } else {
      res.status(403).json({ error: 'Not authorized to delete this comment' });
    }
  } catch (error) {
    console.error('Delete comment error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Notifications - Optimized
app.get('/api/notifications/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const cacheKey = `notifications_${userId}`;
    const cached = getFromCache(cacheKey, 60000); // 1 minute cache for notifications
    if (cached) {
      return res.json({ notifications: cached });
    }
    
    const result = await pool.query(
      'SELECT id, type, title, message, is_read, created_at, related_id, related_type FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30',
      [userId]
    );
    
    setCache(cacheKey, result.rows, 60000);
    res.json({ notifications: result.rows });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/notifications/:userId/read', async (req, res) => {
  try {
    const { userId } = req.params;
    await pool.query(
      'UPDATE notifications SET is_read = true WHERE user_id = $1',
      [userId]
    );
    
    res.json({ message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark notifications read error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/notifications/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    await pool.query(
      'DELETE FROM notifications WHERE user_id = $1',
      [userId]
    );
    
    res.json({ message: 'All notifications cleared' });
  } catch (error) {
    console.error('Clear notifications error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Community endpoints - Optimized
app.get('/api/communities', async (req, res) => {
  try {
    const cacheKey = 'all_communities';
    const cached = getFromCache(cacheKey);
    if (cached) {
      return res.json({ communities: cached });
    }
    
    const result = await pool.query(`
      SELECT c.id, c.name, c.description, c.interest_category, c.member_count, c.created_at, c.mentor_id,
             COALESCE(mp.name, u.username) as mentor_name
      FROM communities c
      JOIN users u ON c.mentor_id = u.id
      LEFT JOIN mentor_profiles mp ON c.mentor_id = mp.user_id
      WHERE c.is_active = true
      ORDER BY c.created_at DESC
      LIMIT 30
    `);
    
    const communities = result.rows.map(community => ({
      id: community.id,
      name: community.name,
      description: community.description,
      interest_category: community.interest_category,
      member_count: community.member_count || 0,
      created_at: community.created_at,
      mentor_id: community.mentor_id,
      mentor_name: community.mentor_name
    }));
    
    setCache(cacheKey, communities);
    res.json({ communities });
  } catch (error) {
    console.error('Get communities error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/communities/mentor/:mentorId', async (req, res) => {
  try {
    const { mentorId } = req.params;
    const result = await pool.query(
      'SELECT * FROM communities WHERE mentor_id = $1 AND is_active = true ORDER BY created_at DESC',
      [mentorId]
    );
    
    res.json({ communities: result.rows });
  } catch (error) {
    console.error('Get mentor communities error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/communities', async (req, res) => {
  try {
    const { mentorId, name, description, interestCategory } = req.body;
    
    const result = await pool.query(
      'INSERT INTO communities (mentor_id, name, description, interest_category) VALUES ($1, $2, $3, $4) RETURNING *',
      [mentorId, name, description, interestCategory]
    );
    
    res.json({ message: 'Community created successfully', community: result.rows[0] });
  } catch (error) {
    console.error('Create community error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/communities/:communityId/join', async (req, res) => {
  try {
    const { communityId } = req.params;
    const { menteeId } = req.body;
    
    // Check if already joined
    const existing = await pool.query(
      'SELECT id FROM community_members WHERE community_id = $1 AND mentee_id = $2',
      [communityId, menteeId]
    );
    
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Already joined this community' });
    }
    
    // Add member
    await pool.query(
      'INSERT INTO community_members (community_id, mentee_id) VALUES ($1, $2)',
      [communityId, menteeId]
    );
    
    // Update member count
    await pool.query(
      'UPDATE communities SET member_count = member_count + 1 WHERE id = $1',
      [communityId]
    );
    
    // Create notification for mentor
    const community = await pool.query('SELECT mentor_id, name FROM communities WHERE id = $1', [communityId]);
    const mentee = await pool.query('SELECT username FROM users WHERE id = $1', [menteeId]);
    
    if (community.rows.length > 0 && mentee.rows.length > 0) {
      await pool.query(
        'INSERT INTO notifications (user_id, type, title, message, related_id, related_type) VALUES ($1, $2, $3, $4, $5, $6)',
        [community.rows[0].mentor_id, 'community_join', 'New Member', `${mentee.rows[0].username} joined your community "${community.rows[0].name}"`, communityId, 'community']
      );
    }
    
    res.json({ message: 'Joined community successfully' });
  } catch (error) {
    console.error('Join community error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/communities/:communityId/posts', async (req, res) => {
  try {
    const { communityId } = req.params;
    const result = await pool.query(`
      SELECT cp.*, u.username as mentor_name, mp.name as mentor_display_name
      FROM community_posts cp
      JOIN users u ON cp.mentor_id = u.id
      LEFT JOIN mentor_profiles mp ON cp.mentor_id = mp.user_id
      WHERE cp.community_id = $1
      ORDER BY cp.created_at DESC
    `, [communityId]);
    
    const posts = result.rows.map(post => ({
      ...post,
      mentor_name: post.mentor_display_name || post.mentor_name
    }));
    
    res.json({ posts });
  } catch (error) {
    console.error('Get community posts error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/communities/:communityId/posts', async (req, res) => {
  try {
    const { communityId } = req.params;
    const { mentorId, content, fileUrl, fileName, fileType, fileSize, postType } = req.body;
    
    console.log('Creating community post:', {
      communityId,
      mentorId,
      content: content?.substring(0, 50),
      fileName,
      fileType,
      fileSize,
      postType,
      fileUrlLength: fileUrl?.length
    });
    
    const result = await pool.query(
      'INSERT INTO community_posts (community_id, mentor_id, content, file_url, file_name, file_type, file_size, post_type) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
      [communityId, mentorId, content || null, fileUrl || null, fileName || null, fileType?.substring(0, 50) || null, fileSize || null, postType || 'text']
    );
    
    console.log('Post created successfully:', result.rows[0].id);
    
    // Notify all community members
    const members = await pool.query(
      'SELECT mentee_id FROM community_members WHERE community_id = $1',
      [communityId]
    );
    
    const community = await pool.query('SELECT name FROM communities WHERE id = $1', [communityId]);
    const mentor = await pool.query('SELECT username FROM users WHERE id = $1', [mentorId]);
    
    if (community.rows.length > 0 && mentor.rows.length > 0) {
      for (const member of members.rows) {
        await pool.query(
          'INSERT INTO notifications (user_id, type, title, message, related_id, related_type) VALUES ($1, $2, $3, $4, $5, $6)',
          [member.mentee_id, 'community_post', 'New Post', `${mentor.rows[0].username} posted in "${community.rows[0].name}"`, communityId, 'community']
        );
      }
    }
    
    res.json({ message: 'Post created successfully', post: result.rows[0] });
  } catch (error) {
    console.error('Create community post error:', error);
    console.error('Error details:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

app.post('/api/communities/posts/:postId/react', async (req, res) => {
  try {
    const { postId } = req.params;
    const { userId, reactionType } = req.body;
    
    const existing = await pool.query(
      'SELECT id FROM community_post_reactions WHERE post_id = $1 AND user_id = $2',
      [postId, userId]
    );
    
    if (existing.rows.length > 0) {
      await pool.query(
        'UPDATE community_post_reactions SET reaction_type = $1 WHERE post_id = $2 AND user_id = $3',
        [reactionType, postId, userId]
      );
    } else {
      await pool.query(
        'INSERT INTO community_post_reactions (post_id, user_id, reaction_type) VALUES ($1, $2, $3)',
        [postId, userId, reactionType]
      );
    }
    
    res.json({ message: 'Reaction added successfully' });
  } catch (error) {
    console.error('React to post error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/communities/posts/:postId/reactions', async (req, res) => {
  try {
    const { postId } = req.params;
    const result = await pool.query(
      'SELECT reaction_type, COUNT(*) as count FROM community_post_reactions WHERE post_id = $1 GROUP BY reaction_type',
      [postId]
    );
    
    const reactions = {};
    result.rows.forEach(row => {
      reactions[row.reaction_type] = parseInt(row.count);
    });
    
    res.json({ reactions });
  } catch (error) {
    console.error('Get reactions error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/mentee/:menteeId/communities', async (req, res) => {
  try {
    const { menteeId } = req.params;
    const result = await pool.query(`
      SELECT c.*, cm.joined_at, u.username as mentor_name, mp.name as mentor_display_name
      FROM communities c
      JOIN community_members cm ON c.id = cm.community_id
      JOIN users u ON c.mentor_id = u.id
      LEFT JOIN mentor_profiles mp ON c.mentor_id = mp.user_id
      WHERE cm.mentee_id = $1 AND c.is_active = true
      ORDER BY cm.joined_at DESC
    `, [menteeId]);
    
    const communities = result.rows.map(community => ({
      ...community,
      mentor_name: community.mentor_display_name || community.mentor_name
    }));
    
    res.json({ communities });
  } catch (error) {
    console.error('Get mentee communities error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// WebRTC Signaling endpoints
app.post('/api/webrtc/offer', async (req, res) => {
  try {
    const { callId, offer, userId } = req.body;
    
    // Store offer in database or memory (using simple in-memory for now)
    if (!global.webrtcSignals) {
      global.webrtcSignals = {};
    }
    
    global.webrtcSignals[callId] = {
      offer,
      offeredBy: userId,
      timestamp: Date.now()
    };
    
    res.json({ success: true });
  } catch (error) {
    console.error('WebRTC offer error:', error);
    res.status(500).json({ error: 'Failed to store offer' });
  }
});

app.get('/api/webrtc/offer/:callId', async (req, res) => {
  try {
    const { callId } = req.params;
    
    const signal = global.webrtcSignals?.[callId];
    if (signal && signal.offer) {
      res.json({ offer: signal.offer });
    } else {
      res.json({ offer: null });
    }
  } catch (error) {
    console.error('WebRTC get offer error:', error);
    res.status(500).json({ error: 'Failed to get offer' });
  }
});

app.post('/api/webrtc/answer', async (req, res) => {
  try {
    const { callId, answer, userId } = req.body;
    
    if (!global.webrtcSignals) {
      global.webrtcSignals = {};
    }
    
    if (global.webrtcSignals[callId]) {
      global.webrtcSignals[callId].answer = answer;
      global.webrtcSignals[callId].answeredBy = userId;
    }
    
    res.json({ success: true });
  } catch (error) {
    console.error('WebRTC answer error:', error);
    res.status(500).json({ error: 'Failed to store answer' });
  }
});

app.get('/api/webrtc/answer/:callId', async (req, res) => {
  try {
    const { callId } = req.params;
    
    const signal = global.webrtcSignals?.[callId];
    if (signal && signal.answer) {
      res.json({ answer: signal.answer });
    } else {
      res.json({ answer: null });
    }
  } catch (error) {
    console.error('WebRTC get answer error:', error);
    res.status(500).json({ error: 'Failed to get answer' });
  }
});

// WebRTC Connection Status endpoint with ICE servers
app.get('/api/webrtc/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    res.json({
      connected: true,
      technology: 'WebRTC',
      features: ['HD Video', 'Audio', 'Screen Share', 'Chat'],
      maxDuration: 10, // minutes
      iceServers: [
        // Primary Cloudflare TURN servers (your credentials)
        {
          urls: [
            'turn:turn.cloudflare.com:3478',
            'turns:turn.cloudflare.com:5349'
          ],
          username: 'ccb11479d57e58d6450a4743bad9a1e8',
          credential: '75063d2f78527ff8115025d127e87619d62c4428ed6ff1b001fc3cf03d0ba514'
        },
        // STUN servers
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // Backup TURN servers
        {
          urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ]
    });
  } catch (error) {
    console.error('WebRTC status error:', error);
    res.status(500).json({ error: 'Failed to check WebRTC status' });
  }
});

// ICE server connectivity test endpoint
app.post('/api/webrtc/test-connectivity', async (req, res) => {
  try {
    const { userId, iceServers } = req.body;
    
    // Return connectivity test results
    res.json({
      success: true,
      message: 'Connectivity test completed',
      recommendations: {
        useRelay: true,
        preferredServers: [
          'turn:openrelay.metered.ca:80',
          'turn:relay1.expressturn.com:3478'
        ]
      }
    });
  } catch (error) {
    console.error('Connectivity test error:', error);
    res.status(500).json({ error: 'Failed to test connectivity' });
  }
});

// WebRTC Session Management with multiple TURN servers
app.post('/api/webrtc/session/create', async (req, res) => {
  try {
    const { callId, userId } = req.body;
    
    // Create WebRTC session entry
    await pool.query(
      'INSERT INTO webrtc_sessions (call_id, created_at) VALUES ($1, $2) ON CONFLICT (call_id) DO NOTHING',
      [callId, new Date().toISOString()]
    );
    
    res.json({
      sessionId: callId,
      message: 'WebRTC session created',
      iceServers: [
        // Primary Cloudflare TURN servers (your credentials)
        {
          urls: [
            'turn:turn.cloudflare.com:3478',
            'turns:turn.cloudflare.com:5349'
          ],
          username: CLOUDFLARE_APP_ID,
          credential: CLOUDFLARE_API_TOKEN
        },
        // STUN servers for connectivity
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        // Backup TURN servers
        {
          urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443'],
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: ['turn:relay1.expressturn.com:3478'],
          username: 'ef3CYGPRL8ZPAA5KXC',
          credential: 'Hj8pBqZnfQmxrLzM'
        }
      ]
    });
  } catch (error) {
    console.error('Create WebRTC session error:', error);
    res.status(500).json({ error: 'Failed to create WebRTC session' });
  }
});

// Mentee Profile endpoints
app.get('/api/mentee/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM mentee_profiles WHERE user_id = $1',
      [userId]
    );
    
    if (result.rows.length === 0) {
      return res.json({ profile: null });
    }
    
    const profile = result.rows[0];
    res.json({ profile });
  } catch (error) {
    console.error('Get mentee profile error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.put('/api/mentee/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { name, profilePicture, bio, interests, skills, education, goals, location } = req.body;
    
    // Check if profile exists
    const existing = await pool.query(
      'SELECT id FROM mentee_profiles WHERE user_id = $1',
      [userId]
    );
    
    if (existing.rows.length === 0) {
      // Create new profile
      await pool.query(
        'INSERT INTO mentee_profiles (user_id, name, profile_picture, bio, interests, skills, education, goals, location) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)',
        [userId, name, profilePicture, bio, JSON.stringify(interests || []), JSON.stringify(skills || []), JSON.stringify(education || []), goals, location]
      );
    } else {
      // Update existing profile
      await pool.query(
        'UPDATE mentee_profiles SET name = $1, profile_picture = $2, bio = $3, interests = $4, skills = $5, education = $6, goals = $7, location = $8, updated_at = NOW() WHERE user_id = $9',
        [name, profilePicture, bio, JSON.stringify(interests || []), JSON.stringify(skills || []), JSON.stringify(education || []), goals, location, userId]
      );
    }
    
    res.json({ message: 'Profile saved successfully' });
  } catch (error) {
    console.error('Save mentee profile error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Statistics endpoints - Optimized
app.get('/api/mentor/stats/:mentorId', async (req, res) => {
  try {
    const { mentorId } = req.params;
    const cacheKey = `mentor_stats_${mentorId}`;
    const cached = getFromCache(cacheKey, 120000); // 2 minute cache for stats
    if (cached) {
      return res.json(cached);
    }
    
    // Separate queries to avoid complex subquery issues
    const [sessionsResult, blogsResult, earningsResult, profileResult] = await Promise.all([
      pool.query('SELECT COUNT(*) as total, COUNT(CASE WHEN status = \'completed\' THEN 1 END) as completed, COUNT(CASE WHEN status = \'pending\' THEN 1 END) as pending FROM video_calls WHERE mentor_id = $1', [mentorId]),
      pool.query('SELECT COUNT(*) as total FROM blogs WHERE mentor_id = $1', [mentorId]),
      pool.query('SELECT COALESCE(SUM(amount), 0) as total FROM mentor_earnings WHERE mentor_id = $1', [mentorId]),
      pool.query('SELECT name, bio, profile_picture, education, skills, background, interests FROM mentor_profiles WHERE user_id = $1', [mentorId])
    ]);
    
    const sessions = sessionsResult.rows[0];
    const blogs = blogsResult.rows[0];
    const earnings = earningsResult.rows[0];
    const profile = profileResult.rows[0];
    
    let profileCompletion = 25; // Default
    
    if (profile) {
      let completed = 0;
      if (profile.name) completed++;
      if (profile.bio) completed++;
      if (profile.profile_picture) completed++;
      if (profile.education && Array.isArray(profile.education) && profile.education.length > 0) completed++;
      if (profile.skills && Array.isArray(profile.skills) && profile.skills.length > 0) completed++;
      if (profile.background && Array.isArray(profile.background) && profile.background.length > 0) completed++;
      if (profile.interests) completed++;
      profileCompletion = Math.round((completed / 7) * 100);
    }
    
    const statsData = {
      totalSessions: parseInt(sessions.total) || 0,
      completedSessions: parseInt(sessions.completed) || 0,
      pendingSessions: parseInt(sessions.pending) || 0,
      totalBlogs: parseInt(blogs.total) || 0,
      walletBalance: parseFloat(earnings.total) || 0,
      profileCompletion
    };
    
    setCache(cacheKey, statsData, 120000);
    res.json(statsData);
  } catch (error) {
    console.error('Get mentor stats error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

app.get('/api/mentee/stats/:menteeId', async (req, res) => {
  try {
    const { menteeId } = req.params;
    const cacheKey = `mentee_stats_${menteeId}`;
    const cached = getFromCache(cacheKey, 120000); // 2 minute cache
    if (cached) {
      return res.json(cached);
    }
    
    // Single optimized query for all stats
    const result = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM mentor_profiles mp JOIN users u ON mp.user_id = u.id WHERE u.role = 'mentor') as available_mentors,
        (SELECT COUNT(*) FROM mentee_favorites WHERE mentee_id = $1) as favorite_mentors,
        (SELECT COUNT(CASE WHEN status = 'completed' THEN 1 END) FROM video_calls WHERE mentee_id = $1) as completed_sessions,
        (SELECT COALESCE(SUM(CASE WHEN status = 'completed' AND started_at IS NOT NULL AND ended_at IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (ended_at::timestamp - started_at::timestamp))/3600 END), 0) FROM video_calls WHERE mentee_id = $1) as hours_learned
    `, [menteeId]);
    
    const stats = result.rows[0];
    const statsData = {
      availableMentors: parseInt(stats.available_mentors) || 0,
      favoriteMentors: parseInt(stats.favorite_mentors) || 0,
      completedSessions: parseInt(stats.completed_sessions) || 0,
      hoursLearned: parseFloat(stats.hours_learned || 0).toFixed(1)
    };
    
    setCache(cacheKey, statsData, 120000);
    res.json(statsData);
  } catch (error) {
    console.error('Get mentee stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Data migration endpoint to fix mentor interests format
app.post('/api/admin/migrate-interests', async (req, res) => {
  try {
    const mentorsResult = await pool.query('SELECT user_id, interests FROM mentor_profiles WHERE interests IS NOT NULL');
    
    const interestTags = {
      placement: ['DSA', 'Frontend Development', 'Backend Development', 'Full Stack', 'Mobile Development', 'DevOps', 'Cloud Computing', 'Machine Learning', 'Data Science', 'Cybersecurity', 'System Design', 'Database Management', 'API Development', 'Testing', 'UI/UX Design', 'Product Management', 'Aptitude', 'Resume Building', 'Interview Preparation', 'Coding Practice'],
      college_reviews: ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi', 'Mumbai'],
      skills_learning: ['JavaScript', 'Python', 'Java', 'C++', 'React', 'Angular', 'Vue.js', 'Node.js', 'Spring Boot', 'Django', 'Flask', 'MongoDB', 'MySQL', 'PostgreSQL', 'AWS', 'Azure', 'Docker', 'Kubernetes', 'Git', 'Linux'],
      projects: ['Web Development', 'Mobile Apps', 'Desktop Applications', 'Game Development', 'AI/ML Projects', 'Data Analytics', 'Blockchain', 'IoT', 'AR/VR', 'E-commerce', 'Social Media', 'Healthcare', 'Education', 'Finance', 'Entertainment', 'Open Source', 'Startup Ideas', 'Research Projects', 'Hackathon Projects', 'Portfolio Projects'],
      hackathons: ['Problem Solving', 'Team Formation', 'Idea Generation', 'Prototype Development', 'Presentation Skills', 'Time Management', 'Technology Selection', 'UI/UX Design', 'Backend Development', 'Frontend Development', 'Database Design', 'API Integration', 'Deployment', 'Testing', 'Documentation', 'Pitch Preparation', 'Demo Creation', 'Judging Criteria', 'Networking', 'Post-Hackathon Steps'],
      study_help: ['Mathematics', 'Physics', 'Chemistry', 'Computer Science', 'Electronics', 'Mechanical', 'Civil Engineering', 'Electrical Engineering', 'GATE Preparation', 'JEE Preparation', 'NEET Preparation', 'CAT Preparation', 'GRE Preparation', 'TOEFL Preparation', 'IELTS Preparation', 'Semester Exams', 'Assignment Help', 'Project Reports', 'Research Papers', 'Thesis Writing']
    };
    
    let migratedCount = 0;
    
    for (const mentor of mentorsResult.rows) {
      try {
        const interestsData = typeof mentor.interests === 'string' ? JSON.parse(mentor.interests) : mentor.interests;
        
        // Check if it's a flat array that needs migration
        if (Array.isArray(interestsData) && interestsData.length > 0) {
          const interestsByCategory = {};
          const selectedCategories = [];
          
          // Group interests by categories
          Object.keys(interestTags).forEach(category => {
            const categoryTags = interestsData.filter(interest => 
              interestTags[category] && interestTags[category].includes(interest)
            );
            if (categoryTags.length > 0) {
              interestsByCategory[category] = categoryTags;
              selectedCategories.push(category);
            }
          });
          
          // Update with proper format
          const newInterestsData = {
            selectedCategories,
            interestsByCategory,
            interests: interestsData
          };
          
          await pool.query(
            'UPDATE mentor_profiles SET interests = $1 WHERE user_id = $2',
            [JSON.stringify(newInterestsData), mentor.user_id]
          );
          
          migratedCount++;
        }
      } catch (e) {
        console.error(`Failed to migrate interests for mentor ${mentor.user_id}:`, e);
      }
    }
    
    res.json({ message: `Migrated ${migratedCount} mentor profiles` });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ error: 'Migration failed' });
  }
});

// Admin endpoint to view WebRTC sessions
app.get('/api/admin/webrtc-sessions', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        ws.id,
        ws.call_id,
        vc.mentee_id,
        vc.mentor_id,
        vc.status,
        vc.created_at,
        vc.started_at,
        vc.ended_at,
        mentee.username as mentee_name,
        mentor.username as mentor_name
      FROM webrtc_sessions ws
      JOIN video_calls vc ON ws.call_id = vc.id
      JOIN users mentee ON vc.mentee_id = mentee.id
      JOIN users mentor ON vc.mentor_id = mentor.id
      ORDER BY ws.created_at DESC
      LIMIT 50
    `);
    
    res.json({ sessions: result.rows });
  } catch (error) {
    console.error('Get WebRTC sessions error:', error);
    res.status(500).json({ error: 'Failed to get WebRTC sessions' });
  }
});

// WebRTC Session Events
app.post('/api/webrtc/session/:callId/event', async (req, res) => {
  try {
    const { callId } = req.params;
    const { event, userId, data } = req.body;
    
    console.log(`WebRTC event received: ${event} for call ${callId}`);
    
    switch (event) {
      case 'session.started':
        await pool.query(
          'UPDATE video_calls SET status = $1, started_at = $2 WHERE id = $3',
          ['active', new Date().toISOString(), callId]
        );
        break;
        
      case 'session.ended':
        await pool.query(
          'UPDATE video_calls SET status = $1, ended_at = $2 WHERE id = $3',
          ['completed', new Date().toISOString(), callId]
        );
        break;
        
      case 'user.joined':
        // Notify other participants
        if (io) {
          io.to(`call_${callId}`).emit('user_joined', { userId, callId });
        }
        break;
        
      case 'user.left':
        // Notify other participants
        if (io) {
          io.to(`call_${callId}`).emit('user_left', { userId, callId });
        }
        break;
    }
    
    res.json({ message: 'Event processed successfully' });
  } catch (error) {
    console.error('WebRTC event error:', error);
    res.status(500).json({ error: 'Failed to process event' });
  }
});

app.post('/api/video-call/request', async (req, res) => {
  try {
    console.log('📞 CALL REQUEST RECEIVED:', req.body);
    const { menteeId, mentorId, channelName } = req.body;
    
    if (!menteeId || !mentorId) {
      console.error('❌ Missing required fields:', { menteeId, mentorId });
      return res.status(400).json({ error: 'Missing menteeId or mentorId' });
    }
    
    // Clean up old pending calls (older than 5 minutes)
    await pool.query(
      'UPDATE video_calls SET status = $1 WHERE mentee_id = $2 AND mentor_id = $3 AND status = $4 AND created_at < NOW() - INTERVAL \'5 minutes\'',
      ['cancelled', menteeId, mentorId, 'pending']
    );
    
    // Check for existing pending call to prevent duplicates
    const existingCall = await pool.query(
      'SELECT id FROM video_calls WHERE mentee_id = $1 AND mentor_id = $2 AND status = $3',
      [menteeId, mentorId, 'pending']
    );
    
    if (existingCall.rows.length > 0) {
      console.log('⚠️ Duplicate call request prevented');
      return res.json({ callId: existingCall.rows[0].id, message: 'Call request already exists' });
    }
    
    // Create call session with current server time
    console.log('📝 Creating call session in database...');
    const result = await pool.query(
      'INSERT INTO video_calls (mentee_id, mentor_id, channel_name, status, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [menteeId, mentorId, channelName || `call_${Date.now()}`, 'pending', new Date().toISOString()]
    );
    
    const callSession = result.rows[0];
    console.log('✅ Call session created:', callSession.id);
    
    // Get mentor and mentee details
    console.log('👥 Fetching user details...');
    const mentee = await pool.query('SELECT username FROM users WHERE id = $1', [menteeId]);
    const mentor = await pool.query('SELECT username FROM users WHERE id = $1', [mentorId]);
    
    if (mentee.rows.length === 0) {
      console.error('❌ Mentee not found:', menteeId);
      return res.status(404).json({ error: 'Mentee not found' });
    }
    if (mentor.rows.length === 0) {
      console.error('❌ Mentor not found:', mentorId);
      return res.status(404).json({ error: 'Mentor not found' });
    }
    
    console.log('👤 Mentee:', mentee.rows[0].username, '→ 👨‍🏫 Mentor:', mentor.rows[0].username);
    
    // Create notification for mentor
    console.log('📝 Creating database notification...');
    await pool.query(
      'INSERT INTO notifications (user_id, type, title, message, related_id, related_type) VALUES ($1, $2, $3, $4, $5, $6)',
      [mentorId, 'call_request', 'Video Call Request', `${mentee.rows[0].username} wants to start a video call with you`, callSession.id, 'video_call']
    );
    console.log('✅ Database notification created');
    
    // Check socket.io status
    console.log('🔌 Socket.IO status:', {
      available: !!io,
      connectedSockets: io ? io.sockets.sockets.size : 0,
      rooms: io ? Array.from(io.sockets.adapter.rooms.keys()) : []
    });
    
    // Check if mentor is in room
    const mentorRoom = `user_${mentorId}`;
    const roomExists = io ? io.sockets.adapter.rooms.has(mentorRoom) : false;
    const roomSize = io ? (io.sockets.adapter.rooms.get(mentorRoom)?.size || 0) : 0;
    
    console.log(`🏠 Mentor room ${mentorRoom}:`, {
      exists: roomExists,
      size: roomSize,
      allRooms: io ? Array.from(io.sockets.adapter.rooms.keys()).filter(r => r.startsWith('user_')) : []
    });
    
    // Clear cache to ensure immediate updates
    clearCachePattern(`user_calls_${mentorId}`);
    clearCachePattern(`user_calls_${menteeId}`);
    clearCachePattern(`notifications_${mentorId}`);
    
    // Send real-time notification to mentor
    console.log(`📞 Sending call_request to mentor ${mentorId} in room ${mentorRoom}`);
    if (io) {
      const eventData = {
        callId: callSession.id,
        menteeId,
        menteeName: mentee.rows[0].username,
        channelName: callSession.channel_name,
        message: `${mentee.rows[0].username} wants to start a video call with you`
      };
      console.log('📤 Event data:', eventData);
      
      io.to(mentorRoom).emit('call_request', eventData);
      console.log(`✅ Call request notification sent to mentor ${mentorId}`);
      
      // Also emit to all connected sockets as backup
      io.emit('global_call_request', { ...eventData, targetMentorId: mentorId });
      console.log('📡 Global backup notification sent');
    } else {
      console.error('❌ Socket.IO not available for real-time notification');
    }
    
    res.json({ callId: callSession.id, message: 'Call request sent' });
  } catch (error) {
    console.error('❌ Call request error:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

app.post('/api/video-call/:callId/accept', async (req, res) => {
  try {
    const { callId } = req.params;
    const { mentorId } = req.body;
    
    // Get call details
    const call = await pool.query(
      'SELECT * FROM video_calls WHERE id = $1 AND mentor_id = $2',
      [callId, mentorId]
    );
    
    if (call.rows.length === 0) {
      return res.status(404).json({ error: 'Call not found or unauthorized' });
    }
    
    if (call.rows[0].status !== 'pending') {
      console.log(`Call ${callId} status is ${call.rows[0].status}, not pending`);
      return res.status(400).json({ error: `Call is not in pending status. Current status: ${call.rows[0].status}` });
    }
    
    // Update call status to accepted for WebRTC
    await pool.query(
      'UPDATE video_calls SET status = $1, accepted_at = $2 WHERE id = $3',
      ['accepted', new Date().toISOString(), callId]
    );
    
    // Get mentee details for notification
    const mentee = await pool.query(
      'SELECT username FROM users WHERE id = $1',
      [call.rows[0].mentee_id]
    );
    
    // Clear cache to ensure immediate updates
    clearCachePattern(`user_calls_${mentorId}`);
    clearCachePattern(`user_calls_${call.rows[0].mentee_id}`);
    clearCachePattern(`notifications_${call.rows[0].mentee_id}`);
    
    // Create notification for mentee
    if (mentee.rows.length > 0) {
      await pool.query(
        'INSERT INTO notifications (user_id, type, title, message, related_id, related_type) VALUES ($1, $2, $3, $4, $5, $6)',
        [call.rows[0].mentee_id, 'call_accepted', 'Call Accepted', 'Your video call request has been accepted. You can now join the session.', callId, 'video_call']
      );
    }
    
    // Send real-time notification to mentee
    console.log(`✅ Sending call_accepted to mentee ${call.rows[0].mentee_id} in room user_${call.rows[0].mentee_id}`);
    if (io) {
      io.to(`user_${call.rows[0].mentee_id}`).emit('call_accepted', {
        callId,
        channelName: call.rows[0].channel_name,
        message: 'Your call has been accepted'
      });
      console.log(`✅ Call accepted notification sent to mentee ${call.rows[0].mentee_id}`);
    } else {
      console.error('❌ Socket.IO not available for real-time notification');
    }
    
    res.json({ 
      message: 'Call accepted successfully',
      callId,
      status: 'accepted'
    });
  } catch (error) {
    console.error('Accept call error:', error);
    res.status(500).json({ error: 'Failed to accept call' });
  }
});

app.post('/api/video-call/:callId/reject', async (req, res) => {
  try {
    const { callId } = req.params;
    const { mentorId } = req.body;
    
    // Update call status
    await pool.query(
      'UPDATE video_calls SET status = $1, ended_at = $2 WHERE id = $3 AND mentor_id = $4',
      ['rejected', new Date().toISOString(), callId, mentorId]
    );
    
    // Get call details
    const call = await pool.query(
      'SELECT mentee_id FROM video_calls WHERE id = $1',
      [callId]
    );
    
    if (call.rows.length > 0) {
      // Clear cache to ensure immediate updates
      clearCachePattern(`user_calls_${mentorId}`);
      clearCachePattern(`user_calls_${call.rows[0].mentee_id}`);
      
      // Send real-time notification to mentee
      console.log(`❌ Sending call_rejected to mentee ${call.rows[0].mentee_id}`);
      if (io) {
        io.to(`user_${call.rows[0].mentee_id}`).emit('call_rejected', {
          callId,
          message: 'Your call was rejected by the mentor'
        });
        console.log(`❌ Call rejected notification sent to mentee ${call.rows[0].mentee_id}`);
      }
    }
    
    res.json({ message: 'Call rejected' });
  } catch (error) {
    console.error('Reject call error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/video-call/:callId/start', async (req, res) => {
  try {
    const { callId } = req.params;
    const { userId, startTime } = req.body;
    
    // Check if session was already started
    const existingCall = await pool.query(
      'SELECT started_at FROM video_calls WHERE id = $1',
      [callId]
    );
    
    if (existingCall.rows.length > 0 && existingCall.rows[0].started_at) {
      // Session already started, return existing start time
      console.log(`[${new Date().toLocaleTimeString()}] Session ${callId} already started at ${existingCall.rows[0].started_at}`);
      return res.json({ 
        message: 'Session already started', 
        startTime: existingCall.rows[0].started_at 
      });
    }
    
    // Update call status to active with start time
    const startTimestamp = startTime ? new Date(startTime) : new Date();
    await pool.query(
      'UPDATE video_calls SET status = $1, started_at = $2 WHERE id = $3 AND started_at IS NULL',
      ['active', startTimestamp.toISOString(), callId]
    );
    
    // Get call participants
    const call = await pool.query(
      'SELECT mentee_id, mentor_id FROM video_calls WHERE id = $1',
      [callId]
    );
    
    if (call.rows.length > 0) {
      // Real-time notification removed for Vercel compatibility
    }
    
    // Schedule auto-end after 10 minutes
    const timeoutId = setTimeout(async () => {
      try {
        const endTime = new Date().toISOString();
        const result = await pool.query(
          'UPDATE video_calls SET status = $1, ended_at = $2 WHERE id = $3 AND status = $4 RETURNING *',
          ['completed', endTime, callId, 'active']
        );
        
        if (result.rows.length > 0) {
          console.log(`[${new Date().toLocaleTimeString()}] Auto-ended call ${callId} - Session completed after 10 minutes`);
          
          // Real-time notification removed for Vercel compatibility
        } else {
          console.log(`[${new Date().toLocaleTimeString()}] Call ${callId} was already ended`);
        }
      } catch (error) {
        console.error('Auto-end call error:', error);
      }
    }, 10 * 60 * 1000); // 10 minutes
    
    console.log(`[${new Date().toLocaleTimeString()}] Session ${callId} started - will auto-end in 10 minutes`);
    
    res.json({ message: 'Call started', startTime: startTimestamp.toISOString() });
  } catch (error) {
    console.error('Start call error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/video-call/:callId/end', async (req, res) => {
  try {
    const { callId } = req.params;
    const { userId } = req.body;
    
    // Update call status
    await pool.query(
      'UPDATE video_calls SET status = $1, ended_at = $2 WHERE id = $3',
      ['completed', new Date().toISOString(), callId]
    );
    
    // Get call participants
    const call = await pool.query(
      'SELECT mentee_id, mentor_id FROM video_calls WHERE id = $1',
      [callId]
    );
    
    if (call.rows.length > 0) {
      const otherUserId = userId === call.rows[0].mentee_id ? call.rows[0].mentor_id : call.rows[0].mentee_id;
      // Real-time notification removed for Vercel compatibility
    }
    
    res.json({ message: 'Call ended' });
  } catch (error) {
    console.error('End call error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/video-call/:callId/status', async (req, res) => {
  try {
    const { callId } = req.params;
    
    const result = await pool.query(
      'SELECT * FROM video_calls WHERE id = $1',
      [callId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    res.json({ call: result.rows[0] });
  } catch (error) {
    console.error('Get call status error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/video-calls/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const cacheKey = `user_calls_${userId}`;
    const cached = getFromCache(cacheKey, 30000); // 30 second cache for faster updates
    if (cached) {
      return res.json({ calls: cached });
    }
    
    const result = await pool.query(`
      SELECT vc.id, vc.status, vc.created_at, vc.accepted_at, vc.started_at, vc.ended_at, vc.channel_name,
             vc.payment_confirmed, vc.payment_amount, vc.payment_id,
             mentee.username as mentee_name,
             mentor.username as mentor_name
      FROM video_calls vc
      JOIN users mentee ON vc.mentee_id = mentee.id
      JOIN users mentor ON vc.mentor_id = mentor.id
      WHERE vc.mentee_id = $1 OR vc.mentor_id = $1
      ORDER BY vc.created_at DESC
      LIMIT 15
    `, [userId]);
    
    setCache(cacheKey, result.rows, 30000); // 30 second cache
    res.json({ calls: result.rows });
  } catch (error) {
    console.error('Get user calls error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete('/api/video-call/:callId', async (req, res) => {
  try {
    const { callId } = req.params;
    
    await pool.query(
      'DELETE FROM video_calls WHERE id = $1',
      [callId]
    );
    
    res.json({ message: 'Session deleted successfully' });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Socket.IO connection handling for all users
io.on('connection', (socket) => {
  console.log(`[${new Date().toLocaleTimeString()}] Socket connected: ${socket.id}`);
  
  socket.on('join_user_room', (userId) => {
    const roomName = `user_${userId}`;
    socket.join(roomName);
    const roomSize = io.sockets.adapter.rooms.get(roomName)?.size || 0;
    console.log(`[${new Date().toLocaleTimeString()}] 🏠 User ${userId} joined room: ${roomName} (${roomSize} members)`);
    console.log(`📋 All user rooms:`, Array.from(io.sockets.adapter.rooms.keys()).filter(r => r.startsWith('user_')));
    
    // Send confirmation back to client
    socket.emit('user_room_joined', {
      userId,
      roomName,
      success: true,
      timestamp: new Date().toISOString()
    });
  });
  
  socket.on('join_call', (callId) => {
    socket.join(`call_${callId}`);
    const roomSize = io.sockets.adapter.rooms.get(`call_${callId}`)?.size || 0;
    console.log(`[${new Date().toLocaleTimeString()}] 📞 User joined call room: call_${callId} (${roomSize} participants)`);
    
    // Send confirmation back to the user who joined
    socket.emit('room_joined', {
      callId,
      room: `call_${callId}`,
      participantCount: roomSize
    });
    
    // Notify others in the room
    socket.to(`call_${callId}`).emit('participant_joined', {
      callId,
      participantCount: roomSize
    });
  });
  
  socket.on('leave_call', (callId) => {
    socket.leave(`call_${callId}`);
    const roomSize = io.sockets.adapter.rooms.get(`call_${callId}`)?.size || 0;
    console.log(`[${new Date().toLocaleTimeString()}] 🚪 User left call room: call_${callId} (${roomSize} participants)`);
  });
  
  // WebRTC signaling events with detailed logging
  socket.on('offer', (data) => {
    const roomSize = io.sockets.adapter.rooms.get(`call_${data.callId}`)?.size || 0;
    const roomMembers = Array.from(io.sockets.adapter.rooms.get(`call_${data.callId}`) || []);
    console.log(`📤 Relaying OFFER from ${data.role} (${data.from}) for call ${data.callId}`);
    console.log(`🏠 Room call_${data.callId}: ${roomSize} members:`, roomMembers);
    console.log(`📦 Offer data:`, { callId: data.callId, from: data.from, role: data.role, hasOffer: !!data.offer });
    
    // Send to room
    socket.to(`call_${data.callId}`).emit('offer', data);
    console.log(`✅ Offer relayed to ${roomSize-1} other participants in room`);
    
    // Also broadcast to all sockets as backup
    socket.broadcast.emit('global_offer', data);
    console.log(`📡 Global offer backup sent`);
  });
  
  socket.on('answer', (data) => {
    const roomSize = io.sockets.adapter.rooms.get(`call_${data.callId}`)?.size || 0;
    console.log(`📤 Relaying ANSWER from ${data.role} (${data.from}) for call ${data.callId} to ${roomSize-1} other participants`);
    socket.to(`call_${data.callId}`).emit('answer', data);
  });
  
  socket.on('ice_candidate', (data) => {
    console.log(`🧊 Relaying ICE candidate from ${data.role} (${data.from}) for call ${data.callId}`);
    socket.to(`call_${data.callId}`).emit('ice_candidate', data);
  });
  
  // Chat and timer sync with logging
  socket.on('chat_message', (data) => {
    console.log(`💬 Relaying chat message from ${data.role} (${data.from}) for call ${data.callId}`);
    socket.to(`call_${data.callId}`).emit('chat_message', data);
  });
  
  socket.on('timer_sync', (data) => {
    console.log(`⏱️ Relaying timer sync from ${data.role} (${data.from}) for call ${data.callId}: ${data.timeLeft}s`);
    socket.to(`call_${data.callId}`).emit('timer_sync', data);
  });
  
  // Legacy WebRTC events (for backward compatibility)
  socket.on('webrtc_offer', (data) => {
    socket.to(`call_${data.callId}`).emit('webrtc_offer', data);
  });
  
  socket.on('webrtc_answer', (data) => {
    socket.to(`call_${data.callId}`).emit('webrtc_answer', data);
  });
  
  socket.on('webrtc_ice_candidate', (data) => {
    socket.to(`call_${data.callId}`).emit('webrtc_ice_candidate', data);
  });
  
  // Call management events
  socket.on('call_message', (data) => {
    io.to(`call_${data.callId}`).emit('call_message', data);
  });
  
  socket.on('timer_sync', (data) => {
    socket.to(`call_${data.callId}`).emit('timer_sync', data);
  });
  
  socket.on('session_started', (data) => {
    socket.to(`call_${data.callId}`).emit('session_started', data);
  });
  
  socket.on('user_joined', (data) => {
    socket.to(`call_${data.callId}`).emit('user_joined', data);
  });
  
  socket.on('user_left', (data) => {
    socket.to(`call_${data.callId}`).emit('user_left', data);
  });
  
  socket.on('force_end_call', (data) => {
    socket.to(`call_${data.callId}`).emit('force_end_call', data);
  });
  
  socket.on('disconnect', () => {
    console.log(`[${new Date().toLocaleTimeString()}] Socket disconnected: ${socket.id}`);
    console.log(`📋 Remaining connections: ${io.sockets.sockets.size}`);
    console.log(`📋 Active rooms:`, Array.from(io.sockets.adapter.rooms.keys()));
  });
});



// For Vercel serverless functions
if (process.env.VERCEL !== '1') {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Get mentor booking requests
app.get('/api/mentor/:mentorId/booking-requests', async (req, res) => {
  try {
    const { mentorId } = req.params;
    
    const result = await pool.query(`
      SELECT vc.id, vc.created_at, vc.payment_amount, u.username as mentee_name
      FROM video_calls vc
      JOIN users u ON vc.mentee_id = u.id
      WHERE vc.mentor_id = $1 AND vc.status = 'pending'
      ORDER BY vc.created_at DESC
    `, [mentorId]);
    
    res.json({ requests: result.rows });
  } catch (error) {
    console.error('Get mentor booking requests error:', error);
    res.status(500).json({ error: 'Failed to get booking requests' });
  }
});

// Get payments history for a mentee
app.get('/api/payments/mentee/:menteeId', async (req, res) => {
  try {
    const { menteeId } = req.params;
    const result = await pool.query(`
      SELECT p.id, p.booking_id, p.razorpay_order_id, p.razorpay_payment_id, p.amount, p.status, p.created_at, b.session_fee, b.scheduled_time, b.status as booking_status
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      WHERE p.user_id = $1
      ORDER BY p.created_at DESC
      LIMIT 100
    `, [menteeId]);

    res.json({ payments: result.rows });
  } catch (error) {
    console.error('Get mentee payments error:', error);
    res.status(500).json({ error: 'Failed to get mentee payments' });
  }
});

// Get payments history for a mentor
app.get('/api/payments/mentor/:mentorId', async (req, res) => {
  try {
    const { mentorId } = req.params;
    const result = await pool.query(`
      SELECT p.id, p.booking_id, p.razorpay_order_id, p.razorpay_payment_id, p.amount, p.mentor_amount, p.platform_fee, p.status, p.created_at, b.mentee_id, b.session_fee, b.scheduled_time, b.status as booking_status
      FROM payments p
      JOIN bookings b ON p.booking_id = b.id
      WHERE p.mentor_id = $1
      ORDER BY p.created_at DESC
      LIMIT 100
    `, [mentorId]);

    res.json({ payments: result.rows });
  } catch (error) {
    console.error('Get mentor payments error:', error);
    res.status(500).json({ error: 'Failed to get mentor payments' });
  }
});

// Get pending pay-requests for a mentee (accepted bookings that require payment)
app.get('/api/mentee/:menteeId/pay-requests', async (req, res) => {
  try {
    const { menteeId } = req.params;
    const result = await pool.query(`
      SELECT b.id as booking_id, b.mentor_id, b.session_fee, b.scheduled_time, b.status, u.username as mentor_name
      FROM bookings b
      JOIN users u ON b.mentor_id = u.id
      WHERE b.mentee_id = $1 AND b.status = 'accepted' AND (b.payment_status IS NULL OR b.payment_status != 'paid')
      ORDER BY b.accepted_at DESC
    `, [menteeId]);

    res.json({ requests: result.rows });
  } catch (error) {
    console.error('Get mentee pay-requests error:', error);
    res.status(500).json({ error: 'Failed to get pay requests' });
  }
});

// Payment status endpoint (matches frontend expectation)
app.get('/api/bookings/:id/payment-status', async (req, res) => {
  try {
    const bookingId = req.params.id;
    const result = await pool.query(
      `SELECT status, payment_confirmed, payment_amount, payment_id, 
              mentee_id, mentor_id, channel_name 
       FROM video_calls WHERE id = $1`,
      [bookingId]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Booking not found' });
    }
    
    const booking = result.rows[0];
    const callAllowed = booking.status === 'accepted' && booking.payment_confirmed;
    const requiresPayment = booking.status === 'accepted' && !booking.payment_confirmed;
    
    res.json({
      bookingId,
      status: booking.status,
      paymentStatus: booking.payment_confirmed ? 'paid' : 'pending',
      callAllowed,
      requiresPayment,
      paymentAmount: booking.payment_amount,
      paymentId: booking.payment_id,
      canJoin: callAllowed,
      paymentConfirmed: booking.payment_confirmed
    });
  } catch (error) {
    console.error('Get payment status error:', error);
    res.status(500).json({ error: 'Failed to get payment status' });
  }
});

// Test environment variables endpoint
app.get('/api/test-env', (req, res) => {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  
  res.json({
    hasRazorpayKeys: !!(keyId && keySecret),
    keyIdType: typeof keyId,
    keySecretType: typeof keySecret,
    keyIdLength: keyId?.length,
    keyStartsCorrect: keyId?.startsWith('rzp_'),
    secretLength: keySecret?.length,
    keyIdFirst8: keyId?.substring(0, 8),
    keyIdValue: keyId === 'true' ? 'BOOLEAN_TRUE_DETECTED' : 'STRING_VALUE',
    environmentCheck: {
      nodeEnv: process.env.NODE_ENV,
      port: process.env.PORT,
      hasDatabase: !!process.env.DATABASE_URL
    }
  });
});

// Export the Express app for Vercel
module.exports = (req, res) => {
  return app(req, res);
};