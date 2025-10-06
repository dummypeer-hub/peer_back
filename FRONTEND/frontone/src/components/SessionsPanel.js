import React, { useState, useEffect } from 'react';
import axios from 'axios';
import config from '../config';
import io from 'socket.io-client';
import FeedbackModal from './FeedbackModal';
import './SessionsPanel.css';

const SessionsPanel = ({ user, onJoinSession }) => {
  const [sessions, setSessions] = useState([]);
  const [socket, setSocket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackData, setFeedbackData] = useState(null);

  useEffect(() => {
    console.log('SessionsPanel connecting to socket:', config.SOCKET_URL);
    const socketConnection = io(config.SOCKET_URL, {
      transports: ['websocket', 'polling'],
      timeout: 20000,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000
    });
    setSocket(socketConnection);
    
    socketConnection.on('connect', () => {
      console.log(`✅ ${user.role} socket connected, joining room user_${user.id}`);
      socketConnection.emit('join_user_room', user.id);
      
      // Retry room joining after 2 seconds if not confirmed
      setTimeout(() => {
        socketConnection.emit('join_user_room', user.id);
        console.log(`🔄 Retrying room join for user ${user.id}`);
      }, 2000);
    });
    
    socketConnection.on('user_room_joined', (data) => {
      console.log(`✅ Room join confirmed:`, data);
    });
    
    if (user.role === 'mentor') {
      socketConnection.on('call_request', (data) => {
        console.log('📞 Mentor received call_request:', data);
        // Add new session immediately to UI
        const newSession = {
          id: data.callId,
          status: 'pending',
          created_at: new Date().toISOString(),
          mentee_name: data.menteeName,
          channel_name: data.channelName
        };
        setSessions(prev => [newSession, ...prev.filter(s => s.id !== data.callId)]);
        console.log('🔄 Refreshing sessions after call request...');
        setTimeout(() => loadSessions(), 500); // Delayed refresh to ensure DB is updated
      });
      
      socketConnection.on('global_call_request', (data) => {
        if (data.targetMentorId === user.id) {
          console.log('📡 Mentor received global_call_request:', data);
          // Add new session immediately to UI
          const newSession = {
            id: data.callId,
            status: 'pending',
            created_at: new Date().toISOString(),
            mentee_name: data.menteeName,
            channel_name: data.channelName
          };
          setSessions(prev => [newSession, ...prev.filter(s => s.id !== data.callId)]);
          console.log('🔄 Refreshing sessions after global call request...');
          setTimeout(() => loadSessions(), 500);
        }
      });
    } else {
      socketConnection.on('call_accepted', (data) => {
        console.log('✅ Mentee received call_accepted:', data);
        // Update session status immediately
        setSessions(prev => prev.map(session => 
          session.id === data.callId 
            ? { ...session, status: 'accepted', accepted_at: new Date().toISOString() }
            : session
        ));
        setTimeout(() => loadSessions(), 500);
      });
      
      socketConnection.on('call_rejected', (data) => {
        console.log('❌ Mentee received call_rejected');
        // Update session status immediately
        setSessions(prev => prev.map(session => 
          session.id === data.callId 
            ? { ...session, status: 'rejected', ended_at: new Date().toISOString() }
            : session
        ));
        setTimeout(() => loadSessions(), 500);
      });
    }
    
    socketConnection.on('disconnect', () => {
      console.log(`❌ ${user.role} socket disconnected`);
    });
    
    socketConnection.on('connect_error', (error) => {
      console.error(`❌ ${user.role} socket connection error:`, error);
    });
    
    return () => {
      socketConnection.disconnect();
    };
  }, [user.id, user.role]);

  useEffect(() => {
    loadSessions();
    
    // Check for expired sessions every 30 seconds
    const expiredInterval = setInterval(() => {
      checkExpiredSessions();
    }, 30000);
    
    // Refresh sessions every 10 seconds to ensure real-time updates
    const refreshInterval = setInterval(() => {
      loadSessions();
    }, 10000);
    
    return () => {
      clearInterval(expiredInterval);
      clearInterval(refreshInterval);
    };
  }, []);
  
  const checkExpiredSessions = async () => {
    const now = Date.now();
    const expiredSessions = sessions.filter(session => {
      if (session.status === 'active' && session.started_at && !session.ended_at) {
        const startTime = new Date(session.started_at);
        const elapsed = Math.floor((now - startTime.getTime()) / 1000);
        return elapsed >= 600; // 10 minutes
      }
      return false;
    });
    
    // Auto-complete expired sessions
    for (const session of expiredSessions) {
      try {
        await axios.post(`${config.API_BASE_URL}/video-call/${session.id}/end`, {
          userId: user.id,
          reason: 'time_expired'
        });
      } catch (error) {
        console.error('Failed to end expired session:', error);
      }
    }
    
    if (expiredSessions.length > 0) {
      loadSessions(); // Refresh if any sessions were expired
    }
  };

  const loadSessions = async () => {
    try {
      const response = await axios.get(`${config.API_BASE_URL}/video-calls/${user.id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setSessions(response.data.calls || []);
    } catch (error) {
      console.error('Failed to load sessions:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptCall = async (callId) => {
    try {
      const response = await axios.post(`${config.API_BASE_URL}/video-call/${callId}/accept`, {
        mentorId: user.id
      });
      
      console.log('Accept call - calling onJoinSession:', { callId, hasCallback: !!onJoinSession });
      // Use onJoinSession callback to handle video call in same component
      if (onJoinSession) {
        onJoinSession(callId, null);
      } else {
        console.error('No onJoinSession callback provided for accept call');
      }
      
      // Refresh sessions to update status
      loadSessions();
    } catch (error) {
      console.error('Error accepting call:', error);
    }
  };

  const handleRejectCall = async (callId) => {
    try {
      await axios.post(`${config.API_BASE_URL}/video-call/${callId}/reject`, {
        mentorId: user.id
      });
      
      loadSessions();
    } catch (error) {
      console.error('Error rejecting call:', error);
    }
  };

  const handleJoinSession = (callId, channelName) => {
    console.log('SessionsPanel handleJoinSession called:', { callId, channelName, hasCallback: !!onJoinSession });
    // Use onJoinSession callback to handle video call in same component
    if (onJoinSession) {
      onJoinSession(callId, channelName);
    } else {
      console.error('No onJoinSession callback provided to SessionsPanel');
    }
  };

  const handleDeleteSession = async (sessionId) => {
    try {
      await axios.delete(`${config.API_BASE_URL}/video-call/${sessionId}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      // Remove from local state
      setSessions(prev => prev.filter(session => session.id !== sessionId));
    } catch (error) {
      console.error('Error deleting session:', error);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'pending': return '#ff9800';
      case 'accepted': return '#4CAF50';
      case 'active': return '#2196F3';
      case 'completed': return '#9E9E9E';
      case 'rejected': return '#f44336';
      default: return '#9E9E9E';
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return 'N/A';
    
    // Create date object and adjust for local timezone
    const date = new Date(timestamp);
    
    // Check if date is valid
    if (isNaN(date.getTime())) return 'Invalid Date';
    
    // Get current time for comparison
    const now = new Date();
    console.log('Current time:', now.toLocaleString());
    console.log('Timestamp:', timestamp);
    console.log('Parsed date:', date.toLocaleString());
    
    return date.toLocaleString('en-IN', { 
      year: 'numeric',
      month: 'short', 
      day: 'numeric',
      hour: '2-digit', 
      minute: '2-digit',
      hour12: true
    });
  };

  if (loading) {
    return (
      <div className="sessions-panel">
        <div className="sessions-header">
          <h2>Sessions</h2>
        </div>
        <div className="loading">Loading sessions...</div>
      </div>
    );
  }

  return (
    <div className="sessions-panel">
      <div className="sessions-header">
        <h2>Video Call Sessions</h2>
        <button onClick={loadSessions} className="refresh-btn">🔄</button>
      </div>
      
      <div className="sessions-list">
        {sessions.length === 0 ? (
          <div className="no-sessions">
            <p>No sessions found</p>
          </div>
        ) : (
          sessions.map(session => (
            <div key={session.id} className="session-card">
              <div className="session-avatar">
                <div className="avatar-circle">
                  {user.role === 'mentor' ? session.mentee_name?.charAt(0) || 'M' : session.mentor_name?.charAt(0) || 'M'}
                </div>
              </div>
              
              <div className="session-info">
                <div className="session-participants">
                  <h4 className="participant-name">
                    {user.role === 'mentor' ? session.mentee_name || 'Unknown Mentee' : session.mentor_name || 'Unknown Mentor'}
                  </h4>
                  <span className="session-type">
                    {user.role === 'mentor' ? 'Incoming Call Request' : 'Video Call Session'}
                  </span>
                </div>
                
                <div className="session-details">
                  <div className="detail-row">
                    <span className="detail-label">📅 Created:</span>
                    <span className="detail-value">{formatTime(session.created_at)}</span>
                  </div>
                  {session.started_at && (
                    <div className="detail-row">
                      <span className="detail-label">🚀 Started:</span>
                      <span className="detail-value">{formatTime(session.started_at)}</span>
                    </div>
                  )}
                  {session.ended_at && (
                    <div className="detail-row">
                      <span className="detail-label">⏹️ Ended:</span>
                      <span className="detail-value">{formatTime(session.ended_at)}</span>
                    </div>
                  )}
                </div>
                
                <div className="session-status">
                  <span 
                    className="status-badge" 
                    style={{ backgroundColor: getStatusColor(session.status) }}
                  >
                    {session.status.toUpperCase()}
                  </span>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSession(session.id);
                    }}
                    className="delete-session-btn"
                    title="Delete Session"
                  >
                    🗑️
                  </button>
                </div>
              </div>
              
              <div className="session-actions">
                {user.role === 'mentor' && session.status === 'pending' && (
                  <>
                    <button 
                      onClick={() => handleAcceptCall(session.id)}
                      className="accept-btn"
                    >
                      ✅ Accept
                    </button>
                    <button 
                      onClick={() => handleRejectCall(session.id)}
                      className="reject-btn"
                    >
                      ❌ Reject
                    </button>
                  </>
                )}
                
                {session.status === 'accepted' && !session.ended_at && (
                  <button 
                    onClick={() => handleJoinSession(session.id, session.channel_name)}
                    className="join-btn primary"
                  >
                    <span className="btn-icon">🎥</span>
                    <span className="btn-text">Join Meeting</span>
                  </button>
                )}
                
                {session.status === 'completed' && (
                  <div className="completed-actions">
                    <span className="meeting-completed">✅ Meeting Completed</span>
                    {user.role === 'mentee' && (
                      <button 
                        onClick={() => {
                          setFeedbackData({
                            sessionId: session.id,
                            mentorId: null,
                            menteeId: user.id
                          });
                          setShowFeedbackModal(true);
                        }}
                        className="feedback-btn"
                        title="Leave Feedback"
                      >
                        ⭐ Feedback
                      </button>
                    )}
                  </div>
                )}
                
                {session.status === 'active' && session.started_at && !session.ended_at && (
                  (() => {
                    const startTime = new Date(session.started_at);
                    const elapsed = Math.floor((Date.now() - startTime.getTime()) / 1000);
                    console.log('Session check:', {
                      sessionId: session.id,
                      startTime: startTime.toLocaleString(),
                      elapsed,
                      remaining: 600 - elapsed
                    });
                    
                    // If more than 10 minutes have passed, mark as expired
                    if (elapsed >= 600) {
                      // Auto-update session to completed
                      setTimeout(async () => {
                        try {
                          await axios.post(`${config.API_BASE_URL}/video-call/${session.id}/end`, {
                            userId: user.id,
                            reason: 'time_expired'
                          });
                          loadSessions(); // Refresh sessions
                        } catch (error) {
                          console.error('Failed to end expired session:', error);
                        }
                      }, 100);
                      return <span className="session-expired">Session Expired</span>;
                    }
                    
                    return (
                      <button 
                        onClick={() => handleJoinSession(session.id, session.channel_name)}
                        className="join-btn active"
                      >
                        🔴 Rejoin Active Session ({Math.floor((600 - elapsed) / 60)}:{((600 - elapsed) % 60).toString().padStart(2, '0')} left)
                      </button>
                    );
                  })()
                )}
              </div>
            </div>
          ))
        )}
      </div>
      
      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={showFeedbackModal}
        onClose={() => {
          setShowFeedbackModal(false);
          loadSessions(); // Refresh sessions after feedback
        }}
        sessionData={feedbackData}
        user={user}
      />
    </div>
  );
};

export default SessionsPanel;
