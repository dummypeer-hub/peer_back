import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import VideoCall from './VideoCall';

const VideoCallPage = () => {
  const { callId } = useParams();
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Get user from localStorage (same window, so data should be available)
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    }
  }, []);

  const handleEndCall = () => {
    // Navigate back to dashboard
    window.location.href = '/';
  };

  if (!user) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <h2>Loading Video Call...</h2>
        <p>Call ID: {callId}</p>
        <p>Checking user authentication...</p>
        <button onClick={() => {
          // Try to get user data from parent window
          if (window.opener && window.opener.localStorage) {
            const userData = window.opener.localStorage.getItem('user');
            if (userData) {
              setUser(JSON.parse(userData));
            }
          }
        }}>
          Retry Authentication
        </button>
      </div>
    );
  }

  return (
    <VideoCall 
      callId={callId}
      user={user}
      onEndCall={handleEndCall}
    />
  );
};

export default VideoCallPage;
