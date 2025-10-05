import React, { useState } from 'react';
import axios from 'axios';
import config from '../config';
import './Auth.css';

const ForgotPassword = ({ onBack, onSwitchToLogin }) => {
  const [step, setStep] = useState(1); // 1: email, 2: OTP + new password
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      await axios.post(`${config.API_BASE_URL}/forgot-password`, { email }, {
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      setSuccess('Password reset OTP sent to your email');
      setStep(2);
    } catch (error) {
      let errorMessage = 'Failed to send reset email';
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

  const handlePasswordReset = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters long');
      setLoading(false);
      return;
    }

    try {
      await axios.post(`${config.API_BASE_URL}/reset-password`, {
        email,
        otp,
        newPassword
      }, {
        timeout: 15000,
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      setSuccess('Password reset successful! You can now login with your new password.');
      setTimeout(() => {
        onSwitchToLogin();
      }, 2000);
    } catch (error) {
      let errorMessage = 'Password reset failed';
      if (error.response?.data?.error) {
        errorMessage = error.response.data.error;
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Step 2: OTP and New Password
  if (step === 2) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <h1>PeerVerse</h1>
          <h2>Reset Password</h2>
          <p>Enter the OTP sent to {email} and your new password</p>
          <form onSubmit={handlePasswordReset}>
            <input
              type="text"
              placeholder="Enter 6-digit OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              maxLength="6"
              required
            />
            <input
              type="password"
              placeholder="New Password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Confirm New Password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
            {error && <div className="error">{error}</div>}
            {success && <div className="success">{success}</div>}
            <button type="submit" disabled={loading || !otp || !newPassword || !confirmPassword}>
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
            <button 
              type="button" 
              onClick={() => {
                setStep(1);
                setOtp('');
                setNewPassword('');
                setConfirmPassword('');
                setError('');
              }}
              style={{ marginTop: '10px', background: 'transparent', border: '1px solid #ccc' }}
            >
              Back to Email
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Step 1: Email
  return (
    <div className="auth-container">
      <div className="auth-card">
        {onBack && (
          <button onClick={onBack} className="back-btn">
            ← Back to Login
          </button>
        )}
        <h1>PeerVerse</h1>
        <h2>Forgot Password</h2>
        <p>Enter your email address to receive a password reset code</p>
        <form onSubmit={handleEmailSubmit}>
          <input
            type="email"
            placeholder="Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          {error && <div className="error">{error}</div>}
          {success && <div className="success">{success}</div>}
          <button type="submit" disabled={loading || !email} className="primary-btn">
            {loading ? 'Sending...' : 'Send Reset Code'}
          </button>
        </form>
        
        <div className="auth-links">
          <button onClick={onSwitchToLogin} className="link-btn">
            Back to Sign In
          </button>
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;