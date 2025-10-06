import React, { useState } from 'react';
import axios from 'axios';
import config from '../config';
import './FeedbackModal.css';

const FeedbackModal = ({ isOpen, onClose, sessionData, user }) => {
  const [rating, setRating] = useState(0);
  const [feedback, setFeedback] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (rating === 0) {
      alert('Please provide a rating');
      return;
    }

    setIsSubmitting(true);
    try {
      await axios.post(`${config.API_BASE_URL}/session-feedback`, {
        sessionId: sessionData.sessionId,
        menteeId: user.role === 'mentee' ? user.id : sessionData.menteeId,
        mentorId: user.role === 'mentor' ? user.id : sessionData.mentorId,
        rating,
        feedback
      });

      alert('Thank you for your feedback!');
      onClose();
    } catch (error) {
      console.error('Error submitting feedback:', error);
      alert('Failed to submit feedback. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="feedback-modal-overlay">
      <div className="feedback-modal">
        <div className="feedback-header">
          <h3>Session Feedback</h3>
          <button onClick={onClose} className="close-btn">×</button>
        </div>

        <form onSubmit={handleSubmit} className="feedback-form">
          <div className="rating-section">
            <label>How was your session?</label>
            <div className="star-rating">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  className={`star ${rating >= star ? 'active' : ''}`}
                  onClick={() => setRating(star)}
                >
                  ⭐
                </button>
              ))}
            </div>
            <div className="rating-text">
              {rating === 0 && 'Please rate your session'}
              {rating === 1 && 'Poor'}
              {rating === 2 && 'Fair'}
              {rating === 3 && 'Good'}
              {rating === 4 && 'Very Good'}
              {rating === 5 && 'Excellent'}
            </div>
          </div>

          <div className="feedback-section">
            <label htmlFor="feedback">Additional Comments (Optional)</label>
            <textarea
              id="feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Share your thoughts about the session..."
              rows={4}
            />
          </div>

          <div className="feedback-actions">
            <button type="button" onClick={onClose} className="cancel-btn">
              Skip
            </button>
            <button type="submit" disabled={isSubmitting || rating === 0} className="submit-btn">
              {isSubmitting ? 'Submitting...' : 'Submit Feedback'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default FeedbackModal;