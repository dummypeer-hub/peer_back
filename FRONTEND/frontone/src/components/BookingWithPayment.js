import React, { useState } from 'react';
import PaymentGateway from './PaymentGateway';
import PaymentStatus from './PaymentStatus';
import { createBooking } from '../utils/paymentUtils';

const BookingWithPayment = ({ menteeId, mentorId, sessionFee, onBookingComplete }) => {
  const [bookingId, setBookingId] = useState(null);
  const [paymentCompleted, setPaymentCompleted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreateBooking = async () => {
    setLoading(true);
    setError('');
    
    try {
      const booking = await createBooking(menteeId, mentorId, sessionFee, new Date());
      setBookingId(booking.bookingId);
    } catch (error) {
      setError('Failed to create booking: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = (paymentResponse) => {
    setPaymentCompleted(true);
    if (onBookingComplete) {
      onBookingComplete({
        bookingId,
        paymentId: paymentResponse.razorpay_payment_id,
        status: 'completed'
      });
    }
  };

  const handlePaymentError = (errorMessage) => {
    setError('Payment failed: ' + errorMessage);
  };

  if (!bookingId) {
    return (
      <div className="booking-container">
        <div className="booking-details">
          <h3>Book Mentorship Session</h3>
          <p>Session Fee: ₹{sessionFee}</p>
          <p>Mentor ID: {mentorId}</p>
        </div>
        
        {error && (
          <div className="error-message">
            {error}
          </div>
        )}
        
        <button 
          onClick={handleCreateBooking}
          disabled={loading}
          className="create-booking-btn"
        >
          {loading ? 'Creating Booking...' : 'Create Booking'}
        </button>
        
        <style jsx>{`
          .booking-container {
            max-width: 500px;
            margin: 20px auto;
            padding: 20px;
            border: 1px solid #ddd;
            border-radius: 8px;
          }
          
          .booking-details h3 {
            margin: 0 0 15px 0;
            color: #333;
          }
          
          .booking-details p {
            margin: 8px 0;
            color: #666;
          }
          
          .error-message {
            background: #fee;
            color: #c33;
            padding: 10px;
            border-radius: 4px;
            margin: 15px 0;
            border: 1px solid #fcc;
          }
          
          .create-booking-btn {
            width: 100%;
            padding: 12px;
            background: #28a745;
            color: white;
            border: none;
            border-radius: 6px;
            font-size: 16px;
            cursor: pointer;
            margin-top: 15px;
          }
          
          .create-booking-btn:hover:not(:disabled) {
            background: #218838;
          }
          
          .create-booking-btn:disabled {
            background: #ccc;
            cursor: not-allowed;
          }
        `}</style>
      </div>
    );
  }

  if (paymentCompleted) {
    return (
      <div className="booking-success">
        <div className="success-icon">✅</div>
        <h3>Booking Confirmed!</h3>
        <p>Your payment has been processed successfully.</p>
        <p>Booking ID: {bookingId}</p>
        <p>You can now join the video call.</p>
        
        <style jsx>{`
          .booking-success {
            max-width: 400px;
            margin: 20px auto;
            padding: 30px;
            text-align: center;
            border: 1px solid #d4edda;
            border-radius: 8px;
            background: #d4edda;
            color: #155724;
          }
          
          .success-icon {
            font-size: 48px;
            margin-bottom: 15px;
          }
          
          .booking-success h3 {
            margin: 0 0 15px 0;
          }
          
          .booking-success p {
            margin: 8px 0;
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="payment-flow">
      <PaymentStatus 
        bookingId={bookingId}
        onStatusChange={(status) => {
          if (status.paymentStatus === 'paid') {
            setPaymentCompleted(true);
          }
        }}
      />
      
      {!paymentCompleted && (
        <PaymentGateway
          bookingId={bookingId}
          amount={sessionFee}
          mentorId={mentorId}
          userId={menteeId}
          onSuccess={handlePaymentSuccess}
          onError={handlePaymentError}
        />
      )}
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}
      
      <style jsx>{`
        .payment-flow {
          max-width: 500px;
          margin: 20px auto;
        }
        
        .error-message {
          background: #fee;
          color: #c33;
          padding: 10px;
          border-radius: 4px;
          margin: 15px 0;
          border: 1px solid #fcc;
          text-align: center;
        }
      `}</style>
    </div>
  );
};

export default BookingWithPayment;