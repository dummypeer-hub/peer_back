// Payment Integration v2.0 - Force cache refresh
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import config from '../config';
import BlogSection from './BlogSection';
import NotificationPanel from './NotificationPanel';
import CommunityBrowser from './CommunityBrowser';
import RobustWebRTCCall from './RobustWebRTCCall';
import CallRequestModal from './CallRequestModal';
import MenteeProfileEditor from './MenteeProfileEditor';
import BookingRequestFlow from './BookingRequestFlow';

import SessionsPanel from './SessionsPanel';
import './MenteeDashboard.css';
import './InterestStyles.css';
import './LogoStyles.css';
import './EnhancedMentorCard.css';

const MenteeDashboard = ({ user, onLogout, onJoinSession }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedInterest, setSelectedInterest] = useState('');
  const [mentors, setMentors] = useState([]);
  const [filteredMentors, setFilteredMentors] = useState([]);
  const [loading, setLoading] = useState(false);
  // Payments
  const [paymentsHistory, setPaymentsHistory] = useState([]);
  const [payRequests, setPayRequests] = useState([]);

  // Current UI section (moved up so useEffect can reference it without TDZ)
  const [currentSection, setCurrentSection] = useState('home');

  const interestCategories = {
    placement: [
      'DSA', 'Frontend Development', 'Backend Development', 'Full Stack', 'Mobile Development',
      'DevOps', 'Cloud Computing', 'Machine Learning', 'Data Science', 'Cybersecurity',
      'System Design', 'Database Management', 'API Development', 'Testing', 'UI/UX Design',
      'Product Management', 'Aptitude', 'Resume Building', 'Interview Preparation', 'Coding Practice'
    ],
    college_reviews: [
      'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
      'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
      'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
      'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
      'Uttarakhand', 'West Bengal', 'Delhi', 'Mumbai'
    ],
    skills_learning: [
      'JavaScript', 'Python', 'Java', 'C++', 'React', 'Angular', 'Vue.js', 'Node.js',
      'Spring Boot', 'Django', 'Flask', 'MongoDB', 'MySQL', 'PostgreSQL', 'AWS',
      'Azure', 'Docker', 'Kubernetes', 'Git', 'Linux'
    ],
    projects: [
      'Web Development', 'Mobile Apps', 'Desktop Applications', 'Game Development',
      'AI/ML Projects', 'Data Analytics', 'Blockchain', 'IoT', 'AR/VR', 'E-commerce',
      'Social Media', 'Healthcare', 'Education', 'Finance', 'Entertainment',
      'Open Source', 'Startup Ideas', 'Research Projects', 'Hackathon Projects', 'Portfolio Projects'
    ],
    hackathons: [
      'Problem Solving', 'Team Formation', 'Idea Generation', 'Prototype Development',
      'Presentation Skills', 'Time Management', 'Technology Selection', 'UI/UX Design',
      'Backend Development', 'Frontend Development', 'Database Design', 'API Integration',
      'Deployment', 'Testing', 'Documentation', 'Pitch Preparation', 'Demo Creation',
      'Judging Criteria', 'Networking', 'Post-Hackathon Steps'
    ],
    study_help: [
      'Mathematics', 'Physics', 'Chemistry', 'Computer Science', 'Electronics', 'Mechanical',
      'Civil Engineering', 'Electrical Engineering', 'GATE Preparation', 'JEE Preparation',
      'NEET Preparation', 'CAT Preparation', 'GRE Preparation', 'TOEFL Preparation',
      'IELTS Preparation', 'Semester Exams', 'Assignment Help', 'Project Reports',
      'Research Papers', 'Thesis Writing'
    ]
  };

  useEffect(() => {
    loadMentors();
  }, []);

  useEffect(() => {
    if (currentSection === 'payments' && user?.id) {
      loadPayments();
      loadPayRequests();
    }
  }, [currentSection, user]);

  // Load payments history and pending pay requests
  const loadPayments = async () => {
    try {
      const token = localStorage.getItem('token');
      const resp = await axios.get(`${config.API_BASE_URL}/payments/mentee/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPaymentsHistory(resp.data.payments || []);
    } catch (err) {
      console.error('Failed to load payments history:', err);
    }
  };

  const loadPayRequests = async () => {
    try {
      const token = localStorage.getItem('token');
      const resp = await axios.get(`${config.API_BASE_URL}/mentee/${user.id}/pay-requests`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPayRequests(resp.data.requests || []);
    } catch (err) {
      console.error('Failed to load pay requests:', err);
    }
  };

  const loadMentors = async () => {
    setLoading(true);
    try {
      // Check cache first
      const cacheKey = 'mentors_list';
      const cached = localStorage.getItem(cacheKey);
      const cacheTime = localStorage.getItem(`${cacheKey}_time`);
      
      if (cached && cacheTime && Date.now() - parseInt(cacheTime) < 15 * 60 * 1000) {
        const mentorsData = JSON.parse(cached);
        setMentors(mentorsData);
        setFilteredMentors(mentorsData);
        setLoading(false);
        return;
      }
      
      const token = localStorage.getItem('token');
      const response = await axios.get(`${config.API_BASE_URL}/mentors`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      const mentorsData = response.data.mentors || [];
      setMentors(mentorsData);
      setFilteredMentors(mentorsData);
      
      // Cache the result
      localStorage.setItem(cacheKey, JSON.stringify(mentorsData));
      localStorage.setItem(`${cacheKey}_time`, Date.now().toString());
    } catch (error) {
      console.error('Failed to load mentors:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    let filtered = mentors;
    
    // Comprehensive text search
    if (searchQuery) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(mentor => {
        // Search in name
        if (mentor.name?.toLowerCase().includes(query)) return true;
        
        // Search in bio
        if (mentor.bio?.toLowerCase().includes(query)) return true;
        
        // Search in skills
        if (mentor.skills?.some(skill => {
          const skillName = typeof skill === 'object' ? skill.name : skill;
          return skillName?.toLowerCase().includes(query);
        })) return true;
        
        // Search in education (degree, field, institution)
        if (mentor.education?.some(edu => {
          return edu.degree?.toLowerCase().includes(query) ||
                 edu.field?.toLowerCase().includes(query) ||
                 edu.institution?.toLowerCase().includes(query) ||
                 edu.school?.toLowerCase().includes(query);
        })) return true;
        
        // Search in background (company, position, description)
        if (mentor.background?.some(bg => {
          return bg.company?.toLowerCase().includes(query) ||
                 bg.organization?.toLowerCase().includes(query) ||
                 bg.position?.toLowerCase().includes(query) ||
                 bg.title?.toLowerCase().includes(query) ||
                 bg.description?.toLowerCase().includes(query) ||
                 bg.location?.toLowerCase().includes(query);
        })) return true;
        
        // Search in languages
        if (mentor.languages?.some(lang => {
          const langName = typeof lang === 'object' ? lang.name : lang;
          return langName?.toLowerCase().includes(query);
        })) return true;
        
        // Search in interests (both flat array and categorized)
        if (mentor.interests?.some(interest => {
          const interestName = typeof interest === 'object' ? interest.name : interest;
          return interestName?.toLowerCase().includes(query);
        })) return true;
        
        // Search in categorized interests
        if (mentor.interestsByCategory) {
          for (const [category, tags] of Object.entries(mentor.interestsByCategory)) {
            if (category.toLowerCase().includes(query)) return true;
            if (tags?.some(tag => tag?.toLowerCase().includes(query))) return true;
          }
        }
        
        return false;
      });
    }
    
    // Apply filters
    // College filter
    if (selectedFilters.college) {
      filtered = filtered.filter(mentor => {
        return mentor.education?.some(edu => {
          const college = edu.institution || edu.school;
          return college?.trim() === selectedFilters.college;
        });
      });
    }
    
    // Skill filter
    if (selectedFilters.skill) {
      filtered = filtered.filter(mentor => 
        mentor.skills?.some(skill => {
          const skillName = typeof skill === 'object' ? skill.name : skill;
          return skillName?.trim() === selectedFilters.skill;
        })
      );
    }
    
    // Language filter
    if (selectedFilters.language) {
      filtered = filtered.filter(mentor => 
        mentor.languages?.some(language => {
          const langName = typeof language === 'object' ? language.name : language;
          return langName?.trim() === selectedFilters.language;
        })
      );
    }
    
    // Interest filter (works with both flat and categorized interests)
    if (selectedFilters.interest) {
      filtered = filtered.filter(mentor => {
        // Check flat interests array
        if (Array.isArray(mentor.interests) && mentor.interests.includes(selectedFilters.interest)) {
          return true;
        }
        // Check categorized interests
        if (mentor.interestsByCategory) {
          for (const tags of Object.values(mentor.interestsByCategory)) {
            if (Array.isArray(tags) && tags.includes(selectedFilters.interest)) {
              return true;
            }
          }
        }
        return false;
      });
    }
    
    // Company filter
    if (selectedFilters.company) {
      filtered = filtered.filter(mentor => 
        mentor.background?.some(bg => {
          const company = bg.company || bg.organization;
          return company?.trim() === selectedFilters.company;
        })
      );
    }
    

    
    // Legacy interest filter
    if (selectedInterest) {
      filtered = filtered.filter(mentor => 
        mentor.interests?.some(interest => {
          const interestName = typeof interest === 'object' ? interest.name : interest;
          return interestName?.toLowerCase().includes(selectedInterest.toLowerCase());
        })
      );
    }
    
    setFilteredMentors(filtered);
  };

  const [favorites, setFavorites] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [selectedMentor, setSelectedMentor] = useState(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState({
    colleges: [],
    skills: [],
    languages: [],
    interests: [],
    companies: []
  });
  const [selectedFilters, setSelectedFilters] = useState({
    college: '',
    skill: '',
    language: '',
    interest: '',
    company: ''
  });
  const [activeCall, setActiveCall] = useState(null);
  const [showCallModal, setShowCallModal] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [menteeProfile, setMenteeProfile] = useState(null);
  const [stats, setStats] = useState({
    availableMentors: 0,
    favoriteMentors: 0,
    completedSessions: 0,
    hoursLearned: 0
  });
  const [showInterestBrowser, setShowInterestBrowser] = useState(false);
  const [recommendedMentors, setRecommendedMentors] = useState([]);
  const [popularBlogs, setPopularBlogs] = useState([]);
  const [showFeedbackModal, setShowFeedbackModal] = useState(false);
  const [feedbackSession, setFeedbackSession] = useState(null);
  const [showBookingFlow, setShowBookingFlow] = useState(false);
  const [selectedMentorForBooking, setSelectedMentorForBooking] = useState(null);

  const mainInterests = [
    'PLACEMENT',
    'COLLEGE REVIEWS', 
    'SKILLS LEARNING',
    'PROJECTS',
    'HACKATHONS',
    'STUDY HELP'
  ];

  useEffect(() => {
    if (user?.id) {
      loadFavorites();
      loadUnreadCount();
      loadMenteeProfile();
      loadMenteeStats();
      loadRecommendedMentors();
      loadPopularBlogs();
    }
  }, [user]);
  
  // Refresh popular blogs when returning to home section
  useEffect(() => {
    if (currentSection === 'home' && user?.id) {
      loadPopularBlogs();
    }
  }, [currentSection, user?.id]);
  
  const loadRecommendedMentors = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${config.API_BASE_URL}/mentors/recommended/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setRecommendedMentors(response.data.mentors || []);
    } catch (error) {
      console.error('Failed to load recommended mentors:', error);
    }
  };
  
  const loadPopularBlogs = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${config.API_BASE_URL}/blogs/popular`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPopularBlogs(response.data.blogs || []);
    } catch (error) {
      console.error('Failed to load popular blogs:', error);
    }
  };
  
  const handleViewBlog = async (blogId) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${config.API_BASE_URL}/blogs/${blogId}/view`, {
        userId: user.id
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
    } catch (error) {
      console.error('Failed to track blog view:', error);
    }
  };
  
  const submitFeedback = async (rating, feedback) => {
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${config.API_BASE_URL}/session-feedback`, {
        sessionId: feedbackSession.id,
        menteeId: user.id,
        mentorId: feedbackSession.mentor_id,
        rating,
        feedback
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setShowFeedbackModal(false);
      setFeedbackSession(null);
      alert('Thank you for your feedback!');
    } catch (error) {
      console.error('Failed to submit feedback:', error);
      alert('Failed to submit feedback. Please try again.');
    }
  };

  const loadMenteeStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${config.API_BASE_URL}/mentee/stats/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      // Update the stats in the home section
      setStats(response.data);
    } catch (error) {
      console.error('Failed to load mentee stats:', error);
    }
  };

  const loadMenteeProfile = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${config.API_BASE_URL}/mentee/profile/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMenteeProfile(response.data.profile);
    } catch (error) {
      console.error('Failed to load mentee profile:', error);
    }
  };

  useEffect(() => {
    if (mentors.length > 0) {
      generateFilters();
    }
  }, [mentors]);

  const generateFilters = () => {
    const colleges = new Set();
    const skills = new Set();
    const languages = new Set();
    const companies = new Set();
    const interests = new Set();

    mentors.forEach(mentor => {
      // Extract colleges from all education entries
      mentor.education?.forEach(edu => {
        const college = edu.institution || edu.school;
        if (college && college.trim()) colleges.add(college.trim());
      });
      
      // Extract all skills
      mentor.skills?.forEach(skill => {
        const skillName = typeof skill === 'object' ? skill.name : skill;
        if (skillName && skillName.trim()) skills.add(skillName.trim());
      });
      
      // Extract all languages
      mentor.languages?.forEach(language => {
        const langName = typeof language === 'object' ? language.name : language;
        if (langName && langName.trim()) languages.add(langName.trim());
      });
      
      // Extract companies from all background entries
      mentor.background?.forEach(bg => {
        const company = bg.company || bg.organization;
        if (company && company.trim()) companies.add(company.trim());
      });
      
      // Extract interests from both flat array and categorized
      if (Array.isArray(mentor.interests)) {
        mentor.interests.forEach(interest => {
          if (interest && interest.trim()) interests.add(interest.trim());
        });
      }
      
      if (mentor.interestsByCategory) {
        Object.values(mentor.interestsByCategory).forEach(tags => {
          if (Array.isArray(tags)) {
            tags.forEach(tag => {
              if (tag && tag.trim()) interests.add(tag.trim());
            });
          }
        });
      }
    });

    setFilters({
      colleges: Array.from(colleges).sort(),
      skills: Array.from(skills).sort(),
      languages: Array.from(languages).sort(),
      interests: Array.from(interests).sort(),
      companies: Array.from(companies).sort()
    });
  };

  const clearFilters = () => {
    setSelectedFilters({
      college: '',
      skill: '',
      language: '',
      interest: '',
      company: ''
    });
    setSelectedInterest('');
    setSearchQuery('');
    setFilteredMentors(mentors);
  };

  const handleFilterChange = (filterType, value) => {
    setSelectedFilters(prev => ({
      ...prev,
      [filterType]: value
    }));
    setTimeout(() => handleSearch(), 100);
  };

  const loadFavorites = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${config.API_BASE_URL}/mentee/${user.id}/favorites`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setFavorites(response.data.favorites || []);
    } catch (error) {
      console.error('Failed to load favorites:', error);
    }
  };

  const handleCall = (mentorId) => {
    const mentor = mentors.find(m => m.id === mentorId);
    setSelectedMentorForBooking(mentor);
    setShowBookingFlow(true);
  };

  const handleBookingComplete = ({ bookingId, status }) => {
    setShowBookingFlow(false);
    setSelectedMentorForBooking(null);
    if (status === 'ready') {
      alert('Payment successful! You can now join the session from the Sessions tab.');
      setCurrentSection('sessions');
    }
  };

  const handleMessage = (mentorId) => {
    // Simulate messaging
    alert(`Opening chat with mentor. This feature will be implemented with real-time messaging.`);
  };

  const handleFavorite = async (mentorId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${config.API_BASE_URL}/mentee/favorite`, {
        menteeId: user.id,
        mentorId
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.favorited) {
        setFavorites([...favorites, mentorId]);
      } else {
        setFavorites(favorites.filter(id => id !== mentorId));
      }
    } catch (error) {
      console.error('Failed to update favorite:', error);
    }
  };

  const loadUnreadCount = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${config.API_BASE_URL}/notifications/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const unread = response.data.notifications?.filter(n => !n.is_read).length || 0;
      setUnreadCount(unread);
    } catch (error) {
      console.error('Failed to load notification count:', error);
    }
  };

  const renderMentorCard = (mentor) => {
    const college = mentor.education && mentor.education.length > 0 
      ? mentor.education[0].institution || mentor.education[0].school || 'Not specified'
      : 'Not specified';
    
    return (
      <div key={mentor.id} className="mentor-card" onClick={() => setSelectedMentor(mentor)}>
        <div className="mentor-header">
          <div className="mentor-avatar">
            <img src={mentor.profilePicture || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iODAiIGhlaWdodD0iODAiIHZpZXdCb3g9IjAgMCA4MCA4MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iNDAiIGN5PSI0MCIgcj0iNDAiIGZpbGw9IiNFMUU1RTkiLz4KPHN2ZyB3aWR0aD0iMzIiIGhlaWdodD0iMzIiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeD0iMjQiIHk9IjI0Ij4KPHBhdGggZD0iTTEyIDEyQzE0LjIwOTEgMTIgMTYgMTAuMjA5MSAxNiA4QzE2IDUuNzkwODYgMTQuMjA5MSA0IDEyIDRDOS43OTA4NiA0IDggNS43OTA4NiA4IDhDOCAxMC4yMDkxIDkuNzkwODYgMTIgMTIgMTJaIiBmaWxsPSIjNjY3RUVBIi8+CjxwYXRoIGQ9Ik0xMiAxNEM5LjMzIDEzLjk5IDcuMDEgMTUuNjIgNiAxOEMxMC4wMSAyMCAxMy45OSAyMCAxOCAxOEMxNi45OSAxNS42MiAxNC42NyAxMy45OSAxMiAxNFoiIGZpbGw9IiM2NjdFRUEiLz4KPHN2Zz4KPHN2Zz4='} alt={mentor.name} />
          </div>
          <div className="mentor-basic-info">
            <h3>{mentor.name}</h3>
            <p className="mentor-college">{college}</p>
            <div className="mentor-rating">
              <span>⭐ {mentor.rating || 4.8} ({mentor.reviewCount || 25} reviews)</span>
            </div>
          </div>
          <button 
            onClick={(e) => { e.stopPropagation(); handleFavorite(mentor.id); }} 
            className={`favorite-icon ${favorites.includes(mentor.id) ? 'favorited' : ''}`}
          >
            {favorites.includes(mentor.id) ? '💖' : '🤍'}
          </button>
        </div>
        
        <div className="mentor-skills-section">
          <h4>Skills:</h4>
          <div className="skills-list">
            {mentor.skills?.slice(0, 4).map((skill, index) => (
              <span key={index} className="skill-tag">{typeof skill === 'object' ? skill.name : skill}</span>
            ))}
            {mentor.skills?.length > 4 && (
              <span className="more-skills">+{mentor.skills.length - 4} more</span>
            )}
          </div>
        </div>
        
        <div className="mentor-interests-section">
          <h4>Interests:</h4>
          <div className="interests-list">
            {mentor.interestsByCategory && Object.keys(mentor.interestsByCategory).length > 0 ? (
              <div className="interests-by-category-card">
                {Object.entries(mentor.interestsByCategory).slice(0, 2).map(([category, tags]) => (
                  tags && tags.length > 0 && (
                    <div key={category} className="interest-category-card">
                      <div className="category-name-card">{category.replace('_', ' ').toUpperCase()}</div>
                      <div className="category-tags-card">
                        {tags.slice(0, 2).map((tag, index) => (
                          <span key={index} className="interest-tag-card">{tag}</span>
                        ))}
                        {tags.length > 2 && <span className="more-tags-card">+{tags.length - 2}</span>}
                      </div>
                    </div>
                  )
                ))}
                {Object.keys(mentor.interestsByCategory).length > 2 && (
                  <div className="more-categories">+{Object.keys(mentor.interestsByCategory).length - 2} more categories</div>
                )}
              </div>
            ) : Array.isArray(mentor.interests) && mentor.interests.length > 0 ? (
              mentor.interests.slice(0, 3).map((interest, index) => (
                <span key={index} className="category-tag">{interest}</span>
              ))
            ) : (
              <span className="no-interests">No interests listed</span>
            )}
          </div>
        </div>
        
        <div className="mentor-actions">
          <button onClick={(e) => { e.stopPropagation(); handleCall(mentor.id); }} className="action-btn call">
            📞 Book Session
          </button>
          <button onClick={(e) => { e.stopPropagation(); handleMessage(mentor.id); }} className="action-btn message">
            💬 Message
          </button>
          <button onClick={(e) => { e.stopPropagation(); setSelectedMentor(mentor); }} className="action-btn view">
            👁️ View Profile
          </button>
        </div>
      </div>
    );
  };

  const handleCallStart = (callId, channelName) => {
    setActiveCall({ callId, channelName });
    setShowCallModal(false);
  };

  const handleCallEnd = () => {
    // Show feedback modal after call ends
    if (activeCall) {
      setFeedbackSession({
        id: activeCall.callId,
        mentor_id: selectedMentor?.id,
        rating: 0,
        feedback: ''
      });
      setShowFeedbackModal(true);
    }
    setActiveCall(null);
  };

  if (activeCall) {
    return (
      <RobustWebRTCCall 
        callId={activeCall.callId}
        user={user}
        onEndCall={handleCallEnd}
      />
    );
  }

  return (
    <div className="mentee-dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-left">
          <img src="/finall_logo_verse.png" alt="PeerVerse" className="dashboard-logo" />
          <nav className="main-nav">
            <button 
              className={`nav-link ${currentSection === 'home' ? 'active' : ''}`}
              onClick={() => setCurrentSection('home')}
            >
              Home
            </button>
            <button 
              className={`nav-link ${currentSection === 'mentors' ? 'active' : ''}`}
              onClick={() => setCurrentSection('mentors')}
            >
              Mentors
            </button>
            <button 
              className={`nav-link ${currentSection === 'blogs' ? 'active' : ''}`}
              onClick={() => setCurrentSection('blogs')}
            >
              Blogs
            </button>
            <button 
              className={`nav-link ${currentSection === 'community' ? 'active' : ''}`}
              onClick={() => setCurrentSection('community')}
            >
              Community
            </button>
            <button 
              className={`nav-link ${currentSection === 'sessions' ? 'active' : ''}`}
              onClick={() => setCurrentSection('sessions')}
            >
              Sessions
            </button>
            <button 
              className={`nav-link ${currentSection === 'profile' ? 'active' : ''}`}
              onClick={() => setCurrentSection('profile')}
            >
              Profile
            </button>
            <button 
              className={`nav-link ${currentSection === 'favorites' ? 'active' : ''}`}
              onClick={() => setCurrentSection('favorites')}
            >
              Favorites
            </button>
            <button 
              className={`nav-link ${currentSection === 'payments' ? 'active' : ''}`} 
              onClick={() => setCurrentSection('payments')}
            >
              Payments
            </button>
          </nav>
        </div>
        <div className="header-right">
          <button 
            className="notification-btn"
            onClick={() => setShowNotifications(true)}
          >
            🔔
            {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
          </button>
          <div className="user-profile">
            <img src={menteeProfile?.profile_picture || "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiNFMUU1RTkiLz4KPHN2ZyB3aWR0aD0iMTYiIGhlaWdodD0iMTYiIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0ibm9uZSIgeD0iMTIiIHk9IjEyIj4KPHBhdGggZD0iTTEyIDEyQzE0LjIwOTEgMTIgMTYgMTAuMjA5MSAxNiA4QzE2IDUuNzkwODYgMTQuMjA5MSA0IDEyIDRDOS43OTA4NiA0IDggNS43OTA4NiA4IDhDOCAxMC4yMDkxIDkuNzkwODYgMTIgMTIgMTJaIiBmaWxsPSIjNjY3RUVBIi8+CjxwYXRoIGQ9Ik0xMiAxNEM5LjMzIDEzLjk5IDcuMDEgMTUuNjIgNiAxOEMxMC4wMSAyMCAxMy45OSAyMCAxOCAxOEMxNi45OSAxNS42MiAxNC42NyAxMy45OSAxMiAxNFoiIGZpbGw9IiM2NjdFRUEiLz4KPHN2Zz4KPHN2Zz4="} alt="Profile" />
            <span>{menteeProfile?.name || user.username}</span>
            <button onClick={onLogout} className="logout-btn">Logout</button>
          </div>
        </div>
      </header>

      {currentSection === 'home' && (
        <>

          
          {/* Stats Section */}
          <div className="stats-section">
            <div className="stats-container">
              <div className="stat-item">
                <div className="stat-number">{stats.availableMentors}</div>
                <div className="stat-label">Available Mentors</div>
              </div>
              <div className="stat-item">
                <div className="stat-number">{stats.favoriteMentors}</div>
                <div className="stat-label">Favorite Mentors</div>
              </div>
              <div className="stat-item">
                <div className="stat-number">{stats.completedSessions}</div>
                <div className="stat-label">Completed Sessions</div>
              </div>
              <div className="stat-item">
                <div className="stat-number">{stats.hoursLearned}</div>
                <div className="stat-label">Hours Learned</div>
              </div>
            </div>
          </div>

          {/* Search Section */}
          <div className="search-section">
            <div className="search-container">
              <div className="search-bar">
                <input
                  type="text"
                  placeholder="Search by name, education, skills, background, languages, interests..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    // Real-time search with debounce
                    clearTimeout(window.searchTimeout);
                    window.searchTimeout = setTimeout(() => {
                      handleSearch();
                    }, 300);
                  }}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                />
                <button onClick={handleSearch} className="search-btn">
                  🔍 Search
                </button>
              </div>
              <div className="interest-browser">
                <button 
                  className="browse-toggle"
                  onClick={() => setShowInterestBrowser(!showInterestBrowser)}
                >
                  🎯 Browse by Interest {showInterestBrowser ? '▲' : '▼'}
                </button>
                
                {showInterestBrowser && (
                  <div className="interest-categories">
                    {mainInterests.map(category => (
                      <div key={category} className="interest-category-section">
                        <h4 className="category-header">{category}</h4>
                        <div className="category-tags">
                          {interestCategories[category.toLowerCase().replace(' ', '_')]?.map(tag => (
                            <button
                              key={tag}
                              className={`interest-tag-btn ${selectedInterest === tag ? 'selected' : ''}`}
                              onClick={() => {
                                setSelectedInterest(selectedInterest === tag ? '' : tag);
                                setTimeout(handleSearch, 100);
                              }}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="quick-actions">
            <div className="quick-actions-container">
              <button className="quick-action-btn" onClick={() => {
                setSelectedInterest('');
                setSearchQuery('');
                setShowInterestBrowser(false);
                setFilteredMentors(mentors);
              }}>
                🔍 All Mentors
              </button>
              <button className="quick-action-btn" onClick={() => {
                setSelectedInterest('JavaScript');
                setShowInterestBrowser(false);
                setTimeout(handleSearch, 100);
              }}>
                💻 JavaScript
              </button>
              <button className="quick-action-btn" onClick={() => {
                setSelectedInterest('Python');
                setShowInterestBrowser(false);
                setTimeout(handleSearch, 100);
              }}>
                🐍 Python
              </button>
              <button className="quick-action-btn" onClick={() => {
                setSelectedInterest('DSA');
                setShowInterestBrowser(false);
                setTimeout(handleSearch, 100);
              }}>
                🧮 DSA
              </button>
              {(selectedInterest || searchQuery) && (
                <button className="quick-action-btn clear-btn" onClick={() => {
                  setSelectedInterest('');
                  setSearchQuery('');
                  setShowInterestBrowser(false);
                  setFilteredMentors(mentors);
                }}>
                  ❌ Clear {selectedInterest ? `Filter: ${selectedInterest}` : `Search: ${searchQuery}`}
                </button>
              )}
            </div>
          </div>

          {/* Recommended Mentors Section */}
          {recommendedMentors.length > 0 && (
            <div className="recommended-section">
              <div className="section-header">
                <h2>🎯 Recommended for You</h2>
                <p>Mentors matching your interests</p>
              </div>
              <div className="mentors-grid">
                {recommendedMentors.map(renderMentorCard)}
              </div>
            </div>
          )}
          
          {/* Mentors Grid */}
          <div className="mentors-section">
            <div className="section-header">
              <h2>All Available Mentors</h2>
              <div className="search-results-info">
                <span className="results-count">
                  {filteredMentors.length} mentors found
                </span>
                {searchQuery && (
                  <span className="search-query">
                    for "{searchQuery}"
                  </span>
                )}
              </div>
            </div>
            
            {loading ? (
              <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Loading mentors...</p>
              </div>
            ) : (
              <div className="mentors-grid">
                {filteredMentors.length > 0 ? (
                  filteredMentors.map(renderMentorCard)
                ) : (
                  <div className="no-mentors">
                    <h3>No mentors found</h3>
                    <p>Try adjusting your search criteria</p>
                  </div>
                )}
              </div>
            )}
          </div>
          
          {/* Popular Blogs Section */}
          {popularBlogs.length > 0 && (
            <div className="popular-blogs-section">
              <div className="section-header">
                <h2>📝 Latest Blogs</h2>
                <p>Top 9 latest blogs from our mentors</p>
              </div>
              <BlogSection user={user} userRole="mentee" initialBlogs={popularBlogs} limit={9} />
            </div>
          )}
          
          {/* Landing Page Footer */}
          <div className="landing-footer">
            <div className="footer-content">
              <div className="footer-section">
                <h3>About PeerVerse</h3>
                <p>Connecting students with experienced mentors for personalized guidance and career growth.</p>
              </div>
              <div className="footer-section">
                <h3>Our Team</h3>
                <p>Passionate developers and educators committed to empowering the next generation.</p>
              </div>
              <div className="footer-section">
                <h3>Contact</h3>
                <p>Email: support@peerverse.in</p>
                <p>Phone: +91 9876543210</p>
              </div>
            </div>
            <div className="footer-bottom">
              <p>&copy; 2024 PeerVerse. All rights reserved.</p>
            </div>
          </div>
        </>
      )}

      {currentSection === 'payments' && (
        <div className="payments-page">
          <div className="payments-header">
            <h2>Payments</h2>
            <p>View your payment history and pending pay requests for confirmed sessions.</p>
          </div>

          <div className="payments-grid">
            <div className="payments-history">
              <h3>Payment History</h3>
              {paymentsHistory.length === 0 ? (
                <p>No payments found</p>
              ) : (
                <ul className="payments-list">
                  {paymentsHistory.map(p => (
                    <li key={p.id} className="payment-item">
                      <div><strong>Amount:</strong> ₹{p.amount}</div>
                      <div><strong>Status:</strong> {p.status}</div>
                      <div><strong>Booking:</strong> {p.booking_id}</div>
                      <div><strong>Date:</strong> {new Date(p.created_at).toLocaleString()}</div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="payments-requests">
              <h3>Pending Pay Requests</h3>
              {payRequests.length === 0 ? (
                <p>No pending payments</p>
              ) : (
                payRequests.map(r => (
                  <div key={r.booking_id} className="pay-request-card">
                    <div><strong>Mentor:</strong> {r.mentor_name}</div>
                    <div><strong>Amount:</strong> ₹{r.session_fee}</div>
                    <div><strong>Scheduled:</strong> {r.scheduled_time ? new Date(r.scheduled_time).toLocaleString() : 'Not scheduled'}</div>
                    <div className="pay-request-actions">
                      <button onClick={() => setCurrentSection('sessions')}>View Request</button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {currentSection === 'mentors' && (
        <div className="mentors-page">
          {/* Advanced Filters */}
          <div className="filters-section">
            <div className="filters-header">
              <h2>Find Mentors</h2>
              <button 
                onClick={() => setShowFilters(!showFilters)} 
                className="filter-toggle-btn"
              >
                🔍 Filters {showFilters ? '▲' : '▼'}
              </button>
            </div>
            
            {showFilters && (
              <div className="filters-grid">
                <div className="filter-group">
                  <label>College/University</label>
                  <select 
                    value={selectedFilters.college} 
                    onChange={(e) => handleFilterChange('college', e.target.value)}
                  >
                    <option value="">All Colleges</option>
                    {filters.colleges.map(college => (
                      <option key={college} value={college}>
                        {college}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="filter-group">
                  <label>Skills</label>
                  <select 
                    value={selectedFilters.skill} 
                    onChange={(e) => handleFilterChange('skill', e.target.value)}
                  >
                    <option value="">All Skills</option>
                    {filters.skills.map(skill => (
                      <option key={skill} value={skill}>
                        {skill}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="filter-group">
                  <label>Languages</label>
                  <select 
                    value={selectedFilters.language} 
                    onChange={(e) => handleFilterChange('language', e.target.value)}
                  >
                    <option value="">All Languages</option>
                    {filters.languages.map(language => (
                      <option key={language} value={language}>
                        {language}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="filter-group">
                  <label>Interests</label>
                  <select 
                    value={selectedFilters.interest} 
                    onChange={(e) => handleFilterChange('interest', e.target.value)}
                  >
                    <option value="">All Interests</option>
                    {filters.interests.map(interest => (
                      <option key={interest} value={interest}>
                        {interest}
                      </option>
                    ))}
                  </select>
                </div>
                
                <div className="filter-group">
                  <label>Company</label>
                  <select 
                    value={selectedFilters.company} 
                    onChange={(e) => handleFilterChange('company', e.target.value)}
                  >
                    <option value="">All Companies</option>
                    {filters.companies.map(company => (
                      <option key={company} value={company}>
                        {company}
                      </option>
                    ))}
                  </select>
                </div>
                

                
                <div className="filter-actions">
                  <button onClick={clearFilters} className="clear-filters-btn">
                    Clear All
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Mentors Grid */}
          <div className="mentors-section">
            <div className="section-header">
              <h2>All Mentors</h2>
              <div className="filter-results-info">
                <span className="results-count">
                  {filteredMentors.length} mentors found
                </span>
                {(selectedFilters.college || selectedFilters.skill || selectedFilters.language || selectedFilters.interest || selectedFilters.company) && (
                  <div className="active-filters">
                    <span>Filters: </span>
                    {selectedFilters.college && <span className="filter-tag">College: {selectedFilters.college}</span>}
                    {selectedFilters.skill && <span className="filter-tag">Skill: {selectedFilters.skill}</span>}
                    {selectedFilters.language && <span className="filter-tag">Language: {selectedFilters.language}</span>}
                    {selectedFilters.interest && <span className="filter-tag">Interest: {selectedFilters.interest}</span>}
                    {selectedFilters.company && <span className="filter-tag">Company: {selectedFilters.company}</span>}
                  </div>
                )}
              </div>
            </div>
            
            {loading ? (
              <div className="loading-container">
                <div className="loading-spinner"></div>
                <p>Loading mentors...</p>
              </div>
            ) : (
              <div className="mentors-grid">
                {filteredMentors.length > 0 ? (
                  filteredMentors.map(renderMentorCard)
                ) : (
                  <div className="no-mentors">
                    <h3>No mentors found</h3>
                    <p>Try adjusting your search criteria or filters</p>
                    <button onClick={clearFilters} className="clear-filters-btn">
                      Clear Filters
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {currentSection === 'blogs' && (
        <BlogSection user={user} userRole="mentee" />
      )}

      {currentSection === 'community' && (
        <CommunityBrowser user={user} />
      )}

      {currentSection === 'sessions' && (
        <SessionsPanel 
          user={user} 
          onJoinSession={(callId, channelName) => {
            setActiveCall({ callId, channelName });
          }}
        />
      )}

      {currentSection === 'favorites' && (
        <div className="favorites-section">
          <div className="section-header">
            <h2>⭐ Your Favorite Mentors</h2>
            <p>Mentors you've saved for quick access</p>
          </div>
          {favorites.length > 0 ? (
            <div className="mentors-grid">
              {mentors.filter(mentor => favorites.includes(mentor.id)).map(renderMentorCard)}
            </div>
          ) : (
            <div className="empty-state">
              <div className="empty-icon">⭐</div>
              <h3>No Favorite Mentors Yet</h3>
              <p>Start exploring mentors and add them to your favorites!</p>
              <button onClick={() => setCurrentSection('mentors')} className="cta-button">
                Browse Mentors
              </button>
            </div>
          )}
        </div>
      )}
      
      {currentSection === 'profile' && (
        <div className="profile-section">
          <MenteeProfileEditor 
            user={user}
            embedded={true}
            onSave={() => {
              loadMenteeProfile();
            }}
          />
        </div>
      )}

      <NotificationPanel 
        user={user}
        isOpen={showNotifications}
        onClose={() => {
          setShowNotifications(false);
          loadUnreadCount();
        }}
      />

      {/* Mentor Detail Modal */}
      {selectedMentor && (
        <div className="mentor-modal-overlay" onClick={() => setSelectedMentor(null)}>
          <div className="mentor-modal" onClick={(e) => e.stopPropagation()}>
            <button className="close-modal" onClick={() => setSelectedMentor(null)}>✕</button>
            <div className="mentor-detail">
              <div className="mentor-profile-header">
                <img src={selectedMentor.profilePicture || 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxjaXJjbGUgY3g9IjUwIiBjeT0iNTAiIHI9IjUwIiBmaWxsPSIjRTFFNUU5Ii8+Cjxzdmcgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHg9IjMwIiB5PSIzMCI+CjxwYXRoIGQ9Ik0xMiAxMkMxNC4yMDkxIDEyIDE2IDEwLjIwOTEgMTYgOEMxNiA1Ljc5MDg2IDE0LjIwOTEgNCAxMiA0QzkuNzkwODYgNCA4IDUuNzkwODYgOCA4QzggMTAuMjA5MSA5Ljc5MDg2IDEyIDEyIDEyWiIgZmlsbD0iIzY2N0VFQSIvPgo8cGF0aCBkPSJNMTIgMTRDOS4zMyAxMy45OSA3LjAxIDE1LjYyIDYgMThDMTAuMDEgMjAgMTMuOTkgMjAgMTggMThDMTYuOTkgMTUuNjIgMTQuNjcgMTMuOTkgMTIgMTRaIiBmaWxsPSIjNjY3RUVBIi8+Cjwvc3ZnPgo8L3N2Zz4='} alt={selectedMentor.name} />
                <div className="mentor-info">
                  <h2>{selectedMentor.name}</h2>
                  <div className="mentor-rating">
                    <span>⭐ {selectedMentor.rating || 4.8} ({selectedMentor.reviewCount || 25} reviews)</span>
                  </div>
                  <p className="mentor-bio">{selectedMentor.bio}</p>
                </div>
              </div>
              
              <div className="mentor-details-grid">
                <div className="detail-section">
                  <h3>Education</h3>
                  <div className="education-list">
                    {selectedMentor.education && selectedMentor.education.length > 0 ? (
                      selectedMentor.education.map((edu, index) => (
                        <div key={index} className="education-item">
                          <h4>{edu.degree || edu.qualification || 'Degree'}</h4>
                          <p>{edu.institution || edu.school || 'Institution'}</p>
                          <span>{edu.startYear && edu.endYear ? `${edu.startYear} - ${edu.endYear}` : edu.year || edu.duration || 'Year'}</span>
                          {edu.field && <p className="field">{edu.field}</p>}
                          {edu.grade && <span className="grade">Grade: {edu.grade}</span>}
                        </div>
                      ))
                    ) : (
                      <p>No education information available</p>
                    )}
                  </div>
                </div>
                
                <div className="detail-section">
                  <h3>Skills</h3>
                  <div className="skills-list">
                    {selectedMentor.skills?.map((skill, index) => (
                      <span key={index} className="skill-tag">{typeof skill === 'object' ? skill.name : skill}</span>
                    )) || <p>No skills listed</p>}
                  </div>
                </div>
                
                <div className="detail-section">
                  <h3>Professional Background</h3>
                  <div className="background-list">
                    {selectedMentor.background && selectedMentor.background.length > 0 ? (
                      selectedMentor.background.map((bg, index) => (
                        <div key={index} className="background-item">
                          <h4>{bg.position || bg.title || 'Position'}</h4>
                          <p>{bg.company || bg.organization || 'Company'}</p>
                          <span>{bg.startDate && bg.endDate ? `${bg.startDate} - ${bg.endDate}` : bg.duration || bg.year || 'Duration'}</span>
                          {bg.location && <p className="location">{bg.location}</p>}
                          {bg.description && <p className="description">{bg.description}</p>}
                        </div>
                      ))
                    ) : (
                      <p>No background information available</p>
                    )}
                  </div>
                </div>
                
                <div className="detail-section">
                  <h3>Interests</h3>
                  <div className="interests-detailed">
                    {selectedMentor.interestsByCategory && Object.keys(selectedMentor.interestsByCategory).length > 0 ? (
                      <div className="interests-by-category">
                        {Object.entries(selectedMentor.interestsByCategory).map(([category, tags]) => (
                          tags && tags.length > 0 && (
                            <div key={category} className="category-section">
                              <h4 className="category-title">{category.replace('_', ' ').toUpperCase()}</h4>
                              <div className="category-tags">
                                {tags.map((tag, index) => (
                                  <span key={index} className="interest-tag">{tag}</span>
                                ))}
                              </div>
                            </div>
                          )
                        ))}
                      </div>
                    ) : Array.isArray(selectedMentor.interests) && selectedMentor.interests.length > 0 ? (
                      <div className="interests-grid">
                        {selectedMentor.interests.map((interest, index) => (
                          <span key={index} className="category-tag">{interest}</span>
                        ))}
                      </div>
                    ) : (
                      <p>No interests listed</p>
                    )}
                  </div>
                </div>
                
                <div className="detail-section">
                  <h3>Languages</h3>
                  <div className="languages-list">
                    {selectedMentor.languages?.map((language, index) => (
                      <span key={index} className="language-tag">{typeof language === 'object' ? language.name : language}</span>
                    )) || <p>No languages listed</p>}
                  </div>
                </div>
                
                {selectedMentor.availability && Object.keys(selectedMentor.availability).length > 0 && (
                  <div className="detail-section">
                    <h3>Availability</h3>
                    <div className="availability-info">
                      {Object.entries(selectedMentor.availability).map(([day, times]) => (
                        <div key={day} className="availability-day">
                          <strong>{day}:</strong> {times || 'Not available'}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              
              <div className="mentor-actions-modal">
                <button onClick={() => handleCall(selectedMentor.id)} className="action-btn-modal call">
                  📞 Book Session
                </button>
                <button onClick={() => handleMessage(selectedMentor.id)} className="action-btn-modal message">
                  💬 Send Message
                </button>
                <button onClick={() => handleFavorite(selectedMentor.id)} className={`action-btn-modal favorite ${favorites.includes(selectedMentor.id) ? 'favorited' : ''}`}>
                  {favorites.includes(selectedMentor.id) ? '💖 Favorited' : '🤍 Add to Favorites'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      
      {showCallModal && (
        <CallRequestModal 
          user={user}
          onCallStart={handleCallStart}
          onClose={() => setShowCallModal(false)}
        />
      )}
      
      {/* Feedback Modal */}
      {showFeedbackModal && feedbackSession && (
        <div className="feedback-modal-overlay" onClick={() => setShowFeedbackModal(false)}>
          <div className="feedback-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Rate Your Session</h3>
            <p>How was your session with the mentor?</p>
            <div className="rating-section">
              {[1, 2, 3, 4, 5].map(star => (
                <button
                  key={star}
                  className={`star-btn ${feedbackSession.rating >= star ? 'active' : ''}`}
                  onClick={() => setFeedbackSession({...feedbackSession, rating: star})}
                >
                  ⭐
                </button>
              ))}
            </div>
            <textarea
              placeholder="Share your feedback (optional)"
              value={feedbackSession.feedback || ''}
              onChange={(e) => setFeedbackSession({...feedbackSession, feedback: e.target.value})}
              className="feedback-textarea"
            />
            <div className="feedback-actions">
              <button onClick={() => setShowFeedbackModal(false)} className="cancel-btn">
                Cancel
              </button>
              <button 
                onClick={() => submitFeedback(feedbackSession.rating, feedbackSession.feedback)}
                className="submit-btn"
                disabled={!feedbackSession.rating}
              >
                Submit Feedback
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Booking Flow Modal */}
      {showBookingFlow && selectedMentorForBooking && (
        <div className="booking-modal-overlay" onClick={() => setShowBookingFlow(false)}>
          <div className="booking-modal" onClick={(e) => e.stopPropagation()}>
            <button className="close-modal" onClick={() => setShowBookingFlow(false)}>✕</button>
            <div className="booking-header">
              <h3>Book Session with {selectedMentorForBooking.name}</h3>
              <p>Session Fee: ₹100</p>
              <small>Payment required before session access</small>
            </div>
            <BookingRequestFlow
              menteeId={user.id}
              mentorId={selectedMentorForBooking.id}
              sessionFee={100}
              onComplete={handleBookingComplete}
            />
          </div>
        </div>
      )}

    </div>
  );
};

export default MenteeDashboard;
