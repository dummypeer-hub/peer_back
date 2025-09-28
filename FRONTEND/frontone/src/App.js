import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { HelmetProvider, Helmet } from 'react-helmet-async';
import axios from 'axios';
import config from './config';
import Login from './components/Login';
import Signup from './components/Signup';
import ForgotPassword from './components/ForgotPassword';
import Dashboard from './components/Dashboard';
import MentorDashboard from './components/MentorDashboard';
import MenteeDashboard from './components/MenteeDashboard';
import MentorCallHandler from './components/MentorCallHandler';
import VideoCallPage from './components/VideoCallPage';

import './App.css';

function App() {
  const [currentView, setCurrentView] = useState('login');
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Check if user is already logged in
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    
    if (token && userData) {
      const parsedUser = JSON.parse(userData);
      console.log('Loading user from storage:', parsedUser);
      setUser(parsedUser);
      setCurrentView('dashboard');
    }
  }, []);

  useEffect(() => {
    // Load existing profile data when editor opens
    if (user && user.role === 'mentor') {
      loadProfileData();
    }
  }, [user]);

  const loadProfileData = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${config.API_BASE_URL}/mentor/profile/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.data.profile) {
        // Profile data will be loaded in MentorProfileEditor component
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
    }
  };

  const handleLogin = (userData) => {
    // Create unique session key based on email and role
    const sessionKey = `session_${userData.email}_${userData.role}`;
    localStorage.setItem('token', localStorage.getItem('token'));
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('currentSession', sessionKey);
    setUser(userData);
    setCurrentView('dashboard');
  };

  const handleSignup = (userData) => {
    // Create unique session key based on email and role
    const sessionKey = `session_${userData.email}_${userData.role}`;
    localStorage.setItem('token', localStorage.getItem('token'));
    localStorage.setItem('user', JSON.stringify(userData));
    localStorage.setItem('currentSession', sessionKey);
    setUser(userData);
    setCurrentView('dashboard');
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('currentSession');
    setUser(null);
    setCurrentView('login');
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'login':
        return (
          <Login
            onLogin={handleLogin}
            onSwitchToSignup={() => setCurrentView('signup')}
            onForgotPassword={() => setCurrentView('forgot-password')}
          />
        );
      case 'signup':
        return (
          <Signup
            onSignup={handleSignup}
            onSwitchToLogin={() => setCurrentView('login')}
          />
        );
      case 'forgot-password':
        return (
          <ForgotPassword
            onBack={() => setCurrentView('login')}
          />
        );
      case 'dashboard':
        // Force correct dashboard based on stored user role
        const storedUser = localStorage.getItem('user');
        const currentUser = storedUser ? JSON.parse(storedUser) : user;
        
        return currentUser && currentUser.role === 'mentor' ? (
          <MentorCallHandler user={currentUser}>
            <MentorDashboard
              user={currentUser}
              onLogout={handleLogout}
            />
          </MentorCallHandler>
        ) : (
          <MenteeDashboard
            user={currentUser || user}
            onLogout={handleLogout}
          />
        );
      default:
        return null;
    }
  };

  return (
    <HelmetProvider>
      <Router>
        <div className="App">
          <Helmet>
            <title>PeerVerse - Connect with Expert Mentors | Online Mentorship Platform</title>
            <meta name="description" content="Join PeerVerse, India's leading mentorship platform. Connect with expert mentors for career guidance, skill development, interview preparation, and academic support." />
            <meta name="keywords" content="mentorship platform, online mentoring, career guidance, skill development, interview preparation, academic support, expert mentors, professional development, learning platform, career coaching" />
            <link rel="canonical" href="https://www.peerverse.in" />
          </Helmet>
          <Routes>
            <Route path="/video-call/:callId" element={<VideoCallPage />} />
            <Route path="/*" element={renderCurrentView()} />
          </Routes>
        </div>
      </Router>
    </HelmetProvider>
  );
}

export default App;
