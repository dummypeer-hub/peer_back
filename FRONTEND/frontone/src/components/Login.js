import React, { useState } from 'react';
import axios from 'axios';
import config from '../config';
import ForgotPassword from './ForgotPassword';
import './Auth.css';

const Login = ({ onLogin, onSwitchToSignup, onForgotPassword, onBack }) => {
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [step, setStep] = useState(1); // 1: email/password, 2: OTP
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    role: ''
  });
  const [otp, setOtp] = useState('');
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

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
      }, {
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.data.requiresEmailVerification) {
        setSessionId(response.data.sessionId);
        setStep(2); // Move to OTP step
      }
    } catch (error) {
      let errorMessage = 'Login failed';
      if (error.code === 'ENOTFOUND' || error.message.includes('ERR_NAME_NOT_RESOLVED')) {
        errorMessage = 'Network error: Cannot connect to server. Please check your internet connection.';
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Connection timeout. Please try again.';
      } else if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpVerification = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (!otp || otp.length !== 6) {
        throw new Error('Please enter a valid 6-digit OTP.');
      }
      
      const response = await axios.post(`${config.API_BASE_URL}/verify-email-otp-login`, {
        sessionId,
        otp
      });
      
      localStorage.setItem('token', response.data.token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
      onLogin(response.data.user);
    } catch (error) {
      let errorMessage = 'OTP verification failed';
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      } else if (error.message) {
        errorMessage = error.message;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Show Forgot Password component
  if (showForgotPassword) {
    return (
      <ForgotPassword 
        onBack={() => setShowForgotPassword(false)}
        onSwitchToLogin={() => setShowForgotPassword(false)}
      />
    );
  }

  // Step 2: OTP Verification
  if (step === 2) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h2>Email Verification</h2>
          <p>We've sent a verification code to {formData.email}</p>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '10px' }}>
            Check your email for a 6-digit verification code from PeerVerse
          </div>
          <form onSubmit={handleOtpVerification}>
            <input
              type="text"
              placeholder="Enter 6-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
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
                setStep(1);
                setOtp('');
                setError('');
              }}
              style={{ marginTop: '10px', background: 'transparent', border: '1px solid #ccc' }}
            >
              Back to Login
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
          <button onClick={() => setShowForgotPassword(true)} className="link-btn">
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