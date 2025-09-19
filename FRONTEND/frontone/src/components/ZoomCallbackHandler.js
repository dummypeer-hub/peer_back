import React, { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import config from '../config';
import axios from 'axios';

const ZoomCallbackHandler = () => {
  const [searchParams] = useSearchParams();

  useEffect(() => {
    const handleCallback = async () => {
      const code = searchParams.get('code');
      const error = searchParams.get('error');
      
      if (error) {
        console.error('Zoom OAuth error:', error);
        window.close();
        return;
      }
      
      if (code) {
        try {
          const user = JSON.parse(localStorage.getItem('user'));
          
          await axios.post(`${config.API_BASE_URL}/zoom/callback`, {
            code,
            mentorId: user.id
          });
          
          // Close the popup window
          window.close();
        } catch (error) {
          console.error('Failed to process Zoom callback:', error);
          window.close();
        }
      }
    };
    
    handleCallback();
  }, [searchParams]);

  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h3>Connecting your Zoom account...</h3>
      <p>Please wait while we complete the setup.</p>
    </div>
  );
};

export default ZoomCallbackHandler;