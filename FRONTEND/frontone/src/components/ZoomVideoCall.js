import React, { useState, useEffect } from 'react';
import config from '../config';
import axios from 'axios';
import './VideoCall.css';
import './ZoomVideoCall.css';

const ZoomVideoCall = ({ callId, user, onEndCall }) => {
  const [meetingData, setMeetingData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [callDuration, setCallDuration] = useState(0);
  const [sessionStartTime, setSessionStartTime] = useState(null);
  const [showTimeWarning, setShowTimeWarning] = useState(false);

  useEffect(() => {
    loadMeetingData();
  }, [callId]);

  useEffect(() => {
    if (sessionStartTime) {
      const interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - sessionStartTime.getTime()) / 1000);
        setCallDuration(elapsed);
        
        if (elapsed >= 570 && elapsed < 600) {
          setShowTimeWarning(true);
        } else {
          setShowTimeWarning(false);
        }
        
        if (elapsed >= 600) {
          handleAutoEndCall();
        }
      }, 1000);
      
      return () => clearInterval(interval);
    }
  }, [sessionStartTime]);

  const loadMeetingData = async () => {
    try {
      const response = await axios.get(`${config.API_BASE_URL}/video-call/${callId}/status`);
      const call = response.data.call;
      
      if (call.status === 'accepted' && call.join_url) {
        setMeetingData({
          joinUrl: call.join_url,
          startUrl: call.start_url,
          meetingId: call.zoom_meeting_id,
          status: call.status
        });
        
        if (call.started_at) {
          setSessionStartTime(new Date(call.started_at));
        }
      } else if (call.status === 'pending') {
        setError('Meeting is still pending acceptance');
      } else {
        setError('Meeting not available or has ended');
      }
    } catch (error) {
      console.error('Failed to load meeting data:', error);
      setError('Failed to load meeting information');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinMeeting = () => {
    if (meetingData?.joinUrl) {
      window.open(meetingData.joinUrl, '_blank');
      
      // Start session timer if mentor
      if (user.role === 'mentor' && !sessionStartTime) {
        handleStartSession();
      }
    }
  };

  const handleStartSession = async () => {
    try {
      const startTime = new Date();
      setSessionStartTime(startTime);
      
      await axios.post(`${config.API_BASE_URL}/video-call/${callId}/start`, {
        userId: user.id,
        startTime: startTime.toISOString()
      });
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  };

  const handleAutoEndCall = async () => {
    try {
      // End the meeting via Zoom API if we have meeting data
      if (meetingData?.meetingId) {
        await axios.post(`${config.API_BASE_URL}/zoom/end-meeting`, {
          meetingId: meetingData.meetingId,
          mentorId: user.role === 'mentor' ? user.id : null
        });
      }
      
      // Update our database
      await axios.post(`${config.API_BASE_URL}/video-call/${callId}/end`, {
        userId: user.id,
        reason: 'time_limit'
      });
      
      alert('Meeting has ended automatically after 10 minutes.');
      onEndCall();
    } catch (error) {
      console.error('Error auto-ending call:', error);
      onEndCall();
    }
  };

  const handleEndCall = async () => {
    try {
      await axios.post(`${config.API_BASE_URL}/video-call/${callId}/end`, {
        userId: user.id
      });
      
      onEndCall();
    } catch (error) {
      console.error('Error ending call:', error);
      onEndCall();
    }
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="video-call-container">
        <div className="loading">Loading meeting...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="video-call-container">
        <div className="error">{error}</div>
        <button onClick={onEndCall}>Back to Dashboard</button>
      </div>
    );
  }

  return (
    <div className="video-call-container">
      <div className="video-call-header">
        <div className="call-info">
          <h3>🎥 Zoom Meeting Session</h3>
          <div className="timer-container">
            {sessionStartTime ? (
              <>
                <div className="timer-display">
                  <span className="timer-label">Session Time:</span>
                  <span className={`call-duration ${showTimeWarning ? 'warning' : callDuration >= 480 ? 'caution' : ''}`}>
                    {formatTime(callDuration)}
                  </span>
                  <span className="time-limit">/ 10:00</span>
                </div>
                {callDuration >= 480 && callDuration < 570 && (
                  <div className="time-caution">⏰ Less than 2 minutes remaining</div>
                )}
                {showTimeWarning && (
                  <div className="time-warning">🚨 30 seconds remaining! Meeting will end automatically.</div>
                )}
              </>
            ) : user.role === 'mentee' ? (
              <div className="waiting-status">
                <span className="waiting-timer">⏳ Waiting for mentor to start 10-minute session...</span>
              </div>
            ) : (
              <div className="mentor-status">
                <span className="mentor-ready">✅ Ready to start 10-minute session</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="zoom-meeting-content">
        <div className="meeting-info">
          <h4>Meeting Ready</h4>
          <p>Click the button below to join the Zoom meeting</p>
          {meetingData?.meetingId && (
            <p className="meeting-id">Meeting ID: {meetingData.meetingId}</p>
          )}
        </div>

        <div className="meeting-actions">
          <button 
            onClick={handleJoinMeeting}
            className="join-zoom-btn"
          >
            🎥 Join Zoom Meeting
          </button>
          
          {user.role === 'mentor' && !sessionStartTime && (
            <button 
              onClick={handleStartSession}
              className="start-session-btn"
            >
              ▶️ Start Session Timer
            </button>
          )}
          
          <button 
            onClick={handleEndCall}
            className="end-call-btn"
          >
            📞 End Call
          </button>
        </div>

        <div className="meeting-instructions">
          <h5>Instructions:</h5>
          <ul>
            <li>The meeting will automatically end after 10 minutes</li>
            <li>Make sure you have Zoom installed or use the web client</li>
            <li>The mentor should start the session timer when both participants join</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default ZoomVideoCall;