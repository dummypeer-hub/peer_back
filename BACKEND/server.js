const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const mailjet = require('node-mailjet').apiConnect(
  process.env.MAILJET_API_KEY,
  process.env.MAILJET_SECRET_KEY
);
const rateLimit = require('express-rate-limit');
const axios = require('axios');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
app.set('trust proxy', 1); // Trust Railway proxy
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST']
  }
});
const PORT = process.env.PORT || 3000;

// Zoom configuration
const ZOOM_CLIENT_ID = process.env.ZOOM_CLIENT_ID;
const ZOOM_CLIENT_SECRET = process.env.ZOOM_CLIENT_SECRET;
const ZOOM_REDIRECT_URI = process.env.ZOOM_REDIRECT_URI;

// Simple in-memory cache
const cache = new Map();
const CACHE_TTL = 15 * 60 * 1000; // 15 minutes for better performance

const getFromCache = (key) => {
  const item = cache.get(key);
  if (item && Date.now() - item.timestamp < CACHE_TTL) {
    return item.data;
  }
  cache.delete(key);
  return null;
};

const setCache = (key, data) => {
  cache.set(key, { data, timestamp: Date.now() });
};

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

// Mailjet email service

// Test database connection and create tables
pool.connect(async (err, client, release) => {
  if (err) {
    console.error('Database connection error:', err.stack);
  } else {
    console.log('Database connected successfully');
    
    // Create video_calls and zoom_tokens tables
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS video_calls (
          id SERIAL PRIMARY KEY,
          mentee_id INTEGER NOT NULL REFERENCES users(id),
          mentor_id INTEGER NOT NULL REFERENCES users(id),
          channel_name VARCHAR(255),
          zoom_meeting_id VARCHAR(255),
          join_url TEXT,
          start_url TEXT,
          status VARCHAR(50) DEFAULT 'pending',
          created_at TIMESTAMP DEFAULT NOW(),
          accepted_at TIMESTAMP,
          started_at TIMESTAMP,
          ended_at TIMESTAMP,
          duration_minutes INTEGER,
          CONSTRAINT valid_status CHECK (status IN ('pending', 'accepted', 'rejected', 'active', 'completed', 'cancelled'))
        );
        
        CREATE TABLE IF NOT EXISTS zoom_tokens (
          id SERIAL PRIMARY KEY,
          mentor_id INTEGER NOT NULL REFERENCES users(id) UNIQUE,
          access_token TEXT NOT NULL,
          refresh_token TEXT NOT NULL,
          zoom_email VARCHAR(255),
          zoom_user_id VARCHAR(255),
          connected_at TIMESTAMP,
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
        
        CREATE TABLE IF NOT EXISTS session_feedback (
          id SERIAL PRIMARY KEY,
          session_id INTEGER NOT NULL REFERENCES video_calls(id),
          mentee_id INTEGER NOT NULL REFERENCES users(id),
          mentor_id INTEGER NOT NULL REFERENCES users(id),
          rating INTEGER CHECK (rating >= 1 AND rating <= 5),
          feedback TEXT,
          created_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_video_calls_mentor_id ON video_calls(mentor_id);
        CREATE INDEX IF NOT EXISTS idx_video_calls_mentee_id ON video_calls(mentee_id);
        CREATE INDEX IF NOT EXISTS idx_video_calls_status ON video_calls(status);
        CREATE INDEX IF NOT EXISTS idx_zoom_tokens_mentor_id ON zoom_tokens(mentor_id);
        CREATE INDEX IF NOT EXISTS idx_mentee_profiles_user_id ON mentee_profiles(user_id);
        CREATE INDEX IF NOT EXISTS idx_mentor_earnings_mentor_id ON mentor_earnings(mentor_id);
        CREATE INDEX IF NOT EXISTS idx_session_feedback_session_id ON session_feedback(session_id);
      `);
      console.log('Video calls and Zoom tokens tables created/verified successfully');
    } catch (tableError) {
      console.error('Error creating video_calls table:', tableError);
    }
    
    release();
  }
});

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Increased limit for development
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(cors({
  origin: ['https://peerverse-final.vercel.app', 'http://localhost:3000', 'http://localhost:3001'],
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
// Apply rate limiter only to auth routes
app.use('/api/login', limiter);
app.use('/api/signup', limiter);
app.use('/api/verify-login', limiter);
app.use('/api/verify-signup', limiter);

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'PeerSync Backend is running!' });
});

// Generate OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Send OTP email
const sendOTPEmail = async (email, otp, purpose) => {
  const subject = purpose === 'signup' ? 'PeerSync - Email Verification' : 
                  purpose === 'login' ? 'PeerSync - Login Verification' : 
                  'PeerSync - Password Reset';
  
  const html = `
    <h2>PeerSync ${purpose === 'signup' ? 'Email Verification' : purpose === 'login' ? 'Login Verification' : 'Password Reset'}</h2>
    <p>Your OTP code is: <strong>${otp}</strong></p>
    <p>This code will expire in 10 minutes.</p>
  `;

  const request = mailjet.post('send', { version: 'v3.1' }).request({
    Messages: [
      {
        From: {
          Email: process.env.MAILJET_SENDER_EMAIL,
          Name: 'PeerSync'
        },
        To: [
          {
            Email: email
          }
        ],
        Subject: subject,
        HTMLPart: html
      }
    ]
  });
  
  await request;
};

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

    await pool.query(
      'INSERT INTO otp_codes (email, otp_code, purpose, expires_at) VALUES ($1, $2, $3, $4)',
      [email, otp, 'signup', expiresAt]
    );

    try {
      await sendOTPEmail(email, otp, 'signup');
      const tempUserData = { username, email, phone, password: hashedPassword, role };
      res.json({ 
        message: 'OTP sent to email. Please verify to complete signup.',
        tempUserId: Buffer.from(JSON.stringify(tempUserData)).toString('base64')
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      res.status(500).json({ error: 'Failed to send OTP email. Please try again.' });
    }
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

// Verify signup OTP
app.post('/api/verify-signup', async (req, res) => {
  try {
    const { otp, tempUserId } = req.body;
    const userData = JSON.parse(Buffer.from(tempUserId, 'base64').toString());

    const otpResult = await pool.query(
      'SELECT * FROM otp_codes WHERE email = $1 AND otp_code = $2 AND purpose = $3 AND expires_at > NOW() AND is_used = FALSE',
      [userData.email, otp, 'signup']
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Create user
    const result = await pool.query(
      'INSERT INTO users (username, email, phone, password_hash, role, is_verified) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, email, role',
      [userData.username, userData.email, userData.phone, userData.password, userData.role, true]
    );

    // Mark OTP as used
    await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE id = $1', [otpResult.rows[0].id]);

    const token = jwt.sign(
      { userId: result.rows[0].id, role: result.rows[0].role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Signup successful',
      token,
      user: result.rows[0]
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { email, password, role } = req.body;

    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1 AND role = $2 AND is_verified = TRUE',
      [email, role]
    );

    if (result.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const isValidPassword = await bcrypt.compare(password, user.password_hash);

    if (!isValidPassword) {
      return res.status(400).json({ error: 'Invalid credentials' });
    }

    // Generate and send login OTP
    const otp = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await pool.query(
      'INSERT INTO otp_codes (email, otp_code, purpose, expires_at) VALUES ($1, $2, $3, $4)',
      [user.email, otp, 'login', expiresAt]
    );

    try {
      await sendOTPEmail(user.email, otp, 'login');
      res.json({
        message: 'OTP sent to email for verification',
        userId: user.id
      });
    } catch (emailError) {
      console.error('Email sending failed:', emailError);
      res.status(500).json({ error: 'Failed to send OTP email. Please try again.' });
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Verify login OTP
app.post('/api/verify-login', async (req, res) => {
  try {
    const { otp, userId } = req.body;

    const user = await pool.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (user.rows.length === 0) {
      return res.status(400).json({ error: 'User not found' });
    }

    const otpResult = await pool.query(
      'SELECT * FROM otp_codes WHERE email = $1 AND otp_code = $2 AND purpose = $3 AND expires_at > NOW() AND is_used = FALSE',
      [user.rows[0].email, otp, 'login']
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired OTP' });
    }

    // Mark OTP as used
    await pool.query('UPDATE otp_codes SET is_used = TRUE WHERE id = $1', [otpResult.rows[0].id]);

    const token = jwt.sign(
      { userId: user.rows[0].id, role: user.rows[0].role },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.rows[0].id,
        username: user.rows[0].username,
        email: user.rows[0].email,
        role: user.rows[0].role
      }
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Server error' });
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

    await sendOTPEmail(email, otp, 'reset');

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

// Mentor Profile endpoints
app.get('/api/mentor/profile/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Use a single optimized query
    const result = await pool.query(
      'SELECT * FROM mentor_profiles WHERE user_id = $1',
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
        console.error('Error parsing interests:', e);
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

// Get all mentors for mentee dashboard
app.get('/api/mentors', async (req, res) => {
  try {
    const cacheKey = 'mentors_list';
    const cached = getFromCache(cacheKey);
    if (cached) {
      return res.json({ mentors: cached });
    }
    
    const result = await pool.query(
      'SELECT mp.*, u.username, u.email FROM mentor_profiles mp JOIN users u ON mp.user_id = u.id WHERE u.role = $1 AND mp.name IS NOT NULL AND mp.name != \'\'',
      ['mentor']
    );
    
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
        } else if (interestsData.selectedCategories && Array.isArray(interestsData.interests)) {
          // Group flat interests by categories
          selectedCategories = interestsData.selectedCategories;
          const interestTags = {
            placement: ['DSA', 'Frontend Development', 'Backend Development', 'Full Stack', 'Mobile Development', 'DevOps', 'Cloud Computing', 'Machine Learning', 'Data Science', 'Cybersecurity', 'System Design', 'Database Management', 'API Development', 'Testing', 'UI/UX Design', 'Product Management', 'Aptitude', 'Resume Building', 'Interview Preparation', 'Coding Practice'],
            college_reviews: ['Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal', 'Delhi', 'Mumbai'],
            skills_learning: ['JavaScript', 'Python', 'Java', 'C++', 'React', 'Angular', 'Vue.js', 'Node.js', 'Spring Boot', 'Django', 'Flask', 'MongoDB', 'MySQL', 'PostgreSQL', 'AWS', 'Azure', 'Docker', 'Kubernetes', 'Git', 'Linux'],
            projects: ['Web Development', 'Mobile Apps', 'Desktop Applications', 'Game Development', 'AI/ML Projects', 'Data Analytics', 'Blockchain', 'IoT', 'AR/VR', 'E-commerce', 'Social Media', 'Healthcare', 'Education', 'Finance', 'Entertainment', 'Open Source', 'Startup Ideas', 'Research Projects', 'Hackathon Projects', 'Portfolio Projects'],
            hackathons: ['Problem Solving', 'Team Formation', 'Idea Generation', 'Prototype Development', 'Presentation Skills', 'Time Management', 'Technology Selection', 'UI/UX Design', 'Backend Development', 'Frontend Development', 'Database Design', 'API Integration', 'Deployment', 'Testing', 'Documentation', 'Pitch Preparation', 'Demo Creation', 'Judging Criteria', 'Networking', 'Post-Hackathon Steps'],
            study_help: ['Mathematics', 'Physics', 'Chemistry', 'Computer Science', 'Electronics', 'Mechanical', 'Civil Engineering', 'Electrical Engineering', 'GATE Preparation', 'JEE Preparation', 'NEET Preparation', 'CAT Preparation', 'GRE Preparation', 'TOEFL Preparation', 'IELTS Preparation', 'Semester Exams', 'Assignment Help', 'Project Reports', 'Research Papers', 'Thesis Writing']
          };
          
          selectedCategories.forEach(category => {
            const categoryTags = interestsData.interests.filter(interest => 
              interestTags[category] && interestTags[category].includes(interest)
            );
            if (categoryTags.length > 0) {
              interestsByCategory[category] = categoryTags;
            }
          });
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
        rating: 4.8, // Default rating
        reviewCount: Math.floor(Math.random() * 50) + 10 // Random review count for demo
      };
    });
    
    setCache(cacheKey, mentors);
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

// Blog endpoints
app.get('/api/blogs', async (req, res) => {
  try {
    const cacheKey = 'all_blogs';
    const cached = getFromCache(cacheKey);
    if (cached) {
      return res.json({ blogs: cached });
    }
    
    const result = await pool.query(`
      SELECT b.*, u.username as mentor_name, mp.name as mentor_display_name, mp.profile_picture as mentor_avatar
      FROM blogs b 
      JOIN users u ON b.mentor_id = u.id 
      LEFT JOIN mentor_profiles mp ON b.mentor_id = mp.user_id
      WHERE b.is_published = true 
      ORDER BY b.created_at DESC
    `);
    
    const blogs = result.rows.map(blog => ({
      ...blog,
      mentor_name: blog.mentor_display_name || blog.mentor_name,
      images: blog.images || [],
      tags: blog.tags || []
    }));
    
    setCache(cacheKey, blogs);
    res.json({ blogs });
  } catch (error) {
    console.error('Get blogs error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/blogs/mentor/:mentorId', async (req, res) => {
  try {
    const { mentorId } = req.params;
    const result = await pool.query(
      'SELECT * FROM blogs WHERE mentor_id = $1 ORDER BY created_at DESC',
      [mentorId]
    );
    
    const blogs = result.rows.map(blog => ({
      ...blog,
      images: blog.images || [],
      tags: blog.tags || []
    }));
    
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

// Notifications
app.get('/api/notifications/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const result = await pool.query(
      'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50',
      [userId]
    );
    
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

// Community endpoints
app.get('/api/communities', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT c.*, u.username as mentor_name, mp.name as mentor_display_name
      FROM communities c
      JOIN users u ON c.mentor_id = u.id
      LEFT JOIN mentor_profiles mp ON c.mentor_id = mp.user_id
      WHERE c.is_active = true
      ORDER BY c.created_at DESC
    `);
    
    const communities = result.rows.map(community => ({
      ...community,
      mentor_name: community.mentor_display_name || community.mentor_name
    }));
    
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

// Zoom OAuth endpoints
app.get('/api/zoom/auth-url', (req, res) => {
  console.log('Zoom credentials check:', {
    clientId: ZOOM_CLIENT_ID ? 'SET' : 'UNDEFINED',
    clientSecret: ZOOM_CLIENT_SECRET ? 'SET' : 'UNDEFINED',
    redirectUri: ZOOM_REDIRECT_URI ? 'SET' : 'UNDEFINED'
  });
  
  if (!ZOOM_CLIENT_ID || !ZOOM_CLIENT_SECRET) {
    return res.status(500).json({ 
      error: 'Zoom credentials not configured properly',
      details: {
        clientId: !ZOOM_CLIENT_ID ? 'Missing ZOOM_CLIENT_ID' : 'OK',
        clientSecret: !ZOOM_CLIENT_SECRET ? 'Missing ZOOM_CLIENT_SECRET' : 'OK'
      }
    });
  }
  
  // Use dynamic redirect URI based on request origin
  const origin = req.get('origin') || req.get('referer')?.split('/').slice(0, 3).join('/') || 'https://peerverse-final.vercel.app';
  const dynamicRedirectUri = `${origin}/zoom/callback`;
  
  const scopes = 'meeting:write:meeting meeting:read:meeting user:read:user';
  const authUrl = `https://zoom.us/oauth/authorize?response_type=code&client_id=${ZOOM_CLIENT_ID}&redirect_uri=${encodeURIComponent(dynamicRedirectUri)}&scope=${encodeURIComponent(scopes)}`;
  
  console.log('Generated OAuth URL:', authUrl);
  console.log('Dynamic redirect URI:', dynamicRedirectUri);
  console.log('Request origin:', origin);
  
  res.json({ authUrl, redirectUri: dynamicRedirectUri });
});

app.post('/api/zoom/callback', async (req, res) => {
  try {
    const { code, mentorId } = req.body;
    
    // Get the same dynamic redirect URI used in auth
    const origin = req.get('origin') || req.get('referer')?.split('/').slice(0, 3).join('/') || 'https://peerverse-final.vercel.app';
    const dynamicRedirectUri = `${origin}/zoom/callback`;
    
    console.log('Token exchange - using redirect URI:', dynamicRedirectUri);
    
    // Exchange code for access token
    const tokenResponse = await axios.post('https://zoom.us/oauth/token', {
      grant_type: 'authorization_code',
      code,
      redirect_uri: dynamicRedirectUri
    }, {
      auth: {
        username: ZOOM_CLIENT_ID,
        password: ZOOM_CLIENT_SECRET
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    
    const { access_token, refresh_token } = tokenResponse.data;
    
    // Get Zoom user info for admin tracking
    const userInfoResponse = await axios.get('https://api.zoom.us/v2/users/me', {
      headers: {
        'Authorization': `Bearer ${access_token}`
      }
    });
    
    const zoomUserInfo = userInfoResponse.data;
    
    // Store tokens and user info for mentor
    await pool.query(
      'INSERT INTO zoom_tokens (mentor_id, access_token, refresh_token, zoom_email, zoom_user_id, connected_at) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (mentor_id) DO UPDATE SET access_token = $2, refresh_token = $3, zoom_email = $4, zoom_user_id = $5, updated_at = NOW()',
      [mentorId, access_token, refresh_token, zoomUserInfo.email, zoomUserInfo.id, new Date().toISOString()]
    );
    
    // Log for admin tracking
    console.log(`[ADMIN] Mentor ${mentorId} connected Zoom account: ${zoomUserInfo.email}`);
    
    res.json({ 
      message: 'Zoom account connected successfully',
      zoomEmail: zoomUserInfo.email
    });
  } catch (error) {
    console.error('Zoom OAuth error:', error);
    res.status(500).json({ error: 'Failed to connect Zoom account' });
  }
});

app.post('/api/zoom/create-meeting', async (req, res) => {
  try {
    const { mentorId, topic } = req.body;
    
    // Get mentor's Zoom token
    const tokenResult = await pool.query(
      'SELECT access_token FROM zoom_tokens WHERE mentor_id = $1',
      [mentorId]
    );
    
    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ error: 'Mentor has not connected Zoom account' });
    }
    
    const accessToken = tokenResult.rows[0].access_token;
    
    // Create Zoom meeting
    const meetingResponse = await axios.post('https://api.zoom.us/v2/users/me/meetings', {
      topic: topic || 'PeerSync Mentorship Session',
      type: 1, // Instant meeting
      duration: 10, // 10 minutes
      settings: {
        host_video: true,
        participant_video: true,
        join_before_host: false,
        mute_upon_entry: true,
        waiting_room: false,
        auto_recording: 'none'
      }
    }, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    const meeting = meetingResponse.data;
    
    // Schedule meeting end after 10 minutes
    setTimeout(async () => {
      try {
        await axios.patch(`https://api.zoom.us/v2/meetings/${meeting.id}/status`, {
          action: 'end'
        }, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        });
        console.log(`Meeting ${meeting.id} ended after 10 minutes`);
      } catch (error) {
        console.error('Failed to end meeting:', error);
      }
    }, 10 * 60 * 1000);
    
    res.json({
      meetingId: meeting.id,
      joinUrl: meeting.join_url,
      startUrl: meeting.start_url,
      password: meeting.password
    });
  } catch (error) {
    console.error('Create meeting error:', error);
    res.status(500).json({ error: 'Failed to create Zoom meeting' });
  }
});

app.post('/api/zoom/end-meeting', async (req, res) => {
  try {
    const { meetingId, mentorId } = req.body;
    
    if (!mentorId) {
      return res.status(400).json({ error: 'Only mentors can end meetings' });
    }
    
    // Get mentor's Zoom token
    const tokenResult = await pool.query(
      'SELECT access_token FROM zoom_tokens WHERE mentor_id = $1',
      [mentorId]
    );
    
    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ error: 'Mentor Zoom token not found' });
    }
    
    const accessToken = tokenResult.rows[0].access_token;
    
    // End Zoom meeting
    await axios.patch(`https://api.zoom.us/v2/meetings/${meetingId}/status`, {
      action: 'end'
    }, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`Meeting ${meetingId} ended via API`);
    res.json({ message: 'Meeting ended successfully' });
  } catch (error) {
    console.error('End meeting error:', error);
    res.status(500).json({ error: 'Failed to end Zoom meeting' });
  }
});

app.get('/api/zoom/status/:mentorId', async (req, res) => {
  try {
    const { mentorId } = req.params;
    
    const result = await pool.query(
      'SELECT zoom_email, connected_at, updated_at FROM zoom_tokens WHERE mentor_id = $1',
      [mentorId]
    );
    
    if (result.rows.length === 0) {
      return res.json({ connected: false });
    }
    
    const tokenData = result.rows[0];
    res.json({
      connected: true,
      zoomEmail: tokenData.zoom_email,
      connectedAt: tokenData.connected_at || tokenData.updated_at
    });
  } catch (error) {
    console.error('Check Zoom status error:', error);
    res.status(500).json({ error: 'Failed to check Zoom status' });
  }
});

app.delete('/api/zoom/disconnect/:mentorId', async (req, res) => {
  try {
    const { mentorId } = req.params;
    
    // Get mentor info for logging
    const mentorResult = await pool.query(
      'SELECT u.username, zt.zoom_email FROM users u LEFT JOIN zoom_tokens zt ON u.id = zt.mentor_id WHERE u.id = $1',
      [mentorId]
    );
    
    // Delete Zoom tokens
    await pool.query(
      'DELETE FROM zoom_tokens WHERE mentor_id = $1',
      [mentorId]
    );
    
    // Log for admin tracking
    if (mentorResult.rows.length > 0) {
      const mentor = mentorResult.rows[0];
      console.log(`[ADMIN] Mentor ${mentorId} (${mentor.username}) disconnected Zoom account: ${mentor.zoom_email}`);
    }
    
    res.json({ message: 'Zoom account disconnected successfully' });
  } catch (error) {
    console.error('Disconnect Zoom error:', error);
    res.status(500).json({ error: 'Failed to disconnect Zoom account' });
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

// Statistics endpoints
app.get('/api/mentor/stats/:mentorId', async (req, res) => {
  try {
    const { mentorId } = req.params;
    
    // Get session stats
    const sessionStats = await pool.query(`
      SELECT 
        COUNT(*) as total_sessions,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_sessions,
        COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_sessions
      FROM video_calls WHERE mentor_id = $1
    `, [mentorId]);
    
    // Get blog count
    const blogStats = await pool.query(
      'SELECT COUNT(*) as total_blogs FROM blogs WHERE mentor_id = $1',
      [mentorId]
    );
    
    // Get earnings
    const earningsStats = await pool.query(
      'SELECT COALESCE(SUM(amount), 0) as total_earnings FROM mentor_earnings WHERE mentor_id = $1',
      [mentorId]
    );
    
    // Get profile completion
    const profileStats = await pool.query(
      'SELECT * FROM mentor_profiles WHERE user_id = $1',
      [mentorId]
    );
    
    let profileCompletion = 0;
    if (profileStats.rows.length > 0) {
      const profile = profileStats.rows[0];
      let completed = 0;
      let total = 7;
      
      if (profile.name) completed++;
      if (profile.bio) completed++;
      if (profile.profile_picture) completed++;
      
      try {
        if (profile.education) {
          const education = typeof profile.education === 'string' ? JSON.parse(profile.education) : profile.education;
          if (Array.isArray(education) && education.length > 0) completed++;
        }
      } catch (e) { /* ignore */ }
      
      try {
        if (profile.skills) {
          const skills = typeof profile.skills === 'string' ? JSON.parse(profile.skills) : profile.skills;
          if (Array.isArray(skills) && skills.length > 0) completed++;
        }
      } catch (e) { /* ignore */ }
      
      try {
        if (profile.background) {
          const background = typeof profile.background === 'string' ? JSON.parse(profile.background) : profile.background;
          if (Array.isArray(background) && background.length > 0) completed++;
        }
      } catch (e) { /* ignore */ }
      
      try {
        if (profile.interests) {
          const interests = typeof profile.interests === 'string' ? JSON.parse(profile.interests) : profile.interests;
          if ((Array.isArray(interests) && interests.length > 0) || (interests && Object.keys(interests).length > 0)) completed++;
        }
      } catch (e) { /* ignore */ }
      
      profileCompletion = Math.round((completed / total) * 100);
    }
    
    res.json({
      totalSessions: parseInt(sessionStats.rows[0].total_sessions),
      completedSessions: parseInt(sessionStats.rows[0].completed_sessions),
      pendingSessions: parseInt(sessionStats.rows[0].pending_sessions),
      totalBlogs: parseInt(blogStats.rows[0].total_blogs),
      walletBalance: parseFloat(earningsStats.rows[0].total_earnings),
      profileCompletion
    });
  } catch (error) {
    console.error('Get mentor stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.get('/api/mentee/stats/:menteeId', async (req, res) => {
  try {
    const { menteeId } = req.params;
    
    // Get available mentors count
    const mentorCount = await pool.query(
      'SELECT COUNT(*) as available_mentors FROM mentor_profiles mp JOIN users u ON mp.user_id = u.id WHERE u.role = $1',
      ['mentor']
    );
    
    // Get favorite mentors count
    const favoriteCount = await pool.query(
      'SELECT COUNT(*) as favorite_mentors FROM mentee_favorites WHERE mentee_id = $1',
      [menteeId]
    );
    
    // Get completed sessions count
    const sessionStats = await pool.query(`
      SELECT 
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_sessions,
        COALESCE(SUM(CASE WHEN status = 'completed' AND started_at IS NOT NULL AND ended_at IS NOT NULL 
          THEN EXTRACT(EPOCH FROM (ended_at::timestamp - started_at::timestamp))/3600 END), 0) as hours_learned
      FROM video_calls WHERE mentee_id = $1
    `, [menteeId]);
    
    res.json({
      availableMentors: parseInt(mentorCount.rows[0].available_mentors),
      favoriteMentors: parseInt(favoriteCount.rows[0].favorite_mentors),
      completedSessions: parseInt(sessionStats.rows[0].completed_sessions),
      hoursLearned: parseFloat(sessionStats.rows[0].hours_learned || 0).toFixed(1)
    });
  } catch (error) {
    console.error('Get mentee stats error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// Admin endpoint to view all Zoom connections
app.get('/api/admin/zoom-connections', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        u.id as mentor_id,
        u.username,
        u.email as mentor_email,
        zt.zoom_email,
        zt.zoom_user_id,
        zt.connected_at,
        zt.updated_at
      FROM users u
      JOIN zoom_tokens zt ON u.id = zt.mentor_id
      WHERE u.role = 'mentor'
      ORDER BY zt.connected_at DESC
    `);
    
    res.json({ connections: result.rows });
  } catch (error) {
    console.error('Get Zoom connections error:', error);
    res.status(500).json({ error: 'Failed to get Zoom connections' });
  }
});

// Zoom webhook endpoints
app.post('/webhooks/zoom', async (req, res) => {
  try {
    const { event, payload } = req.body;
    
    console.log('Zoom webhook received:', event);
    
    switch (event) {
      case 'meeting.started':
        // Update call status to active
        await pool.query(
          'UPDATE video_calls SET status = $1, started_at = $2 WHERE zoom_meeting_id = $3',
          ['active', new Date().toISOString(), payload.object.id]
        );
        break;
        
      case 'meeting.ended':
        // Update call status to completed
        await pool.query(
          'UPDATE video_calls SET status = $1, ended_at = $2 WHERE zoom_meeting_id = $3',
          ['completed', new Date().toISOString(), payload.object.id]
        );
        break;
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Zoom webhook error:', error);
    res.status(500).send('Error');
  }
});

app.post('/webhooks/zoom-deauth', async (req, res) => {
  try {
    const { payload } = req.body;
    
    // Remove Zoom tokens when app is deauthorized
    await pool.query(
      'DELETE FROM zoom_tokens WHERE mentor_id IN (SELECT id FROM users WHERE email = $1)',
      [payload.user_data_retention]
    );
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Zoom deauth webhook error:', error);
    res.status(500).send('Error');
  }
});

app.post('/api/video-call/request', async (req, res) => {
  try {
    const { menteeId, mentorId, channelName } = req.body;
    
    // Create call session with current server time
    const result = await pool.query(
      'INSERT INTO video_calls (mentee_id, mentor_id, channel_name, status, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [menteeId, mentorId, channelName || `call_${Date.now()}`, 'pending', new Date().toISOString()]
    );
    
    const callSession = result.rows[0];
    
    // Get mentor and mentee details
    const mentee = await pool.query('SELECT username FROM users WHERE id = $1', [menteeId]);
    const mentor = await pool.query('SELECT username FROM users WHERE id = $1', [mentorId]);
    
    // Create notification for mentor
    await pool.query(
      'INSERT INTO notifications (user_id, type, title, message, related_id, related_type) VALUES ($1, $2, $3, $4, $5, $6)',
      [mentorId, 'call_request', 'Video Call Request', `${mentee.rows[0].username} wants to start a video call with you`, callSession.id, 'video_call']
    );
    
    // Real-time notification removed for Vercel compatibility
    
    res.json({ callId: callSession.id, message: 'Call request sent' });
  } catch (error) {
    console.error('Call request error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/video-call/:callId/accept', async (req, res) => {
  try {
    const { callId } = req.params;
    const { mentorId } = req.body;
    
    // Get call details
    const call = await pool.query(
      'SELECT * FROM video_calls WHERE id = $1',
      [callId]
    );
    
    if (call.rows.length === 0) {
      return res.status(404).json({ error: 'Call not found' });
    }
    
    // Get mentor's Zoom token
    const tokenResult = await pool.query(
      'SELECT access_token FROM zoom_tokens WHERE mentor_id = $1',
      [mentorId]
    );
    
    if (tokenResult.rows.length === 0) {
      return res.status(400).json({ error: 'Mentor has not connected Zoom account' });
    }
    
    const accessToken = tokenResult.rows[0].access_token;
    
    // Create Zoom meeting
    const meetingResponse = await axios.post('https://api.zoom.us/v2/users/me/meetings', {
      topic: 'PeerSync Mentorship Session',
      type: 1,
      duration: 10,
      settings: {
        host_video: true,
        participant_video: true,
        join_before_host: false,
        mute_upon_entry: true,
        waiting_room: false,
        auto_recording: 'none'
      }
    }, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    
    const meeting = meetingResponse.data;
    
    const meetingId = meeting.id;
    const joinUrl = meeting.join_url;
    const startUrl = meeting.start_url;
    
    // Update call status with Zoom meeting details
    await pool.query(
      'UPDATE video_calls SET status = $1, accepted_at = $2, zoom_meeting_id = $3, join_url = $4, start_url = $5 WHERE id = $6 AND mentor_id = $7',
      ['accepted', new Date().toISOString(), meetingId, joinUrl, startUrl, callId, mentorId]
    );
    
    res.json({ 
      message: 'Call accepted', 
      meetingId,
      joinUrl,
      startUrl
    });
  } catch (error) {
    console.error('Accept call error:', error);
    res.status(500).json({ error: 'Server error' });
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
      // Real-time notification removed for Vercel compatibility
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
    
    const result = await pool.query(`
      SELECT vc.*, 
             mentee.username as mentee_name,
             mentor.username as mentor_name
      FROM video_calls vc
      JOIN users mentee ON vc.mentee_id = mentee.id
      JOIN users mentor ON vc.mentor_id = mentor.id
      WHERE vc.mentee_id = $1 OR vc.mentor_id = $1
      ORDER BY vc.created_at DESC
      LIMIT 20
    `, [userId]);
    
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

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log(`[${new Date().toLocaleTimeString()}] Socket connected: ${socket.id}`);
  
  socket.on('join_user_room', (userId) => {
    socket.join(`user_${userId}`);
    console.log(`User ${userId} joined their room`);
  });
  
  socket.on('join_call', (callId) => {
    socket.join(`call_${callId}`);
    console.log(`User joined call room: ${callId}`);
  });
  
  socket.on('call_message', (data) => {
    // Broadcast to all users in the call room including sender
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
  });
  
  socket.on('join_user_room', (userId) => {
    console.log(`[${new Date().toLocaleTimeString()}] User ${userId} joined room: user_${userId}`);
  });
  
  socket.on('join_call', (callId) => {
    console.log(`[${new Date().toLocaleTimeString()}] User joined call room: call_${callId}`);
  });
});

// For Vercel serverless functions
if (process.env.VERCEL !== '1') {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

// Export the Express app for Vercel
module.exports = (req, res) => {
  return app(req, res);
};