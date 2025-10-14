import React, { useState } from 'react';
import config from '../config';

const PaymentGateway = ({ bookingId, amount, mentorId, userId, onSuccess, onError }) => {
  const [loading, setLoading] = useState(false);

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePayment = async () => {
    setLoading(true);
    
    try {
      
      // Load Razorpay script and create order
      const scriptLoaded = await loadRazorpayScript();
      if (!scriptLoaded) {
        throw new Error('Failed to load Razorpay');
      }

      // Create Razorpay order
      const orderResponse = await fetch(`${config.API_BASE_URL}/create-razorpay-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, bookingId })
      });

      if (!orderResponse.ok) {
        throw new Error('Failed to create payment order');
      }

      const orderData = await orderResponse.json();

      // Configure Razorpay options
      const options = {
        key: orderData.keyId,
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'PeerVerse',
        description: 'Mentorship Session Payment',
        order_id: orderData.orderId,
        handler: async (response) => {
          try {
            // Store payment success in backend
            const verifyResponse = await fetch(`${config.API_BASE_URL}/video-call/${bookingId}/payment-success`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_signature: response.razorpay_signature,
                bookingId,
                amount
              })
            });
            
            if (verifyResponse.ok) {
              setLoading(false);
              onSuccess(response);
            } else {
              throw new Error('Payment verification failed');
            }
          } catch (error) {
            setLoading(false);
            onError('Payment verification failed');
          }
        },
        prefill: {
          name: 'User',
          email: 'user@example.com'
        },
        theme: {
          color: '#667eea'
        },
        modal: {
          ondismiss: () => {
            setLoading(false);
            onError('Payment cancelled');
          }
        }
      };

      const razorpay = new window.Razorpay(options);
      razorpay.open();
      
    } catch (error) {
      setLoading(false);
      onError(error.message);
    }
  };

  return (
    <div className="payment-gateway">
      <div className="payment-details">
        <h3>Session Payment</h3>
        <p>Amount: ₹{amount}</p>
        <p>Booking ID: {bookingId}</p>
      </div>
      
      <button 
        onClick={handlePayment}
        disabled={loading}
        className="pay-button"
      >
        {loading ? 'Processing...' : `Pay ₹${amount}`}
      </button>
      
      <style jsx>{`
        .payment-gateway {
          padding: 20px;
          border: 1px solid #ddd;
          border-radius: 8px;
          max-width: 400px;
          margin: 20px auto;
        }
        
        .payment-details {
          margin-bottom: 20px;
        }
        
        .payment-details h3 {
          margin: 0 0 10px 0;
          color: #333;
        }
        
        .payment-details p {
          margin: 5px 0;
          color: #666;
        }
        
        .pay-button {
          width: 100%;
          padding: 12px;
          background: #667eea;
          color: white;
          border: none;
          border-radius: 6px;
          font-size: 16px;
          cursor: pointer;
          transition: background 0.3s;
        }
        
        .pay-button:hover:not(:disabled) {
          background: #5a6fd8;
        }
        
        .pay-button:disabled {
          background: #ccc;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};

export default PaymentGateway;