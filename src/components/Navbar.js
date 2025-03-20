import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Navbar.css';
import { supabase } from '../supabaseClient';
import srmLogo from '../assets/Srmseal.png';

const Navbar = ({ user, isAdmin }) => {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error('Error logging out:', error.message);
    }
  };

  const handleBookSlotClick = () => {
    if (!user) {
      navigate('/login');
    }
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <img src={srmLogo} alt="SRM Logo" className="navbar-logo" />
        <span className="navbar-title">MAC LAB</span>
      </div>
      
      <button className="mobile-menu-button" onClick={toggleMenu}>
        <span>☰</span>
      </button>

      <div className={`nav-links ${isMenuOpen ? 'active' : ''}`}>
        <Link to="/" onClick={() => setIsMenuOpen(false)}>Home</Link>
        {user ? (
          <Link to="/slot-booking" onClick={() => setIsMenuOpen(false)}>Book Slot</Link>
        ) : (
          <Link to="/login" onClick={() => { handleBookSlotClick(); setIsMenuOpen(false); }}>Book Slot</Link>
        )}
        {isAdmin && (
          <Link to="/pending-bookings" onClick={() => setIsMenuOpen(false)}>Pending Bookings</Link>
        )}
        <Link to="/contact" onClick={() => setIsMenuOpen(false)}>Contact</Link>
      </div>

      <div className="auth-section">
        {user ? (
          <div className="user-info">
            <span>{user.email}</span>
            <button onClick={handleLogout} className="logout-button">
              Logout
            </button>
          </div>
        ) : (
          <Link to="/login" className="login-button">
            Login
          </Link>
        )}
      </div>
    </nav>
  );
};

export default Navbar; 