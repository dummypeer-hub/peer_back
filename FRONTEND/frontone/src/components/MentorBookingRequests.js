import React, { useState, useEffect } from 'react';
import config from '../config';

const MentorBookingRequests = ({ mentorId }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBookingRequests();
    const interval = setInterval(fetchBookingRequests, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchBookingRequests = async () => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/mentor/${mentorId}/booking-requests`);
      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests || []);
      }
    } catch (error) {
      console.error('Failed to fetch requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const acceptRequest = async (bookingId) => {
    try {
      const response = await fetch(`${config.API_BASE_URL}/bookings/${bookingId}/accept`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mentorId })
      });

      if (response.ok) {
        fetchBookingRequests(); // Refresh list
      }
    } catch (error) {
      console.error('Failed to accept request:', error);
    }
  };

  if (loading) {
    return <div className="loading">Loading requests...</div>;
  }

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const acceptedRequests = requests.filter(r => r.status === 'accepted');

  return (
    <div className="booking-requests">
      <h3>Session Requests</h3>
      
      {pendingRequests.length > 0 && (
        <div className="pending-requests">
          <h4>Pending Requests</h4>
          {pendingRequests.map(request => (
            <div key={request.id} className="request-card">
              <div className="request-info">
                <p><strong>{request.mentee_name}</strong></p>
                <p>Fee: ₹{request.session_fee}</p>
                <p>Requested: {new Date(request.created_at).toLocaleString()}</p>
              </div>
              <div className="request-actions">
                <button 
                  onClick={() => acceptRequest(request.id)}
                  className="accept-btn"
                >
                  Accept
                </button>
                <button className="decline-btn">Decline</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {acceptedRequests.length > 0 && (
        <div className="accepted-requests">
          <h4>Waiting for Payment</h4>
          {acceptedRequests.map(request => (
            <div key={request.id} className="request-card accepted">
              <div className="request-info">
                <p><strong>{request.mentee_name}</strong></p>
                <p>Fee: ₹{request.session_fee}</p>
                <p>Status: Waiting for payment</p>
              </div>
              <div className="payment-status">
                {request.call_allowed ? '✅ Paid' : '⏳ Payment Pending'}
              </div>
            </div>
          ))}
        </div>
      )}

      {requests.length === 0 && (
        <p className="no-requests">No session requests at the moment.</p>
      )}
      
      <style jsx>{`
        .booking-requests {
          max-width: 600px;
          margin: 20px auto;
          padding: 20px;
        }
        
        .request-card {
          border: 1px solid #ddd;
          border-radius: 8px;
          padding: 15px;
          margin: 10px 0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .request-card.accepted {
          background: #f8f9fa;
          border-color: #28a745;
        }
        
        .request-info p {
          margin: 5px 0;
        }
        
        .request-actions {
          display: flex;
          gap: 10px;
        }
        
        .accept-btn {
          background: #28a745;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
        }
        
        .decline-btn {
          background: #dc3545;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
        }
        
        .payment-status {
          font-weight: bold;
          color: #28a745;
        }
      `}</style>
    </div>
  );
};

export default MentorBookingRequests;