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
            } else if (data.status === 'rejected') {
              setBookingStatus('rejected');
              clearInterval(interval);
            }
          }
        } catch (error) {
          console.error('Error checking booking status:', error);
        }
      }, 2000);
      
      return () => {
        clearInterval(interval);
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

  if (bookingStatus === 'rejected') {
    return (
      <div className="booking-status">
        <div className="rejected-icon">❌</div>
        <h3>Request Declined</h3>
        <p>The mentor has declined your session request.</p>
        <button onClick={() => window.location.reload()} className="retry-btn">
          Try Another Mentor
        </button>
      </div>
    );
  }

  return (
    <div className="booking-status">
      <div className="spinner">⏳</div>
      <p>Processing...</p>
      
      <style jsx>{`
        .booking-status {
          text-align: center;
          padding: 40px 20px;
          background: #f8f9fa;
          border-radius: 12px;
          margin: 20px 0;
        }
        
        .spinner {
          font-size: 32px;
          margin-bottom: 16px;
          animation: spin 2s linear infinite;
        }
        
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        
        .waiting-icon, .payment-icon, .rejected-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }
        
        .booking-details {
          background: white;
          padding: 16px;
          border-radius: 8px;
          margin: 16px 0;
          border: 1px solid #dee2e6;
        }
        
        .booking-details p {
          margin: 8px 0;
          color: #6c757d;
        }
        
        .payment-required {
          text-align: center;
          padding: 20px;
        }
        
        .payment-required h3 {
          color: #28a745;
          margin-bottom: 12px;
        }
        
        .retry-btn {
          background: #007bff;
          color: white;
          border: none;
          padding: 12px 24px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 16px;
          margin-top: 16px;
        }
        
        .retry-btn:hover {
          background: #0056b3;
        }
        
        .booking-error {
          text-align: center;
          padding: 40px 20px;
          background: #f8d7da;
          border: 1px solid #f5c6cb;
          border-radius: 12px;
          color: #721c24;
        }
        
        .booking-error h3 {
          color: #721c24;
          margin-bottom: 12px;
        }
      `}</style>
    </div>
  );
};

export default BookingRequestFlow;