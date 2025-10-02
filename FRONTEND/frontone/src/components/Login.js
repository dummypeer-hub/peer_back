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
        try {
          recaptchaVerifier.clear();
        } catch (error) {
          // Ignore cleanup errors
        }
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
      console.log('=== PHONE VERIFICATION START ===');
      console.log('Current step:', step);
      console.log('Phone input:', formData.phone);
      console.log('reCAPTCHA verifier available:', !!recaptchaVerifier);
      
      if (!recaptchaVerifier) {
        throw new Error('reCAPTCHA not initialized. Please refresh the page.');
      }

      const phoneNumber = formData.phone.startsWith('+') ? formData.phone : `+91${formData.phone}`;
      console.log('Formatted phone number:', phoneNumber);
      console.log('Attempting to send OTP via Firebase...');
      
      // Send SMS OTP via Firebase
      const confirmation = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
      console.log('Firebase signInWithPhoneNumber completed');
      console.log('Confirmation result type:', typeof confirmation);
      console.log('Confirmation result keys:', Object.keys(confirmation || {}));
      console.log('Confirmation verificationId:', confirmation?.verificationId);
      
      if (confirmation && confirmation.verificationId) {
        console.log('✅ OTP sent successfully! Setting confirmation result and moving to step 3');
        setConfirmationResult(confirmation);
        console.log('About to set step to 3...');
        setStep(3);
        console.log('Step set to 3 completed');
      } else {
        console.error('❌ Invalid confirmation result:', confirmation);
        throw new Error('Failed to get valid confirmation result from Firebase');
      }
    } catch (error) {
      console.error('❌ Phone verification error:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      console.error('Full error object:', error);
      
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
      console.log('=== PHONE VERIFICATION END ===');
      setLoading(false);
    }
  };

  const handleOtpVerification = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log('=== OTP VERIFICATION START ===');
      console.log('OTP entered:', otp);
      console.log('Confirmation result available:', !!confirmationResult);
      console.log('Session ID:', sessionId);
      
      if (!confirmationResult) {
        throw new Error('No confirmation result available. Please try sending OTP again.');
      }
      
      if (!otp || otp.length !== 6) {
        throw new Error('Please enter a valid 6-digit OTP.');
      }
      
      console.log('Verifying OTP with Firebase...');
      // Verify OTP with Firebase
      const result = await confirmationResult.confirm(otp);
      console.log('Firebase OTP verification successful');
      console.log('Firebase user:', result.user.uid);
      
      const firebaseToken = await result.user.getIdToken();
      console.log('Firebase token obtained, length:', firebaseToken.length);
      
      console.log('Sending verification to backend...');
      // Verify with backend
      const response = await axios.post(`${config.API_BASE_URL}/verify-phone-login`, {
        sessionId,
        firebaseToken
      });
      
      console.log('Backend verification successful');
      console.log('User data received:', response.data.user);
      
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      
      console.log('Login successful, calling onLogin...');
      onLogin(response.data.user);
    } catch (error) {
      console.error('OTP verification error:', error);
      console.error('Error code:', error.code);
      console.error('Error message:', error.message);
      
      let errorMessage = 'OTP verification failed';
      if (error.code === 'auth/invalid-verification-code') {
        errorMessage = 'Invalid OTP. Please check and try again.';
      } else if (error.code === 'auth/code-expired') {
        errorMessage = 'OTP has expired. Please request a new one.';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setError(errorMessage);
    } finally {
      console.log('=== OTP VERIFICATION END ===');
      setLoading(false);
    }
  };

  // Step 2: Phone Input
  if (step === 2) {
    console.log('=== RENDERING PHONE INPUT STEP ===');
    console.log('Current step:', step);
    console.log('Session ID:', sessionId);
    
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
              autoFocus
            />
            <div style={{ fontSize: '12px', color: '#666', marginTop: '5px' }}>
              Format: +91xxxxxxxxxx (e.g., +919876543210)
            </div>
            <div id="recaptcha-container"></div>
            {error && <div className="error">{error}</div>}
            <button type="submit" disabled={loading || !formData.phone}>
              {loading ? 'Sending OTP...' : 'Send OTP'}
            </button>
          </form>
          <div style={{ fontSize: '10px', color: '#999', marginTop: '10px' }}>
            Debug: Step={step}, reCAPTCHA={!!recaptchaVerifier}
          </div>
        </div>
      </div>
    );
  }

  // Step 3: OTP Verification
  if (step === 3) {
    console.log('=== RENDERING OTP STEP ===');
    console.log('Current step:', step);
    console.log('Phone number:', formData.phone);
    console.log('Confirmation result available:', !!confirmationResult);
    console.log('OTP value:', otp);
    
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>SMS Verification</h2>
          <p>We've sent an OTP to {formData.phone}</p>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>
            Check your phone for a 6-digit verification code
          </div>
          <form onSubmit={handleOtpVerification}>
            <input
              type="text"
              placeholder="Enter 6-digit OTP"
              value={otp}
              onChange={(e) => {
                console.log('OTP input changed:', e.target.value);
                setOtp(e.target.value);
              }}
              maxLength="6"
              required
              autoFocus
            />
            {error && <div className="error">{error}</div>}
            <button type="submit" disabled={loading || !otp || otp.length !== 6}>
              {loading ? 'Verifying...' : 'Verify OTP'}
            </button>
            <button 
              type="button" 
              onClick={() => {
                console.log('Back to phone input clicked');
                setStep(2);
                setOtp('');
                setError('');
              }}
              style={{ marginTop: '10px', background: 'transparent', border: '1px solid #ccc' }}
            >
              Back to Phone Input
            </button>
          </form>
          <div style={{ fontSize: '10px', color: '#999', marginTop: '10px' }}>
            Debug: Step={step}, ConfirmationResult={!!confirmationResult}
          </div>
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
