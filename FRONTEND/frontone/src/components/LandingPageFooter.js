import React from 'react';
import './LandingPageFooter.css';

const LandingPageFooter = () => {
  const teamMembers = [
    {
      name: "Ninad Founder",
      role: "Founder & CEO",
      image: "/team/founder.jpg",
      description: "Visionary leader with 8+ years in EdTech"
    },
    {
      name: "Shree Jain",
      role: "Co-Founder & CTO", 
      image: "/team/cto.jpg",
      description: "Full-stack developer and tech innovator"
    },
    {
      name: "Priya Sharma",
      role: "Head of Product",
      image: "/team/product.jpg", 
      description: "Product strategist with UX expertise"
    },
    {
      name: "Rahul Kumar",
      role: "Lead Developer",
      image: "/team/developer.jpg",
      description: "Backend specialist and system architect"
    }
  ];

  return (
    <footer className="landing-footer">
      {/* About Section */}
      <section className="footer-about">
        <div className="container">
          <div className="about-content">
            <div className="about-text">
              <h2>About PeerVerse</h2>
              <p>
                Connecting students with experienced mentors for personalized guidance and career growth. 
                Our platform bridges the gap between aspiring learners and industry experts, creating 
                meaningful mentorship relationships that drive success.
              </p>
              <div className="stats-row">
                <div className="stat">
                  <h3>1000+</h3>
                  <p>Active Mentors</p>
                </div>
                <div className="stat">
                  <h3>5000+</h3>
                  <p>Students Helped</p>
                </div>
                <div className="stat">
                  <h3>50+</h3>
                  <p>Universities</p>
                </div>
              </div>
            </div>
            <div className="about-image">
              <img src="/about-illustration.svg" alt="About PeerVerse" />
            </div>
          </div>
        </div>
      </section>

      {/* Team Section */}
      <section className="footer-team">
        <div className="container">
          <h2>Our Team</h2>
          <p className="team-subtitle">
            Passionate developers and educators committed to empowering the next generation.
          </p>
          <div className="team-grid">
            {teamMembers.map((member, index) => (
              <div key={index} className="team-card">
                <div className="team-image">
                  <img 
                    src={member.image} 
                    alt={member.name}
                    onError={(e) => {
                      e.target.src = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgdmlld0JveD0iMCAwIDEwMCAxMDAiIGZpbGw9Im5vbmUiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+CjxjaXJjbGUgY3g9IjUwIiBjeT0iNTAiIHI9IjUwIiBmaWxsPSIjRTFFNUU5Ii8+Cjxzdmcgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiB2aWV3Qm94PSIwIDAgMjQgMjQiIGZpbGw9Im5vbmUiIHg9IjMwIiB5PSIzMCI+CjxwYXRoIGQ9Ik0xMiAxMkMxNC4yMDkxIDEyIDE2IDEwLjIwOTEgMTYgOEMxNiA1Ljc5MDg2IDE0LjIwOTEgNCAxMiA0QzkuNzkwODYgNCA4IDUuNzkwODYgOCA4QzggMTAuMjA5MSA5Ljc5MDg2IDEyIDEyIDEyWiIgZmlsbD0iIzY2N0VFQSIvPgo8cGF0aCBkPSJNMTIgMTRDOS4zMyAxMy45OSA3LjAxIDE1LjYyIDYgMThDMTAuMDEgMjAgMTMuOTkgMjAgMTggMThDMTYuOTkgMTUuNjIgMTQuNjcgMTMuOTkgMTIgMTRaIiBmaWxsPSIjNjY3RUVBIi8+Cjwvc3ZnPgo8L3N2Zz4=";
                    }}
                  />
                </div>
                <div className="team-info">
                  <h3>{member.name}</h3>
                  <p className="role">{member.role}</p>
                  <p className="description">{member.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Contact & Links Section */}
      <section className="footer-main">
        <div className="container">
          <div className="footer-grid">
            <div className="footer-column">
              <div className="footer-logo">
                <img src="/finall_logo_verse.png" alt="PeerVerse" />
                <p>Empowering students through mentorship</p>
              </div>
            </div>
            
            <div className="footer-column">
              <h3>Platform</h3>
              <ul>
                <li><a href="#mentors">Find Mentors</a></li>
                <li><a href="#blogs">Read Blogs</a></li>
                <li><a href="#communities">Join Communities</a></li>
                <li><a href="#sessions">Book Sessions</a></li>
              </ul>
            </div>
            
            <div className="footer-column">
              <h3>Resources</h3>
              <ul>
                <li><a href="#help">Help Center</a></li>
                <li><a href="#guides">Mentorship Guides</a></li>
                <li><a href="#careers">Career Resources</a></li>
                <li><a href="#success">Success Stories</a></li>
              </ul>
            </div>
            
            <div className="footer-column">
              <h3>Contact</h3>
              <div className="contact-info">
                <p>
                  <span className="contact-icon">📧</span>
                  <a href="mailto:support@peerverse.in">support@peerverse.in</a>
                </p>
                <p>
                  <span className="contact-icon">📞</span>
                  <a href="tel:+919876543210">+91 9876543210</a>
                </p>
                <p>
                  <span className="contact-icon">📍</span>
                  Bangalore, India
                </p>
              </div>
              <div className="social-links">
                <a href="#" aria-label="LinkedIn">💼</a>
                <a href="#" aria-label="Twitter">🐦</a>
                <a href="#" aria-label="Instagram">📷</a>
                <a href="#" aria-label="YouTube">📺</a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Copyright */}
      <section className="footer-bottom">
        <div className="container">
          <div className="bottom-content">
            <p>&copy; 2024 PeerVerse. All rights reserved.</p>
            <div className="bottom-links">
              <a href="#privacy">Privacy Policy</a>
              <a href="#terms">Terms of Service</a>
              <a href="#cookies">Cookie Policy</a>
            </div>
          </div>
        </div>
      </section>
    </footer>
  );
};

export default LandingPageFooter;