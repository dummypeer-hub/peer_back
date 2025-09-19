import React, { useState, useEffect } from 'react';
import config from '../config';
import axios from 'axios';

const ZoomStatusChecker = ({ user }) => {
  const [zoomStatus, setZoomStatus] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkZoomStatus();
  }, [user.id]);

  const checkZoomStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${config.API_BASE_URL}/zoom/status/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setZoomStatus(response.data);
    } catch (error) {
      console.error('Failed to check Zoom status:', error);
      setZoomStatus({ connected: false });
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm('Are you sure you want to disconnect your Zoom account?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${config.API_BASE_URL}/zoom/disconnect/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setZoomStatus({ connected: false });
      alert('Zoom account disconnected successfully');
    } catch (error) {
      console.error('Failed to disconnect Zoom:', error);
      alert('Failed to disconnect Zoom account');
    }
  };

  if (loading) {
    return <div className="zoom-status loading">Checking Zoom connection...</div>;
  }

  if (zoomStatus?.connected) {
    return (
      <div className="zoom-status connected">
        <div className="status-indicator">
          <span className="status-icon">✅</span>
          <span className="status-text">Zoom Connected</span>
        </div>
        <div className="zoom-details">
          <p><strong>Email:</strong> {zoomStatus.zoomEmail}</p>
          <p><strong>Connected:</strong> {new Date(zoomStatus.connectedAt).toLocaleDateString()}</p>
        </div>
        <button onClick={handleDisconnect} className="disconnect-btn">
          🔌 Disconnect Zoom
        </button>
      </div>
    );
  }

  return (
    <div className="zoom-status disconnected">
      <div className="status-indicator">
        <span className="status-icon">❌</span>
        <span className="status-text">Zoom Not Connected</span>
      </div>
      <p className="status-message">Connect your Zoom account to host video calls</p>
    </div>
  );
};

export default ZoomStatusChecker;