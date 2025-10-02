import React, { useState, useEffect } from 'react';
import { RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { auth } from '../firebase';

const SMSTest = () => {
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [recaptchaVerifier, setRecaptchaVerifier] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    try {
      console.log('Initializing reCAPTCHA for SMS test...');
      const verifier = new RecaptchaVerifier(auth, 'recaptcha-test', {
        size: 'normal', // Use normal size for testing
        callback: (response) => {
          console.log('reCAPTCHA solved:', response);
        },
        'expired-callback': () => {
          console.log('reCAPTCHA expired');
          setError('reCAPTCHA expired. Please try again.');
        },
        'error-callback': (error) => {
          console.error('reCAPTCHA error:', error);
          setError('reCAPTCHA error: ' + error.message);
        }
      });
      
      setRecaptchaVerifier(verifier);
      console.log('reCAPTCHA verifier created successfully');
    } catch (error) {
      console.error('Failed to create reCAPTCHA verifier:', error);
      setError('Failed to initialize reCAPTCHA: ' + error.message);
    }

    return () => {
      if (recaptchaVerifier) {
        recaptchaVerifier.clear();
      }
    };
  }, []);

  const sendOTP = async () => {
    setLoading(true);
    setError('');
    setSuccess('');

    try {
      if (!recaptchaVerifier) {
        throw new Error('reCAPTCHA not initialized');
      }

      const phoneNumber = phone.startsWith('+') ? phone : `+91${phone}`;
      console.log('Sending OTP to:', phoneNumber);
      
      const confirmation = await signInWithPhoneNumber(auth, phoneNumber, recaptchaVerifier);
      console.log('OTP sent successfully:', !!confirmation);
      
      setConfirmationResult(confirmation);
      setSuccess('OTP sent successfully! Check your phone.');
    } catch (error) {
      console.error('Send OTP error:', error);
      setError('Failed to send OTP: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const verifyOTP = async () => {
    setLoading(true);
    setError('');

    try {
      if (!confirmationResult) {
        throw new Error('No confirmation result available');
      }

      const result = await confirmationResult.confirm(otp);
      console.log('OTP verified successfully:', result.user.uid);
      setSuccess('Phone number verified successfully!');
      
      // Sign out immediately after verification
      await auth.signOut();
    } catch (error) {
      console.error('Verify OTP error:', error);
      setError('Invalid OTP: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '400px', margin: '0 auto' }}>
      <h2>SMS Test</h2>
      
      {!confirmationResult ? (
        <div>
          <input
            type="tel"
            placeholder="Phone Number (+91xxxxxxxxxx)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            style={{ width: '100%', padding: '10px', marginBottom: '10px' }}
          />
          <div id="recaptcha-test" style={{ marginBottom: '10px' }}></div>
          <button 
            onClick={sendOTP} 
            disabled={loading || !phone}
            style={{ width: '100%', padding: '10px' }}
          >
            {loading ? 'Sending...' : 'Send OTP'}
          </button>
        </div>
      ) : (
        <div>
          <p>OTP sent to {phone}</p>
          <input
            type="text"
            placeholder="Enter 6-digit OTP"
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            maxLength="6"
            style={{ width: '100%', padding: '10px', marginBottom: '10px' }}
          />
          <button 
            onClick={verifyOTP} 
            disabled={loading || !otp}
            style={{ width: '100%', padding: '10px' }}
          >
            {loading ? 'Verifying...' : 'Verify OTP'}
          </button>
        </div>
      )}

      {error && (
        <div style={{ color: 'red', marginTop: '10px', padding: '10px', border: '1px solid red' }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ color: 'green', marginTop: '10px', padding: '10px', border: '1px solid green' }}>
          {success}
        </div>
      )}

      <div style={{ marginTop: '20px', fontSize: '12px', color: '#666' }}>
        <h4>Debug Info:</h4>
        <p>reCAPTCHA initialized: {recaptchaVerifier ? 'Yes' : 'No'}</p>
        <p>Confirmation result: {confirmationResult ? 'Yes' : 'No'}</p>
        <p>Firebase Auth: {auth ? 'Initialized' : 'Not initialized'}</p>
      </div>
    </div>
  );
};

export default SMSTest;