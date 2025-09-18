import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import VideoCall from './VideoCall';

const VideoCallPage = () => {
  const { callId } = useParams();
  const [user, setUser] = useState(null);

  useEffect(() => {
    console.log('VideoCallPage: Loading user data');
    
    // Try to get user data from videoCallUser first, then regular user
    let userData = localStorage.getItem('videoCallUser') || localStorage.getItem('user');
    
    if (userData) {
      try {
        const parsedUser = JSON.parse(userData);
        console.log('VideoCallPage: Found user data:', parsedUser);
        setUser(parsedUser);
        
        // Ensure token is available
        const token = localStorage.getItem('videoCallToken') || localStorage.getItem('token');
        if (token) {
          localStorage.setItem('token', token);
        }
      } catch (e) {
        console.error('Failed to parse user data:', e);
      }
    } else {
      console.log('VideoCallPage: No user data found');
    }
  }, []);

  const handleEndCall = () => {
    window.close();
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
