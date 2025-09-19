import React, { useState } from 'react';
import config from '../config';
import axios from 'axios';

const ZoomAuthButton = ({ user, onAuthSuccess }) => {
  const [loading, setLoading] = useState(false);

  const handleZoomAuth = async () => {
    try {
      setLoading(true);
      
      // Get Zoom OAuth URL
      const response = await axios.get(`${config.API_BASE_URL}/zoom/auth-url`);
      const { authUrl } = response.data;
      
      // Open Zoom OAuth in new window
      const authWindow = window.open(authUrl, 'zoom-auth', 'width=500,height=600');
      
      // Listen for auth completion
      const checkClosed = setInterval(() => {
        if (authWindow.closed) {
          clearInterval(checkClosed);
          setLoading(false);
          if (onAuthSuccess) {
            onAuthSuccess();
          }
        }
      }, 1000);
      
    } catch (error) {
      console.error('Zoom auth error:', error);
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={handleZoomAuth}
      disabled={loading}
      className="zoom-auth-btn"
    >
      {loading ? 'Connecting...' : '🔗 Connect Zoom Account'}
    </button>
  );
};

export default ZoomAuthButton;