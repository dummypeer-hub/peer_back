import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import VideoCall from './VideoCall';

const VideoCallPage = () => {
  const { callId } = useParams();
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Get user from localStorage or URL params
    const userData = localStorage.getItem('user');
    if (userData) {
      setUser(JSON.parse(userData));
    } else {
      // If no localStorage, try to get from URL params or use default
      const urlParams = new URLSearchParams(window.location.search);
      const userParam = urlParams.get('user');
      if (userParam) {
        try {
          setUser(JSON.parse(decodeURIComponent(userParam)));
        } catch (e) {
          console.error('Failed to parse user from URL:', e);
        }
      }
    }
  }, []);

  const handleEndCall = () => {
    window.close();
  };

  if (!user) {
    return <div>Loading...</div>;
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
