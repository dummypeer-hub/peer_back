import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import VideoCall from './VideoCall';

const VideoCallPage = () => {
  const { callId } = useParams();
  const [user, setUser] = useState(null);

  useEffect(() => {
    console.log('VideoCallPage: Attempting to get user data');
    
    // Try multiple methods to get user data
    let userData = localStorage.getItem('user');
    
    if (userData) {
      console.log('VideoCallPage: Found user in localStorage');
      setUser(JSON.parse(userData));
      return;
    }
    
    // Try URL params
    const urlParams = new URLSearchParams(window.location.search);
    const userParam = urlParams.get('user');
    if (userParam) {
      try {
        console.log('VideoCallPage: Found user in URL params');
        const parsedUser = JSON.parse(decodeURIComponent(userParam));
        setUser(parsedUser);
        // Store in localStorage for future use
        localStorage.setItem('user', JSON.stringify(parsedUser));
        return;
      } catch (e) {
        console.error('Failed to parse user from URL:', e);
      }
    }
    
    // Try to get from parent window
    if (window.opener && window.opener.localStorage) {
      try {
        const parentUserData = window.opener.localStorage.getItem('user');
        if (parentUserData) {
          console.log('VideoCallPage: Found user in parent window');
          const parsedUser = JSON.parse(parentUserData);
          setUser(parsedUser);
          localStorage.setItem('user', JSON.stringify(parsedUser));
          return;
        }
      } catch (e) {
        console.error('Failed to get user from parent window:', e);
      }
    }
    
    console.log('VideoCallPage: No user data found');
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
