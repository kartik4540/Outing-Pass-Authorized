import React from 'react';
import './Contact.css';

const Contact = () => {
  return (
    <main>
      <section id="contact-info">
        <h2>Get in Touch with SRM Institute of Science and Technology</h2>
        <div className="contact-container">
          <div className="address-section">
            <h3>Main Campus Address</h3>
            <address>
              <p>SRM Institute of Science and Technology</p>
              <p>(formerly known as SRM University)</p>
              <p>Kattankulathur, Chengalpattu District</p>
              <p>Tamil Nadu – 603203, India</p>
            </address>
            
            <h3>Contact Numbers</h3>
            <ul>
              <li>Main Line: <a href="tel:+914427417000">+91 (44) 2741 7000</a></li>
              <li>Fax: <a href="tel:+914427452343">+91 (44) 2745 2343</a></li>
              <li>Landline: <a href="tel:04427417047">044-2741 7047</a></li>
            </ul>
          </div>
          
          <div className="contact-details">
            <h3>Admission Inquiries</h3>
            <ul>
              <li>UG & PG Programs: <a href="tel:08047493102">080-4749 3102</a></li>
              <li>UG & PG Programs: <a href="tel:08045687376">080-4568 7376</a></li>
              <li>UG & PG Programs: <a href="tel:08045656643">080-4565 6643</a></li>
              <li>Diploma & Certificate: <a href="tel:+918925801552">+91-8925 801 552</a></li>
              <li>Diploma & Certificate: <a href="tel:+917358098802">+91-7358 098 802</a></li>
            </ul>
            
            <h3>Email Addresses</h3>
            <ul>
              <li>General Inquiries: <a href="mailto:grievance.oe@srmist.edu.in">grievance.oe@srmist.edu.in</a></li>
              <li>Indian Student Admissions: <a href="mailto:admissions.srmonline@srmist.edu.in">admissions.srmonline@srmist.edu.in</a></li>
              <li>International Students: <a href="mailto:international.srmonline@srmist.edu.in">international.srmonline@srmist.edu.in</a></li>
            </ul>
          </div>
        </div>
        
        <div className="program-contacts">
          <h3>Program-Specific Contact Numbers</h3>
          <div className="program-grid">
            <div className="program-item">
              <span className="program-name">BBA</span>
              <a href="tel:+918045686561">+91-8045 686 561</a>
            </div>
            <div className="program-item">
              <span className="program-name">BCA</span>
              <a href="tel:+918069452376">+91-8069 452 376</a>
            </div>
            <div className="program-item">
              <span className="program-name">MCA</span>
              <a href="tel:+918045686643">+91-8045 686 643</a>
            </div>
            <div className="program-item">
              <span className="program-name">MBA</span>
              <a href="tel:+918045687376">+91-8045 687 376</a>
            </div>
          </div>
        </div>
        
        <div className="social-media">
          <h3>Connect With Us on Social Media</h3>
          <ul className="social-links">
            <li><a href="https://www.facebook.com/SRM.University.Official" target="_blank" rel="noopener noreferrer">Facebook</a></li>
            <li><a href="https://twitter.com/SRM_Univ" target="_blank" rel="noopener noreferrer">Twitter</a></li>
            <li><a href="https://www.instagram.com/srm_university/" target="_blank" rel="noopener noreferrer">Instagram</a></li>
            <li><a href="https://www.linkedin.com/school/srm-university/" target="_blank" rel="noopener noreferrer">LinkedIn</a></li>
            <li><a href="https://www.youtube.com/user/SRMeducation" target="_blank" rel="noopener noreferrer">YouTube</a></li>
          </ul>
        </div>
        
        <div className="map-container">
          <h3>Campus Location</h3>
          <div className="responsive-map">
            <iframe 
              src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3890.0803736777166!2d80.03756441526979!3d12.82384642125272!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3a52f712b57a951d%3A0xacc4c2b0ef24ebf4!2sSRM%20Institute%20of%20Science%20and%20Technology!5e0!3m2!1sen!2sin!4v1626937114548!5m2!1sen!2sin" 
              width="100%" 
              height="400" 
              style={{ border: 0 }} 
              allowFullScreen="" 
              loading="lazy" 
              title="SRM Institute of Science and Technology Map">
            </iframe>
          </div>
        </div>
      </section>
    
<footer className="contact-footer">
    <p className="footer-title">Created by :</p>
    <div className="creator-info">
        <div className="creator">
            <p className="creator-name"><b>Kartik Mittal</b></p>
            <p className="creator-reg">RA2211003011230</p>
            <p className="creator-email"><a href="mailto:km5260@srmist.edu.in">km5260@srmist.edu.in</a></p>
        </div>
        <div className="creator">
            <p className="creator-name"><b>Reetam Kole</b></p>
            <p className="creator-reg">RA2211003011231</p>
            <p className="creator-email"><a href="mailto:rk0598@srmist.edu.in">rk0598@srmist.edu.in</a></p>
        </div>
    </div>
</footer>

    </main>
  );
};

export default Contact; 