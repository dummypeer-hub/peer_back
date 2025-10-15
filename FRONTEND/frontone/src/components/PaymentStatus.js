import React, { useState, useEffect } from 'react';
import config from '../config';

const PaymentStatus = ({ bookingId, onStatusChange }) => {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkPaymentStatus();
  }, [bookingId]);

  const checkPaymentStatus = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/bookings/${bookingId}/status`);
      if (response.ok) {
        const data = await response.json();
        setStatus(data);
        if (onStatusChange) {
          onStatusChange(data);
        }
      }
    } catch (error) {
      console.error('Failed to check payment status:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="payment-status loading">Checking payment status...</div>;
  }

  if (!status) {
    return <div className="payment-status error">Unable to check payment status</div>;
  }

  return (
    <div className={`payment-status ${status.paymentStatus}`}>
      <div className="status-indicator">
        {status.paymentStatus === 'paid' ? '✅' : '⏳'}
      </div>
      <div className="status-text">
        {status.paymentStatus === 'paid' ? 'Payment Completed' : 'Payment Pending'}
      </div>
      {status.callAllowed && (
        <div className="call-status">Call Access: Enabled</div>
      )}
      
      <style jsx>{`
        .payment-status {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px;
          border-radius: 6px;
          margin: 10px 0;
        }
        
        .payment-status.paid {
          background: #d4edda;
          color: #155724;
          border: 1px solid #c3e6cb;
        }
        
        .payment-status.pending {
          background: #fff3cd;
          color: #856404;
          border: 1px solid #ffeaa7;
        }
        
        .payment-status.loading,
        .payment-status.error {
          background: #f8f9fa;
          color: #6c757d;
          border: 1px solid #dee2e6;
        }
        
        .status-indicator {
          font-size: 18px;
        }
        
        .status-text {
          font-weight: 500;
        }
        
        .call-status {
          margin-left: auto;
          font-size: 12px;
          color: #28a745;
        }
      `}</style>
    </div>
  );
};

export default PaymentStatus;