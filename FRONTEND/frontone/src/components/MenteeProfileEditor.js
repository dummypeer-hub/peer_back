import React, { useState, useEffect } from 'react';
import axios from 'axios';
import config from '../config';
import './MenteeProfileEditor.css';

const MenteeProfileEditor = ({ user, onClose, onSave }) => {
  const [profile, setProfile] = useState({
    name: '',
    profilePicture: '',
    bio: '',
    interests: [],
    skills: [],
    education: [],
    goals: '',
    location: ''
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadProfile();
  }, [user.id]);

  const loadProfile = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${config.API_BASE_URL}/mentee/profile/${user.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.data.profile) {
        setProfile({
          name: response.data.profile.name || '',
          profilePicture: response.data.profile.profile_picture || '',
          bio: response.data.profile.bio || '',
          interests: response.data.profile.interests || [],
          skills: response.data.profile.skills || [],
          education: response.data.profile.education || [],
          goals: response.data.profile.goals || '',
          location: response.data.profile.location || ''
        });
      }
    } catch (error) {
      console.error('Failed to load profile:', error);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${config.API_BASE_URL}/mentee/profile/${user.id}`, profile, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      alert('Profile saved successfully!');
      if (onSave) onSave(profile);
      if (onClose) onClose();
    } catch (error) {
      console.error('Failed to save profile:', error);
      alert('Failed to save profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleInterestAdd = (interest) => {
    if (interest && !profile.interests.includes(interest)) {
      setProfile(prev => ({
        ...prev,
        interests: [...prev.interests, interest]
      }));
    }
  };

  const handleSkillAdd = (skill) => {
    if (skill && !profile.skills.includes(skill)) {
      setProfile(prev => ({
        ...prev,
        skills: [...prev.skills, skill]
      }));
    }
  };

  return (
    <div className="mentee-profile-editor">
      <div className="profile-header">
        <h2>Edit Your Profile</h2>
        <button onClick={onClose} className="close-btn">×</button>
      </div>

      <div className="profile-form">
        <div className="form-section">
          <h3>Basic Information</h3>
          
          <div className="form-group">
            <label>Full Name</label>
            <input
              type="text"
              value={profile.name}
              onChange={(e) => setProfile(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter your full name"
            />
          </div>

          <div className="form-group">
            <label>Profile Picture URL</label>
            <input
              type="url"
              value={profile.profilePicture}
              onChange={(e) => setProfile(prev => ({ ...prev, profilePicture: e.target.value }))}
              placeholder="https://example.com/your-photo.jpg"
            />
            {profile.profilePicture && (
              <div className="profile-preview">
                <img src={profile.profilePicture} alt="Profile Preview" />
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Bio</label>
            <textarea
              value={profile.bio}
              onChange={(e) => setProfile(prev => ({ ...prev, bio: e.target.value }))}
              placeholder="Tell us about yourself..."
              rows="4"
            />
          </div>

          <div className="form-group">
            <label>Location</label>
            <input
              type="text"
              value={profile.location}
              onChange={(e) => setProfile(prev => ({ ...prev, location: e.target.value }))}
              placeholder="City, Country"
            />
          </div>
        </div>

        <div className="form-section">
          <h3>Interests</h3>
          <div className="interest-dropdown">
            <select
              onChange={(e) => {
                if (e.target.value && !profile.interests.includes(e.target.value)) {
                  handleInterestAdd(e.target.value);
                  e.target.value = '';
                }
              }}
            >
              <option value="">Select an interest</option>
              <option value="PLACEMENT">PLACEMENT</option>
              <option value="COLLEGE REVIEWS">COLLEGE REVIEWS</option>
              <option value="SKILLS LEARNING">SKILLS LEARNING</option>
              <option value="PROJECTS">PROJECTS</option>
              <option value="HACKATHONS">HACKATHONS</option>
              <option value="STUDY HELP">STUDY HELP</option>
            </select>
          </div>
          <div className="tags-list">
            {profile.interests.map((interest, index) => (
              <span key={index} className="tag">
                {interest}
                <button onClick={() => setProfile(prev => ({
                  ...prev,
                  interests: prev.interests.filter((_, i) => i !== index)
                }))}>×</button>
              </span>
            ))}
          </div>
        </div>

        <div className="form-section">
          <h3>Skills</h3>
          <div className="tags-input">
            <input
              type="text"
              placeholder="Add a skill and press Enter"
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleSkillAdd(e.target.value.trim());
                  e.target.value = '';
                }
              }}
            />
          </div>
          <div className="tags-list">
            {profile.skills.map((skill, index) => (
              <span key={index} className="tag">
                {skill}
                <button onClick={() => setProfile(prev => ({
                  ...prev,
                  skills: prev.skills.filter((_, i) => i !== index)
                }))}>×</button>
              </span>
            ))}
          </div>
        </div>

        <div className="form-section">
          <h3>Goals</h3>
          <textarea
            value={profile.goals}
            onChange={(e) => setProfile(prev => ({ ...prev, goals: e.target.value }))}
            placeholder="What are your learning goals and aspirations?"
            rows="4"
          />
        </div>

        <div className="form-actions">
          <button onClick={onClose} className="cancel-btn">Cancel</button>
          <button onClick={handleSave} disabled={loading} className="save-btn">
            {loading ? 'Saving...' : 'Save Profile'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default MenteeProfileEditor;