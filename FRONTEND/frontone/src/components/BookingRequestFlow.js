import React, { useState, useEffect } from 'react';
import PaymentGateway from './PaymentGateway';
import config from '../config';

const BookingRequestFlow = ({ menteeId, mentorId, sessionFee, onComplete }) => {
  const [bookingId, setBookingId] = useState(null);
  const [bookingStatus, setBookingStatus] = useState('creating');
  const [error, setError] = useState('');

  useEffect(() => {
    createBookingRequest();
  }, []);

  useEffect(() => {
    if (bookingId && bookingStatus === 'pending') {
      // Check booking status periodically
      const interval = setInterval(async () => {
        try {
          const response = await fetch(`${config.API_BASE_URL}/bookings/${bookingId}/status`);
          if (response.ok) {
            const data = await response.json();
            if (data.status === 'accepted') {
              setBookingStatus('accepted');
              clearInterval(interval);
            }
          }
        } catch (error) {
          console.error('Error checking booking status:', error);
        }
      }, 2000);
      
      // Auto-accept after 5 seconds for demo
      const timeout = setTimeout(() => {
        setBookingStatus('accepted');
        clearInterval(interval);
      }, 5000);
      
      return () => {
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [bookingId, bookingStatus]);

  const createBookingRequest = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/bookings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          menteeId,
          mentorId,
          sessionFee,
          scheduledTime: new Date().toISOString()
        })
      });

      if (response.ok) {
        const data = await response.json();
        setBookingId(data.bookingId);
        setBookingStatus('pending');
      } else {
        throw new Error('Failed to create booking');
      }
    } catch (error) {
      setError(error.message);
    }
  };



  const handlePaymentSuccess = () => {
    setBookingStatus('paid');
    onComplete({ bookingId, status: 'ready' });
  };

  if (error) {
    return (
      <div className="booking-error">
        <h3>Booking Failed</h3>
        <p>{error}</p>
        <button onClick={() => window.location.reload()}>Try Again</button>
      </div>
    );
  }

  if (bookingStatus === 'creating') {
    return (
      <div className="booking-status">
        <div className="spinner">⏳</div>
        <p>Creating booking request...</p>
      </div>
    );
  }

  if (bookingStatus === 'pending') {
    return (
      <div className="booking-status">
        <div className="waiting-icon">👨‍🏫</div>
        <h3>Request Sent</h3>
        <p>Waiting for mentor to accept your session request...</p>
        <div className="booking-details">
          <p>Session Fee: ₹{sessionFee}</p>
          <p>Booking ID: {bookingId}</p>
        </div>
      </div>
    );
  }

  if (bookingStatus === 'accepted') {
    return (
      <div className="payment-required">
        <div className="payment-icon">💳</div>
        <h3>Payment Required</h3>
        <p>Your mentor has accepted the session. Please complete payment to join the call.</p>
        
        <PaymentGateway
          bookingId={bookingId}
          amount={sessionFee}
          mentorId={mentorId}
          userId={menteeId}
          onSuccess={handlePaymentSuccess}
          onError={(error) => setError(error)}
        />
      </div>
    );
  }

  return (
    <div className="booking-status">
      <div className="spinner">⏳</div>
      <p>Processing...</p>
    </div>
  );
};

export default BookingRequestFlow;