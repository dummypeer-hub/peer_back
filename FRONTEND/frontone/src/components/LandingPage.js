import React, { useState } from 'react';
import './LandingPage.css';

const LandingPage = ({ onLogin, onSignup }) => {
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState('login');

  const openAuth = (mode) => {
    setAuthMode(mode);
    setShowAuthModal(true);
  };

  return (
    <div className="landing-page">
      {/* Header */}
      <header className="header">
        <div className="container">
          <div className="logo">
            <div className="logo-img">P</div>
            <span className="logo-text">PeerVerse</span>
          </div>
          <nav className="nav">
            <a href="#features">Features</a>
            <a href="#how-it-works">How It Works</a>
            <a href="#about">About</a>
            <a href="#contact">Contact</a>
          </nav>
          <div className="auth-buttons">
            <button onClick={() => openAuth('login')} className="btn-login">Login</button>
            <button onClick={() => openAuth('signup')} className="btn-signup">Sign Up</button>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="hero">
        <div className="container">
          <div className="hero-content">
            <h1 className="hero-title">
              Connect. Learn. <span className="highlight">Grow Together.</span>
            </h1>
            <p className="hero-subtitle">
              PeerVerse connects you with peers who've walked your path. Get real insights from people who've faced the same challenges, overcome similar obstacles, and achieved what you're striving for - all at reasonable rates from those who truly understand your journey.
            </p>
            <div className="hero-buttons">
              <button onClick={() => openAuth('signup')} className="btn-primary">
                Get Started Free
              </button>
              <button className="btn-secondary">
                Watch Demo
              </button>
            </div>
            <div className="hero-stats">
              <div className="stat">
                <span className="stat-number">10K+</span>
                <span className="stat-label">Active Mentors</span>
              </div>
              <div className="stat">
                <span className="stat-number">50K+</span>
                <span className="stat-label">Successful Sessions</span>
              </div>
              <div className="stat">
                <span className="stat-number">95%</span>
                <span className="stat-label">Success Rate</span>
              </div>
            </div>
          </div>
          <div className="hero-image">
            <div className="hero-visual">
              <img src="/finall_logo_verse.png" alt="PeerVerse Logo" className="hero-logo" />
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="features">
        <div className="container">
          <h2 className="section-title">Why Choose PeerVerse?</h2>
          <p className="section-description">
            PeerVerse is built on the belief that the best advice comes from those who've been in your shoes. 
            Our platform connects you with peers who have faced similar challenges, navigated the same career paths, 
            and overcome obstacles you're currently facing. Get authentic insights, practical solutions, and genuine 
            support from people who truly understand your situation - all at affordable rates that make quality 
            mentorship accessible to everyone.
          </p>
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🎥</div>
              <h3>HD Video Calls</h3>
              <p>Crystal clear video calls with advanced WebRTC technology for seamless communication.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🔒</div>
              <h3>Secure Platform</h3>
              <p>End-to-end encrypted sessions ensuring your conversations remain private and secure.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <h3>Instant Matching</h3>
              <p>AI-powered matching system connects you with the perfect mentor or mentee instantly.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">📊</div>
              <h3>Progress Tracking</h3>
              <p>Track your learning journey with detailed analytics and progress reports.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">💬</div>
              <h3>Real-time Chat</h3>
              <p>Integrated chat system for continuous communication beyond video sessions.</p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🌍</div>
              <h3>Global Community</h3>
              <p>Connect with mentors and mentees from around the world, breaking geographical barriers.</p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section id="how-it-works" className="how-it-works">
        <div className="container">
          <h2 className="section-title">How PeerVerse Works</h2>
          <div className="steps">
            <div className="step">
              <div className="step-number">1</div>
              <div className="step-content">
                <h3>Create Your Profile</h3>
                <p>Sign up and create a detailed profile showcasing your skills, experience, or learning goals.</p>
              </div>
            </div>
            <div className="step">
              <div className="step-number">2</div>
              <div className="step-content">
                <h3>Get Matched</h3>
                <p>Our AI algorithm matches you with compatible mentors or mentees based on your preferences.</p>
              </div>
            </div>
            <div className="step">
              <div className="step-number">3</div>
              <div className="step-content">
                <h3>Start Learning</h3>
                <p>Schedule sessions, join video calls, and begin your mentorship journey with real-time collaboration.</p>
              </div>
            </div>
            <div className="step">
              <div className="step-number">4</div>
              <div className="step-content">
                <h3>Track Progress</h3>
                <p>Monitor your growth with detailed feedback, ratings, and progress tracking tools.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* About Section */}
      <section id="about" className="about">
        <div className="container">
          <h2 className="section-title">Meet Our Team</h2>
          <div className="team-grid">
            <div className="team-member founder">
              <div className="member-photo">
                <img src="/nkphoto.jpg" alt="Ninad Santosh Khopade" className="member-image" />
              </div>
              <h3>Ninad Santosh Khopade</h3>
              <p className="member-title">Founder & Full Stack Developer</p>
              <p className="member-bio">
                BTech in CSE from MIT ADT. Passionate about connecting peers through technology and creating meaningful mentorship experiences.
              </p>
            </div>
            <div className="contributors-section">
              <h3 className="contributors-title">Contributors</h3>
              <div className="contributors-grid">
                <div className="team-member">
                  <div className="member-photo">
                    <img src="/shreephoto.jpg" alt="Shreeja Shivaprakash Gundlur" className="member-image" />
                  </div>
                  <h3>Shreeja Shivaprakash Gundlur</h3>
                  <p className="member-title">Digital Marketing Manager & Cybersecurity Engineer</p>
                  <p className="member-bio">
                    BTech CSE from MIT ADT. Expert in digital marketing strategies and cybersecurity solutions.
                  </p>
                </div>
                <div className="team-member">
                  <div className="member-photo">
                    <img src="/yashphoto.jpg" alt="Yash Sanjay Bhardwaj" className="member-image" />
                  </div>
                  <h3>Yash Sanjay Bhardwaj</h3>
                  <p className="member-title">Frontend Developer</p>
                  <p className="member-bio">
                    BTech from MIT ADT University. Specializes in creating intuitive user interfaces and seamless user experiences.
                  </p>
                </div>
                <div className="team-member">
                  <div className="member-photo">
                    <img src="/jeevan.jpg" alt="Jeevan" className="member-image" />
                  </div>
                  <h3>Jeevan</h3>
                  <p className="member-title">Backend JS & Express.js Developer</p>
                  <p className="member-bio">
                    Specializes in backend development with JavaScript and Express.js, creating robust server-side solutions.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta">
        <div className="container">
          <h2>Ready to Transform Your Career?</h2>
          <p>Join thousands of professionals who are already growing with PeerVerse</p>
          <button onClick={() => openAuth('signup')} className="btn-primary large">
            Start Your Journey Today
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer id="contact" className="footer">
        <div className="container">
          <div className="footer-content">
            <div className="footer-section">
              <div className="logo">
                <div className="logo-img">P</div>
                <span className="logo-text">PeerVerse</span>
              </div>
              <p>Connecting minds, building futures. The premier platform for professional mentorship.</p>
              <div className="social-links">
                <a href="https://facebook.com/peerverse" target="_blank" rel="noopener noreferrer">
                  <i className="fab fa-facebook"></i>
                </a>
                <a href="https://instagram.com/peerverse" target="_blank" rel="noopener noreferrer">
                  <i className="fab fa-instagram"></i>
                </a>
                <a href="https://linkedin.com/company/peerverse" target="_blank" rel="noopener noreferrer">
                  <i className="fab fa-linkedin"></i>
                </a>
                <a href="https://youtube.com/peerverse" target="_blank" rel="noopener noreferrer">
                  <i className="fab fa-youtube"></i>
                </a>
              </div>
            </div>
            <div className="footer-section">
              <h4>Platform</h4>
              <ul>
                <li><a href="#features">Features</a></li>
                <li><a href="#how-it-works">How It Works</a></li>
                <li><a href="#">Pricing</a></li>
                <li><a href="#">API</a></li>
              </ul>
            </div>
            <div className="footer-section">
              <h4>Support</h4>
              <ul>
                <li><a href="#">Help Center</a></li>
                <li><a href="#">Contact Us</a></li>
                <li><a href="#">Community</a></li>
                <li><a href="#">Status</a></li>
              </ul>
            </div>
            <div className="footer-section">
              <h4>Company</h4>
              <ul>
                <li><a href="#about">About Us</a></li>
                <li><a href="#">Careers</a></li>
                <li><a href="#">Privacy Policy</a></li>
                <li><a href="#">Terms of Service</a></li>
              </ul>
            </div>
          </div>
          <div className="footer-bottom">
            <p>&copy; 2024 PeerVerse. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Auth Modal */}
      {showAuthModal && (
        <div className="auth-modal-overlay" onClick={() => setShowAuthModal(false)}>
          <div className="auth-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close" onClick={() => setShowAuthModal(false)}>×</button>
            <div className="modal-content">
              {authMode === 'login' ? (
                <div>
                  <h2>Welcome Back</h2>
                  <p>Sign in to continue your mentorship journey</p>
                  <button onClick={() => { setShowAuthModal(false); onLogin(); }} className="btn-primary full-width">
                    Continue to Login
                  </button>
                  <p className="switch-auth">
                    Don't have an account? 
                    <button onClick={() => setAuthMode('signup')} className="link-button">Sign up</button>
                  </p>
                </div>
              ) : (
                <div>
                  <h2>Join PeerVerse</h2>
                  <p>Create your account and start your learning journey</p>
                  <button onClick={() => { setShowAuthModal(false); onSignup(); }} className="btn-primary full-width">
                    Continue to Sign Up
                  </button>
                  <p className="switch-auth">
                    Already have an account? 
                    <button onClick={() => setAuthMode('login')} className="link-button">Sign in</button>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LandingPage;