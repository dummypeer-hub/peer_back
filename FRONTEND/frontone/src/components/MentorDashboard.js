import React, { useState, useEffect } from 'react';
import axios from 'axios';
import config from '../config';
import MentorProfileEditor from './MentorProfileEditor';
import BlogSection from './BlogSection';
import CreateBlog from './CreateBlog';
import NotificationPanel from './NotificationPanel';
import CommunitySection from './CommunitySection';
import SessionsPanel from './SessionsPanel';
import RobustWebRTCCall from './RobustWebRTCCall';
import MentorBookingRequests from './MentorBookingRequests';

import './MentorDashboard.css';
import './LogoStyles.css';
import './MentorLogoStyles.css';

const MentorDashboard = ({ user, onLogout }) => {
  // All useState hooks must be at the top
  const [activeCall, setActiveCall] = useState(null);
  const [activeTab, setActiveTab] = useState('home');
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [profileCompletion, setProfileCompletion] = useState(25);
  const [profilePicture, setProfilePicture] = useState('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMzAiIGZpbGw9IiNFMUU1RTkiLz4KPHN2ZyB3aWR0aD0iMjQiIGhlaWdodD0iMjQiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeD0iMTgiIHk9IjE4Ij4KPHBhdGggZD0iTTEyIDEyQzE0LjIwOTEgMTIgMTYgMTAuMjA5MSAxNiA4QzE2IDUuNzkwODYgMTQuMjA5MSA0IDEyIDRDOS43OTA4NiA0IDggNS43OTA4NiA4IDhDOCAxMC4yMDkxIDkuNzkwODYgMTIgMTIgMTJaIiBmaWxsPSIjNjY3RUVBIi8+CjxwYXRoIGQ9Ik0xMiAxNEM5LjMzIDEzLjk5IDcuMDEgMTUuNjIgNiAxOEMxMC4wMSAyMCAxMy45OSAyMCAxOCAxOEMxNi45OSAxNS42MiAxNC42NyAxMy45OSAxMiAxNFoiIGZpbGw9IiM2NjdFRUEiLz4KPHN2Zz4KPHN2Zz4=');
  const [stats, setStats] = useState({
    totalSessions: 0,
    completedSessions: 0,
    pendingSessions: 0,
    totalBlogs: 0,
    walletBalance: 0
  });
  const [upcomingSessions, setUpcomingSessions] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showCreateBlog, setShowCreateBlog] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [feedback, setFeedback] = useState([]);
  const [overallRating, setOverallRating] = useState({ rating: 0, count: 0 });
  const [upiDetails, setUpiDetails] = useState({ upi_id: '', holder_name: '' });
  const [showUpiForm, setShowUpiForm] = useState(false);
  const [upiLoading, setUpiLoading] = useState(false);
  const [upiMessage, setUpiMessage] = useState('');
  const [mentorPayments, setMentorPayments] = useState([]);
  
  // All function definitions before useEffect
  const handleJoinSession = (callId) => {
    setActiveCall({ callId });
  };
  
  const handleEndCall = () => {
    setActiveCall(null);
  };

  const loadStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${config.API_BASE_URL}/mentor/stats/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setStats(response.data);
      setProfileCompletion(response.data.profileCompletion);
    } catch (error) {
      console.error('Failed to load stats:', error);
    }
  };

  const loadUpcomingSessions = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${config.API_BASE_URL}/video-calls/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const pending = response.data.calls?.filter(call => call.status === 'pending') || [];
      setUpcomingSessions(pending);
    } catch (error) {
      console.error('Failed to load upcoming sessions:', error);
    }
  };

  const loadNotifications = async () => {
    if (!user?.id) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${config.API_BASE_URL}/notifications/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const notifs = response.data.notifications || [];
      setNotifications(notifs);
      setUnreadCount(notifs.filter(n => !n.is_read).length);
    } catch (error) {
      console.error('Failed to load notifications:', error);
    }
  };

  const loadFeedback = async () => {
    if (!user?.id) return;
    
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${config.API_BASE_URL}/mentor/${user.id}/feedback`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setFeedback(response.data.feedback || []);
      setOverallRating(response.data.overallRating || { rating: 0, count: 0 });
    } catch (error) {
      console.error('Failed to load feedback:', error);
    }
  };

  const loadUpiDetails = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${config.API_BASE_URL}/mentor/${user.id}/upi`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.upiDetails) {
        setUpiDetails(response.data.upiDetails);
      }
    } catch (error) {
      console.error('Failed to load UPI details:', error);
    }
  };

  const loadMentorPayments = async () => {
    try {
      const token = localStorage.getItem('token');
      const resp = await axios.get(`${config.API_BASE_URL}/payments/mentor/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMentorPayments(resp.data.payments || []);
    } catch (err) {
      console.error('Failed to load mentor payments:', err);
    }
  };

  const saveUpiDetails = async () => {
    if (!upiDetails.upi_id.trim()) {
      setUpiMessage('UPI ID is required');
      return;
    }
    
    const upiRegex = /^[a-zA-Z0-9.\-_]{2,256}@[a-zA-Z]{2,64}$/;
    if (!upiRegex.test(upiDetails.upi_id.trim())) {
      setUpiMessage('Please enter a valid UPI ID (e.g., yourname@paytm)');
      return;
    }
    
    setUpiLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${config.API_BASE_URL}/mentor/${user.id}/upi`, upiDetails, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUpiMessage('UPI details saved successfully!');
      setShowUpiForm(false);
      setTimeout(() => setUpiMessage(''), 3000);
    } catch (error) {
      const errorMessage = error.response?.data?.error || 'Failed to save UPI details';
      setUpiMessage(errorMessage);
      console.error('Save UPI error:', error);
    } finally {
      setUpiLoading(false);
    }
  };

  const deleteUpiDetails = async () => {
    if (window.confirm('Are you sure you want to delete your UPI details?')) {
      try {
        const token = localStorage.getItem('token');
        await axios.delete(`${config.API_BASE_URL}/mentor/${user.id}/upi`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setUpiDetails({ upi_id: '', holder_name: '' });
        setUpiMessage('UPI details deleted successfully!');
        setTimeout(() => setUpiMessage(''), 3000);
      } catch (error) {
        setUpiMessage('Failed to delete UPI details');
        console.error('Delete UPI error:', error);
      }
    }
  };
  
  const loadProfileData = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${config.API_BASE_URL}/mentor/profile/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.profile) {
        if (response.data.profile.basicInfo?.profilePicture) {
          setProfilePicture(response.data.profile.basicInfo.profilePicture);
        }
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
    }
  };

  const handleProfileSave = (profileData) => {
    setShowProfileEditor(false);
    if (profileData.basicInfo?.profilePicture) {
      setProfilePicture(profileData.basicInfo.profilePicture);
    }
    loadStats();
    loadProfileData();
  };

  // useEffect after all function definitions
  useEffect(() => {
    if (user?.id) {
      loadProfileData();
      loadNotifications();
      loadStats();
      loadUpcomingSessions();
      loadFeedback();
      loadUpiDetails();
      loadMentorPayments();
      
      const interval = setInterval(() => {
        loadNotifications();
        loadStats();
        loadFeedback();
      }, 30000);
      
      return () => clearInterval(interval);
    }
  }, [user]);
  
  // Early return after all hooks and functions
  if (activeCall) {
    return (
      <RobustWebRTCCall 
        callId={activeCall.callId}
        user={user}
        onEndCall={handleEndCall}
      />
    );
  }

  const renderHome = () => (
    <div className="home-content">
      <div className="welcome-header">
        <h2>Welcome, {user.username}!</h2>
        <p>Ready to mentor and inspire others today?</p>
      </div>

      <div className="profile-completion">
        <h3>Profile Completion: {profileCompletion}%</h3>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${profileCompletion}%` }}></div>
        </div>
        <button onClick={() => setActiveTab('profile')} className="complete-profile-btn">
          Complete Profile
        </button>
      </div>

      <div className="stats-section">
        <div className="stat-card">
          <h4>Total Sessions</h4>
          <span className="stat-number">{stats.totalSessions}</span>
        </div>
        <div className="stat-card">
          <h4>Completed Sessions</h4>
          <span className="stat-number">{stats.completedSessions}</span>
        </div>
        <div className="stat-card">
          <h4>Total Blogs</h4>
          <span className="stat-number">{stats.totalBlogs}</span>
        </div>
        <div className="stat-card">
          <h4>Wallet Balance</h4>
          <span className="stat-number">₹{stats.walletBalance}</span>
        </div>
      </div>

      <div className="upcoming-sessions">
        <h3>Upcoming Sessions</h3>
        {upcomingSessions.length > 0 ? (
          upcomingSessions.map(session => (
            <div key={session.id} className="session-card">
              <div className="session-info">
                <h4>{session.mentee_name}</h4>
                <p>{new Date(session.created_at).toLocaleDateString()} at {new Date(session.created_at).toLocaleTimeString()}</p>
                <p>Video Call Request</p>
              </div>
              <div className="session-actions">
                <button 
                  className="start-btn"
                  onClick={() => setActiveTab('sessions')}
                >
                  View Request
                </button>
              </div>
            </div>
          ))
        ) : (
          <p>No pending session requests</p>
        )}
      </div>

      <div className="recent-notifications">
        <h3>Recent Notifications</h3>
        {notifications.length > 0 ? (
          <ul>
            {notifications.slice(0, 3).map((notification, index) => (
              <li key={notification.id || index}>
                {typeof notification === 'string' ? notification : notification.message || notification.title}
              </li>
            ))}
          </ul>
        ) : (
          <p>No new notifications</p>
        )}
      </div>
    </div>
  );

  const renderSessions = () => (
    <div className="sessions-content">
      <MentorBookingRequests user={user} />
      <SessionsPanel 
        user={user} 
        onJoinSession={handleJoinSession}
      />
    </div>
  );

  const renderBlogs = () => {
    if (showCreateBlog) {
      return (
        <CreateBlog 
          user={user} 
          onBack={() => setShowCreateBlog(false)}
        />
      );
    }
    
    return (
      <div className="blogs-content">
        <div className="blogs-header">
          <h3>My Blogs</h3>
          <button 
            className="create-blog-btn"
            onClick={() => setShowCreateBlog(true)}
          >
            ➕ Create Blog
          </button>
        </div>
        <BlogSection user={user} userRole="mentor" />
      </div>
    );
  };

  const renderCommunity = () => (
    <div className="community-content">
      <CommunitySection user={user} userRole="mentor" />
    </div>
  );

  const renderWallet = () => (
    <div className="wallet-content">
      <div className="wallet-balance">
        <h3>Current Wallet Balance: ₹{stats.walletBalance}</h3>
      </div>
      
      <div className="upi-section">
        <div className="upi-header">
          <h4>UPI Payment Details</h4>
          <button 
            className="edit-upi-btn"
            onClick={() => setShowUpiForm(!showUpiForm)}
          >
            {upiDetails.upi_id ? '✏️ Edit UPI' : '➕ Add UPI'}
          </button>
        </div>
        
        {upiDetails.upi_id && !showUpiForm && (
          <div className="upi-display">
            <div className="upi-item">
              <span className="upi-label">UPI ID:</span>
              <span className="upi-value">{upiDetails.upi_id}</span>
            </div>
            {upiDetails.holder_name && (
              <div className="upi-item">
                <span className="upi-label">Account Holder:</span>
                <span className="upi-value">{upiDetails.holder_name}</span>
              </div>
            )}
            <div className="upi-actions">
              <button 
                className="delete-upi-btn"
                onClick={deleteUpiDetails}
              >
                🗑️ Delete UPI
              </button>
            </div>
          </div>
        )}
        
        {showUpiForm && (
          <div className="upi-form">
            <div className="form-group">
              <label>UPI ID *</label>
              <input
                type="text"
                placeholder="yourname@paytm / yourname@gpay"
                value={upiDetails.upi_id}
                onChange={(e) => setUpiDetails({...upiDetails, upi_id: e.target.value})}
              />
            </div>
            <div className="form-group">
              <label>Account Holder Name</label>
              <input
                type="text"
                placeholder="Full name as per bank account"
                value={upiDetails.holder_name}
                onChange={(e) => setUpiDetails({...upiDetails, holder_name: e.target.value})}
              />
            </div>
            <div className="form-actions">
              <button 
                className="save-btn"
                onClick={saveUpiDetails}
                disabled={upiLoading}
              >
                {upiLoading ? 'Saving...' : 'Save UPI Details'}
              </button>
              <button 
                className="cancel-btn"
                onClick={() => setShowUpiForm(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        )}

      <div className="mentor-payments">
        <h4>Recent Payments</h4>
        {mentorPayments.length === 0 ? (
          <p>No payments yet</p>
        ) : (
          <ul className="mentor-payments-list">
            {mentorPayments.map(p => (
              <li key={p.id} className="mentor-payment-item">
                <div><strong>Amount:</strong> ₹{p.amount}</div>
                <div><strong>Booking:</strong> {p.booking_id}</div>
                <div><strong>Paid At:</strong> {p.created_at ? new Date(p.created_at).toLocaleString() : '—'}</div>
                <div><strong>Status:</strong> {p.status}</div>
              </li>
            ))}
          </ul>
        )}
      </div>
        
        {upiMessage && (
          <div className={`message ${upiMessage.includes('success') ? 'success' : 'error'}`}>
            {upiMessage}
          </div>
        )}
      </div>
      
      <div className="transaction-history">
        <h4>Recent Transactions</h4>
        <div className="transaction-item">
          <span>Session with John Doe</span>
          <span>+₹500</span>
        </div>
      </div>
    </div>
  );

  const renderNotifications = () => (
    <div className="notifications-content">
      <div className="notifications-header">
        <h3>Notifications</h3>
        <button 
          className="clear-all-btn"
          onClick={async () => {
            try {
              const token = localStorage.getItem('token');
              await axios.delete(`${config.API_BASE_URL}/notifications/${user.id}`, {
                headers: { Authorization: `Bearer ${token}` }
              });
              setNotifications([]);
              setUnreadCount(0);
              localStorage.removeItem(`notifications_${user.id}`);
              localStorage.removeItem(`notifications_${user.id}_time`);
            } catch (error) {
              console.error('Failed to clear notifications:', error);
            }
          }}
        >
          Clear All
        </button>
      </div>
      
      <div className="notification-list">
        {notifications.length > 0 ? (
          notifications.map((notification, index) => (
            <div key={notification.id || index} className={`notification-item ${!notification.is_read ? 'unread' : ''}`}>
              <div className="notification-title">{notification.title || 'Notification'}</div>
              <div className="notification-message">
                {typeof notification === 'string' ? notification : (notification.message || 'No message')}
              </div>
              <div className="notification-time">
                {notification.created_at ? new Date(notification.created_at).toLocaleString('en-US', { 
                  month: 'short', 
                  day: 'numeric',
                  hour: '2-digit', 
                  minute: '2-digit',
                  hour12: true 
                }) : ''}
              </div>
            </div>
          ))
        ) : (
          <p>No notifications</p>
        )}
      </div>
    </div>
  );

  const renderFeedback = () => (
    <div className="feedback-content">
      <div className="feedback-header">
        <h3>My Feedback & Ratings</h3>
        <div className="overall-rating">
          <div className="rating-display">
            <span className="rating-number">{overallRating.rating.toFixed(1)}</span>
            <div className="stars">
              {[1, 2, 3, 4, 5].map(star => (
                <span 
                  key={star} 
                  className={`star ${star <= Math.round(overallRating.rating) ? 'filled' : ''}`}
                >
                  ⭐
                </span>
              ))}
            </div>
            <span className="rating-count">({overallRating.count} reviews)</span>
          </div>
        </div>
      </div>
      
      <div className="feedback-list">
        {feedback.length > 0 ? (
          feedback.map((item, index) => (
            <div key={index} className="feedback-item">
              <div className="feedback-header-item">
                <div className="mentee-info">
                  <strong>{item.mentee_name}</strong>
                  <span className="session-date">
                    {new Date(item.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="rating-stars">
                  {[1, 2, 3, 4, 5].map(star => (
                    <span 
                      key={star} 
                      className={`star ${star <= item.rating ? 'filled' : ''}`}
                    >
                      ⭐
                    </span>
                  ))}
                  <span className="rating-number">({item.rating}/5)</span>
                </div>
              </div>
              {item.feedback && (
                <div className="feedback-text">
                  "{item.feedback}"
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="no-feedback">
            <p>No feedback received yet. Complete more sessions to receive feedback from mentees!</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="settings-content">
      <h3>Settings</h3>
      <div className="settings-section">
        <h4>Profile Settings</h4>
        <button onClick={() => setActiveTab('profile')} className="edit-profile-btn">
          Edit Profile
        </button>
      </div>
      <div className="settings-section">
        <h4>🎥 Video Call Settings</h4>
        <p>Video calls are powered by WebRTC technology for secure peer-to-peer communication</p>
        <div className="webrtc-info">
          <div className="info-item">
            <span className="info-icon">✅</span>
            <span>HD Video & Audio Quality</span>
          </div>
          <div className="info-item">
            <span className="info-icon">🔒</span>
            <span>End-to-End Encrypted</span>
          </div>
          <div className="info-item">
            <span className="info-icon">💬</span>
            <span>Real-time Chat</span>
          </div>
          <div className="info-item">
            <span className="info-icon">🖥️</span>
            <span>Screen Sharing</span>
          </div>
          <div className="info-item">
            <span className="info-icon">⏱️</span>
            <span>10-Minute Sessions</span>
          </div>
        </div>
      </div>
    </div>
  );

  const renderProfile = () => (
    <div className="profile-content">
      <div className="profile-header-section">
        <h2>Edit Profile</h2>
        <p>Complete your mentor profile to attract more mentees</p>
      </div>
      <MentorProfileEditor
        user={user}
        onClose={() => setActiveTab('home')}
        onSave={(profileData) => {
          handleProfileSave(profileData);
          setActiveTab('home');
        }}
        embedded={true}
      />
    </div>
  );

  const renderContent = () => {
    switch (activeTab) {
      case 'home': return renderHome();
      case 'profile': return renderProfile();
      case 'sessions': return renderSessions();
      case 'blogs': return renderBlogs();
      case 'community': return renderCommunity();
      case 'wallet': return renderWallet();
      case 'feedback': return renderFeedback();
      case 'notifications': return renderNotifications();
      case 'settings': return renderSettings();
      default: return renderHome();
    }
  };

  return (
    <div className="mentor-dashboard">
      <div className="sidebar">
        <div className="sidebar-header">
          <img src="/finall_logo_verse.png" alt="PeerVerse" className="dashboard-logo" />
        </div>
        
        <div className="mentor-profile-section">
          <div className="mentor-avatar">
            <img src={profilePicture} alt="Profile" />
          </div>
          <div className="mentor-info">
            <h4>{user.username}</h4>
            <p>Mentor</p>
          </div>
        </div>
        
        <nav className="sidebar-nav">
          <button 
            className={`nav-btn ${activeTab === 'home' ? 'active' : ''}`}
            onClick={() => setActiveTab('home')}
          >
            🏠 Home
          </button>
          <button 
            className={`nav-btn ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            👤 Edit Profile
          </button>
          <button 
            className={`nav-btn ${activeTab === 'sessions' ? 'active' : ''}`}
            onClick={() => setActiveTab('sessions')}
          >
            📅 Sessions
          </button>
          <button 
            className={`nav-btn ${activeTab === 'blogs' ? 'active' : ''}`}
            onClick={() => setActiveTab('blogs')}
          >
            📝 Blogs
          </button>
          <button 
            className={`nav-btn ${activeTab === 'community' ? 'active' : ''}`}
            onClick={() => setActiveTab('community')}
          >
            👥 Community
          </button>
          <button 
            className={`nav-btn ${activeTab === 'wallet' ? 'active' : ''}`}
            onClick={() => setActiveTab('wallet')}
          >
            💰 Wallet
          </button>
          <button 
            className={`nav-btn ${activeTab === 'feedback' ? 'active' : ''}`}
            onClick={() => setActiveTab('feedback')}
          >
            ⭐ Feedback
          </button>
          <button 
            className={`nav-btn ${activeTab === 'notifications' ? 'active' : ''}`}
            onClick={() => {
              setActiveTab('notifications');
              loadNotifications();
            }}
          >
            🔔 Notifications
            {unreadCount > 0 && (
              <span className="notification-badge">{unreadCount}</span>
            )}
          </button>
          <button 
            className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            ⚙ Settings
          </button>
          <button className="nav-btn logout-btn" onClick={onLogout}>
            🚪 Logout
          </button>
        </nav>
      </div>

      <div className="main-content">
        {renderContent()}
      </div>

      <NotificationPanel 
        user={user}
        isOpen={showNotifications}
        onClose={() => {
          setShowNotifications(false);
          loadNotifications();
        }}
      />
    </div>
  );
};

export default MentorDashboard;