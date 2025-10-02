import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { auth } from '../firebase';
import config from '../config';
import './Auth.css';

const Login = ({ onLogin, onSwitchToSignup, onForgotPassword, onBack }) => {
  const [step, setStep] = useState(1); // 1: email/password, 2: phone input, 3: OTP
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: '',
    phone: ''
  });
  const [otp, setOtp] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recaptchaVerifier, setRecaptchaVerifier] = useState(null);

  useEffect(() => {
    // Initialize reCAPTCHA only when needed (step 2)
    if (step === 2) {
      try {
        // Wait for DOM element to be available
        setTimeout(() => {
          const element = document.getElementById('recaptcha-container');
          if (element && !recaptchaVerifier) {
            const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
              size: 'invisible',
              callback: () => {
                console.log('reCAPTCHA solved');
              }
            });
            setRecaptchaVerifier(verifier);
            console.log('reCAPTCHA verifier initialized successfully');
          }
        }, 100);
      } catch (error) {
        console.error('Failed to initialize reCAPTCHA:', error);
      }
    }

    return () => {
      if (recaptchaVerifier) {
        recaptchaVerifier.clear();
        setRecaptchaVerifier(null);
      }
    };
  }, [step, recaptchaVerifier]);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleEmailLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post(`${config.API_BASE_URL}/login`, {
        email: formData.email,
        password: formData.password,
        role: formData.role
      });
      
      if (response.data.requiresPhoneVerification) {
        setSessionId(response.data.sessionId);
        setStep(2); // Move to phone input step
      }
    } catch (error) {
      setError(error.response?.data?.error || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handlePhoneVerification = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!recaptchaVerifier) {
        throw new Error('reCAPTCHA not initialized. Please refresh the page.');
      }

      const phoneNumber = formData.phone.startsWith('+') ? formData.phone : `+91${formData.phone}`;
      console.log('Attempting to send OTP to:', phoneNumber);
      
      // Send SMS OTP via Firebase
      const confirmation = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
      console.log('OTP sent successfully, confirmation result:', !!confirmation);
      setConfirmationResult(confirmation);
      setStep(3); // Move to OTP step
    } catch (error) {
      console.error('Phone verification error:', error);
      let errorMessage = 'Failed to send OTP';
      
      if (error.code === 'auth/invalid-phone-number') {
        errorMessage = 'Invalid phone number format. Please use +91xxxxxxxxxx format.';
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = 'Too many requests. Please try again later.';
      } else if (error.code === 'auth/captcha-check-failed') {
        errorMessage = 'Captcha verification failed. Please refresh and try again.';
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpVerification = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Verify OTP with Firebase
      const result = await confirmationResult.confirm(otp);
      const firebaseToken = await result.user.getIdToken();
      
      // Verify with backend
      const response = await axios.post(`${config.API_BASE_URL}/verify-phone-login`, {
        sessionId,
        firebaseToken
      });
      
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      onLogin(response.data.user);
    } catch (error) {
      setError(error.response?.data?.error || 'OTP verification failed');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Phone Input
  if (step === 2) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>Phone Verification</h2>
          <p>Enter your phone number to receive OTP</p>
          <form onSubmit={handlePhoneVerification}>
            <input
              type="tel"
              name="phone"
              placeholder="Phone Number (+91xxxxxxxxxx)"
              value={formData.phone}
              onChange={handleInputChange}
              required
            />
            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
              Format: +91xxxxxxxxxx (e.g., +919876543210)
            </div>
            <div id="recaptcha-container"></div>
            {error && <div className="error">{error}</div>}
            <button type="submit" disabled={loading}>
              {loading ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Step 3: OTP Verification
  if (step === 3) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>SMS Verification</h2>
          <p>We've sent an OTP to {formData.phone}</p>
          <form onSubmit={handleOtpVerification}>
            <input
              type="text"
              placeholder="Enter 6-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              maxLength="6"
              required
            />
            {error && <div className="error">{error}</div>}
            <button type="submit" disabled={loading}>
              {loading ? 'Verifying...' : 'Verify OTP'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        {onBack && (
          <button onClick={onBack} className="back-btn">
            ← Back to Home
          </button>
        )}
        <h1>PeerVerse</h1>
        <h2>Sign In</h2>
        <form onSubmit={handleEmailLogin}>
          <select
            name="role"
            value={formData.role}
            onChange={handleInputChange}
            required
          >
            <option value="">Select Role</option>
            <option value="mentor">👨🏫 Mentor</option>
            <option value="mentee">👨🎓 Mentee</option>
          </select>
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={formData.email}
            onChange={handleInputChange}
            required
          />
          <input
            type="password"
            name="password"
            placeholder="Password"
            value={formData.password}
            onChange={handleInputChange}
            required
          />
          {error && <div className="error">{error}</div>}
          <button type="submit" disabled={loading} className="primary-btn">
            {loading ? 'Signing In...' : 'Sign In'}
          </button>
        </form>
        
        <div className="auth-links">
          <button onClick={onForgotPassword} className="link-btn">
            Forgot Password?
          </button>
          <button onClick={onSwitchToSignup} className="link-btn">
            Sign Up
          </button>
        </div>
      </div>
    </div>
  );
};

export default Login;
