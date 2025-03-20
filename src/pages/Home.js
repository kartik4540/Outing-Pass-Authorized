import React from 'react';
import './Home.css';
import { Link } from 'react-router-dom';
import heroBackground from '../assets/Screenshot 2024-11-11 124023.png';

const Home = () => {
  return (
    <main>
      <section id="hero-section" style={{ 
        backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)), url(${heroBackground})`
      }}>
        <div className="hero-content">
          <h1>Welcome to SRM Institute of Science and Technology</h1>
          <p className="hero-tagline">Kattankulathur Campus - A World of Opportunities</p>
          <div className="hero-buttons">
            <Link to="/slot-booking" className="hero-button primary">Book Lab Slot</Link>
            <Link to="/contact" className="hero-button secondary">Contact Us</Link>
          </div>
        </div>
      </section>

      <section id="campus-overview">
        <div className="section-header">
          <h2>About SRM Kattankulathur Campus</h2>
          <div className="section-underline"></div>
        </div>
        <div className="overview-content">
          <div className="overview-text">
            <p>SRM Institute of Science and Technology (SRMIST) Kattankulathur Campus is consistently ranked among the top universities in India, known for its academic excellence, cutting-edge research, and world-class infrastructure.</p>
            <p>Spread across 250 acres of lush greenery, the campus offers a perfect blend of nature and modern architecture, creating an ideal environment for learning and innovation.</p>
            <div className="overview-stats">
              <div className="stat-item">
                <span className="stat-number">52,000+</span>
                <span className="stat-label">Students</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">3,200+</span>
                <span className="stat-label">Faculty</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">250+</span>
                <span className="stat-label">Acres</span>
              </div>
              <div className="stat-item">
                <span className="stat-number">100+</span>
                <span className="stat-label">Programs</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="mac-lab" className="mac-lab-section">
        <div className="section-header">
          <h2>MAC LAB Facilities</h2>
          <div className="section-underline"></div>
        </div>
        <div className="mac-lab-content">
          <div className="mac-lab-description">
            <h3>State-of-the-Art Apple Computing Environment</h3>
            <p>The MAC LAB at SRM KTR provides students and faculty with access to the latest Apple technology, creating an immersive environment for development, design, and research.</p>
            
            <div className="mac-lab-features">
              <div className="feature-item">
                <h4>Hardware</h4>
                <ul>
                  <li>Latest iMac workstations with Retina displays</li>
                  <li>Mac Mini servers for backend development</li>
                  <li>Apple accessories including Magic Mouse and Magic Keyboard</li>
                </ul>
              </div>
              
              <div className="feature-item">
                <h4>Software</h4>
                <ul>
                  <li>Latest macOS operating system</li>
                  <li>Complete Adobe Creative Cloud suite</li>
                  <li>Xcode for iOS and macOS development</li>
                  <li>Final Cut Pro for video editing</li>
                  <li>Logic Pro for audio production</li>
                </ul>
              </div>
              
              <div className="feature-item">
                <h4>Applications</h4>
                <ul>
                  <li>iOS and macOS app development</li>
                  <li>Cross-platform mobile development</li>
                  <li>UI/UX design projects</li>
                  <li>Graphics and multimedia production</li>
                  <li>Research in Human-Computer Interaction</li>
                </ul>
              </div>
            </div>
            
            <div className="mac-lab-schedule">
              <h4>Lab Hours</h4>
              <p>Monday to Friday: 8:00 AM - 5:00 PM</p>
              <p>Saturday & Sunday: Closed</p>
            </div>
            
            <div className="mac-lab-cta">
              <p>Experience the power of Apple technology for your academic projects</p>
              <Link to="/slot-booking" className="cta-button">Book MAC LAB Slot</Link>
            </div>
          </div>
        </div>
      </section>

      <section id="achievements">
        <div className="section-header">
          <h2>Academic Excellence & Achievements</h2>
          <div className="section-underline"></div>
        </div>
        <div className="achievements-content">
          <div className="achievement-item">
            <h3>NAAC 'A++' Grade</h3>
            <p>Recognized for academic excellence and institutional quality.</p>
          </div>
          <div className="achievement-item">
            <h3>QS World Rankings</h3>
            <p>Ranked among the top universities globally for engineering and technology.</p>
          </div>
          <div className="achievement-item">
            <h3>Research Publications</h3>
            <p>Over 2,000 research papers published in international journals annually.</p>
          </div>
          <div className="achievement-item">
            <h3>Industry Partnerships</h3>
            <p>Collaborations with 300+ companies for research, internships, and placements.</p>
          </div>
        </div>
      </section>

      <section id="campus-life" className="alternate-bg">
        <div className="section-header">
          <h2>Campus Life at SRM KTR</h2>
          <div className="section-underline"></div>
        </div>
        <div className="campus-life-content">
          <div className="campus-feature">
            <h3>Modern Hostels</h3>
            <p>Comfortable accommodation with Wi-Fi, recreational areas, and dining facilities.</p>
          </div>
          <div className="campus-feature">
            <h3>Sports Facilities</h3>
            <p>World-class infrastructure including stadiums, swimming pools, and fitness centers.</p>
          </div>
          <div className="campus-feature">
            <h3>Cultural Events</h3>
            <p>Regular festivals, concerts, and cultural activities throughout the year.</p>
          </div>
          <div className="campus-feature">
            <h3>Tech Fests</h3>
            <p>Annual technical symposiums, hackathons, and innovation challenges.</p>
          </div>
        </div>
      </section>

      <section id="testimonials">
        <div className="section-header">
          <h2>What Our Students Say</h2>
          <div className="section-underline"></div>
        </div>
        <div className="testimonials-container">
          <div className="testimonial">
            <p>"The lab facilities at SRM KTR are exceptional. I've been able to work on cutting-edge projects that have prepared me well for the industry."</p>
            <div className="testimonial-author">- Riya Sharma, CSE '24</div>
          </div>
          <div className="testimonial">
            <p>"As a research scholar, I've had access to state-of-the-art equipment and supportive faculty mentors who have guided my work in robotics."</p>
            <div className="testimonial-author">- Akash Patel, Mechanical Engineering</div>
          </div>
          <div className="testimonial">
            <p>"The online lab booking system has made it so convenient to reserve lab time for our projects. It's efficient and user-friendly."</p>
            <div className="testimonial-author">- Priya Singh, Electronics '23</div>
          </div>
        </div>
      </section>
    </main>
  );
};

export default Home; 