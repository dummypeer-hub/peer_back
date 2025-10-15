import React, { useState, useEffect } from 'react';
import config from '../config';

const MentorBookingRequests = ({ user }) => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadBookingRequests();
    
    // Set up polling for new requests
    const interval = setInterval(loadBookingRequests, 5000);
    return () => clearInterval(interval);
  }, [user.id]);

  const loadBookingRequests = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${config.API_BASE_URL}/mentor/${user.id}/booking-requests`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setRequests(data.requests || []);
      }
    } catch (error) {
      console.error('Failed to load booking requests:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (bookingId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${config.API_BASE_URL}/bookings/${bookingId}/accept`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ mentorId: user.id })
      });

      if (response.ok) {
        // Remove from pending requests
        setRequests(requests.filter(req => req.id !== bookingId));
        alert('Booking request accepted! The mentee will be notified to complete payment.');
      } else {
        const error = await response.json();
        alert('Failed to accept request: ' + error.error);
      }
    } catch (error) {
      console.error('Accept request error:', error);
      alert('Failed to accept request');
    }
  };

  const handleReject = async (bookingId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${config.API_BASE_URL}/bookings/${bookingId}/reject`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        },
        body: JSON.stringify({ mentorId: user.id })
      });

      if (response.ok) {
        // Remove from pending requests
        setRequests(requests.filter(req => req.id !== bookingId));
        alert('Booking request rejected.');
      } else {
        const error = await response.json();
        alert('Failed to reject request: ' + error.error);
      }
    } catch (error) {
      console.error('Reject request error:', error);
      alert('Failed to reject request');
    }
  };

  if (loading) {
    return (
      <div className="booking-requests-loading">
        <div className="spinner">⏳</div>
        <p>Loading booking requests...</p>
      </div>
    );
  }

  return (
    <div className="mentor-booking-requests">
      <h2>📋 Booking Requests</h2>
      
      {requests.length === 0 ? (
        <div className="no-requests">
          <div className="no-requests-icon">📭</div>
          <h3>No Pending Requests</h3>
          <p>You don't have any pending booking requests at the moment.</p>
        </div>
      ) : (
        <div className="requests-list">
          {requests.map(request => (
            <div key={request.id} className="request-card">
              <div className="request-header">
                <div className="mentee-info">
                  <h4>{request.mentee_name}</h4>
                  <p className="request-time">
                    Requested {new Date(request.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="session-fee">
                  <span className="fee-amount">₹{request.payment_amount}</span>
                  <span className="fee-label">Session Fee</span>
                </div>
              </div>
              
              <div className="request-details">
                <p>💰 You'll earn: <strong>₹{(request.payment_amount * 0.7).toFixed(2)}</strong> (70%)</p>
                <p>⏱️ Session Duration: 10 minutes</p>
              </div>
              
              <div className="request-actions">
                <button 
                  onClick={() => handleAccept(request.id)}
                  className="accept-btn"
                >
                  ✅ Accept Request
                </button>
                <button 
                  onClick={() => handleReject(request.id)}
                  className="reject-btn"
                >
                  ❌ Decline
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      
      <style jsx>{`
        .mentor-booking-requests {
          padding: 20px;
          max-width: 800px;
          margin: 0 auto;
        }
        
        .mentor-booking-requests h2 {
          color: #333;
          margin-bottom: 20px;
          text-align: center;
        }
        
        .booking-requests-loading {
          text-align: center;
          padding: 40px;
        }
        
        .spinner {
          font-size: 24px;
          margin-bottom: 10px;
        }
        
        .no-requests {
          text-align: center;
          padding: 60px 20px;
          background: #f8f9fa;
          border-radius: 12px;
          border: 2px dashed #dee2e6;
        }
        
        .no-requests-icon {
          font-size: 48px;
          margin-bottom: 16px;
        }
        
        .no-requests h3 {
          color: #6c757d;
          margin-bottom: 8px;
        }
        
        .no-requests p {
          color: #868e96;
        }
        
        .requests-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        
        .request-card {
          background: white;
          border: 1px solid #e9ecef;
          border-radius: 12px;
          padding: 20px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          transition: transform 0.2s, box-shadow 0.2s;
        }
        
        .request-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        
        .request-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 16px;
        }
        
        .mentee-info h4 {
          margin: 0 0 4px 0;
          color: #333;
          font-size: 18px;
        }
        
        .request-time {
          margin: 0;
          color: #6c757d;
          font-size: 14px;
        }
        
        .session-fee {
          text-align: right;
        }
        
        .fee-amount {
          display: block;
          font-size: 24px;
          font-weight: bold;
          color: #28a745;
        }
        
        .fee-label {
          display: block;
          font-size: 12px;
          color: #6c757d;
          text-transform: uppercase;
        }
        
        .request-details {
          background: #f8f9fa;
          padding: 12px;
          border-radius: 8px;
          margin-bottom: 16px;
        }
        
        .request-details p {
          margin: 4px 0;
          font-size: 14px;
          color: #495057;
        }
        
        .request-actions {
          display: flex;
          gap: 12px;
        }
        
        .accept-btn, .reject-btn {
          flex: 1;
          padding: 12px 20px;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .accept-btn {
          background: #28a745;
          color: white;
        }
        
        .accept-btn:hover {
          background: #218838;
          transform: translateY(-1px);
        }
        
        .reject-btn {
          background: #dc3545;
          color: white;
        }
        
        .reject-btn:hover {
          background: #c82333;
          transform: translateY(-1px);
        }
        
        @media (max-width: 768px) {
          .mentor-booking-requests {
            padding: 16px;
          }
          
          .request-header {
            flex-direction: column;
            gap: 12px;
          }
          
          .session-fee {
            text-align: left;
          }
          
          .request-actions {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
};

export default MentorBookingRequests;