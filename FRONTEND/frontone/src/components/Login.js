import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { auth } from '../firebase';
import config from '../config';
import './Auth.css';

const Login = ({ onLogin, onSwitchToSignup, onForgotPassword, onBack }) => {
  const [formData, setFormData] = useState({
    phone: '',
    role: ''
  });
  const [otp, setOtp] = useState('');
  const [showOtpInput, setShowOtpInput] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recaptchaVerifier, setRecaptchaVerifier] = useState(null);

  useEffect(() => {
    // Initialize reCAPTCHA
    const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
      size: 'invisible',
      callback: () => {
        console.log('reCAPTCHA solved');
      }
    });
    setRecaptchaVerifier(verifier);

    return () => {
      if (verifier) {
        verifier.clear();
      }
    };
  }, []);

  const handleInputChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError('');
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Format phone number
      const phoneNumber = formData.phone.startsWith('+') ? formData.phone : `+91${formData.phone}`;
      
      // Check if user exists
      const response = await axios.post(`${config.API_BASE_URL}/login`, {
        phone: phoneNumber,
        role: formData.role
      });
      
      setSessionId(response.data.sessionId);
      
      // Send SMS OTP via Firebase
      const confirmation = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
      setConfirmationResult(confirmation);
      setShowOtpInput(true);
      setError('');
    } catch (error) {
      setError(error.response?.data?.error || error.message || 'Login failed');
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
      const response = await axios.post(`${config.API_BASE_URL}/verify-login`, {
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

  if (showOtpInput) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>SMS Verification</h2>
          <p>We've sent an OTP to your phone number</p>
          <form onSubmit={handleOtpVerification}>
            <input
              type="text"
              placeholder="Enter 6-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              maxLength="6"
              required
            />
            <div id="recaptcha-container"></div>
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
        <form onSubmit={handleLogin}>
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
            type="tel"
            name="phone"
            placeholder="Phone Number (+91xxxxxxxxxx)"
            value={formData.phone}
            onChange={handleInputChange}
            required
          />
          <div id="recaptcha-container"></div>
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
