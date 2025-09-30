const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const mailjet = require('node-mailjet').apiConnect(
  process.env.MAILJET_API_KEY,
  process.env.MAILJET_SECRET_KEY
);

const app = express();

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

app.use(cors({
  origin: true,
  credentials: true
}));

app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.sendStatus(200);
});

app.use(express.json());

// Generate OTP
const generateOTP = () => Math.floor(100000 + Math.random() * 900000).toString();

// Send OTP email
const sendOTPEmail = async (email, otp, purpose) => {
  const subject = purpose === 'signup' ? 'PeerVerse - Email Verification' : 'PeerVerse - Login Verification';
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
      <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #2563eb; margin: 0; font-size: 28px;">PeerVerse</h1>
        </div>
        <h2 style="color: #333; text-align: center; margin-bottom: 20px;">${purpose === 'signup' ? 'Email Verification' : 'Login Verification'}</h2>
        <div style="background-color: #f0f7ff; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
          <p style="margin: 0 0 10px 0; color: #333;">Your OTP code is:</p>
          <div style="font-size: 32px; font-weight: bold; color: #2563eb; letter-spacing: 4px; margin: 10px 0;">${otp}</div>
        </div>
        <p style="color: #666; text-align: center; margin: 20px 0;">This code will expire in 10 minutes.</p>
      </div>
    </div>
  `;

  const request = mailjet.post('send', { version: 'v3.1' }).request({
    Messages: [
      {
        From: {
          Email: process.env.MAILJET_SENDER_EMAIL,
          Name: 'PeerVerse'
        },
        To: [{ Email: email }],
        Subject: subject,
        HTMLPart: html
      }
    ]
  });
  
  await request;
};

// Test endpoint
app.get('/api/test', (req, res) => {
  res.json({ message: 'PeerVerse Backend is running on Vercel!' });
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
    const { username, email, phone, password, role } = req.body;

    if (!username || !email || !phone || !password || !role) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1 AND role = $2', 
      [email, role]
    );
    
    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists with this email and role' });
    }

    const usernameCheck = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
    if (usernameCheck.rows.length > 0) {
      return res.status(400).json({ error: 'Username already taken' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
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
      res.status(500).json({ error: 'Failed to send OTP email. Please try again.' });
    }
  } catch (error) {
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

    const result = await pool.query(
      'INSERT INTO users (username, email, phone, password_hash, role, is_verified) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, username, email, role',
      [userData.username, userData.email, userData.phone, userData.password, userData.role, true]
    );

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
      res.status(500).json({ error: 'Failed to send OTP email. Please try again.' });
    }
  } catch (error) {
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
    res.status(500).json({ error: 'Server error' });
  }
});

// Get all mentors
app.get('/api/mentors', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT mp.*, u.username, u.email FROM mentor_profiles mp JOIN users u ON mp.user_id = u.id WHERE u.role = $1',
      ['mentor']
    );
    
    const mentors = result.rows.map(mentor => ({
      id: mentor.user_id,
      name: mentor.name || mentor.username,
      bio: mentor.bio || 'Experienced mentor ready to help you grow.',
      profilePicture: mentor.profile_picture,
      skills: mentor.skills ? JSON.parse(mentor.skills) : [],
      interests: mentor.interests ? JSON.parse(mentor.interests) : [],
      rating: 4.8,
      reviewCount: Math.floor(Math.random() * 50) + 10
    }));
    
    res.json({ mentors });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Video call endpoints
app.post('/api/video-call/request', async (req, res) => {
  try {
    const { menteeId, mentorId, channelName } = req.body;
    
    const result = await pool.query(
      'INSERT INTO video_calls (mentee_id, mentor_id, channel_name, status, created_at) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [menteeId, mentorId, channelName || `call_${Date.now()}`, 'pending', new Date().toISOString()]
    );
    
    res.json({ callId: result.rows[0].id, message: 'Call request sent' });
  } catch (error) {
    res.status(500).json({ error: 'Server error: ' + error.message });
  }
});

app.post('/api/video-call/:callId/accept', async (req, res) => {
  try {
    const { callId } = req.params;
    
    await pool.query(
      'UPDATE video_calls SET status = $1, accepted_at = $2 WHERE id = $3',
      ['accepted', new Date().toISOString(), callId]
    );
    
    res.json({ message: 'Call accepted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to accept call' });
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
    res.status(500).json({ error: 'Server error' });
  }
});

// Catch all
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

module.exports = app;