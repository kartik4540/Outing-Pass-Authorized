import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import './Navbar.css';
import { supabase } from '../supabaseClient';
import srmLogo from '../assets/Srmseal.png';
import Toast from './Toast';

const Navbar = ({ user, isAdmin, adminLoading }) => {
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [toast, setToast] = useState({ message: '', type: 'info' });
  const isArchGate = sessionStorage.getItem('archGateLoggedIn') === 'true';
  const wardenLoggedIn = sessionStorage.getItem('wardenLoggedIn') === 'true';
  const wardenUsername = wardenLoggedIn ? sessionStorage.getItem('wardenUsername') : null;

  const handleLogout = async () => {
      await supabase.auth.signOut();
    sessionStorage.clear();
    window.location.reload();
  };

  const handleBookSlotClick = () => {
    if (!user) {
      navigate('/login');
    }
  };

  const handleArchGateLogout = () => {
    sessionStorage.clear();
    navigate('/login');
  };

  const handleWardenLogout = () => {
    sessionStorage.clear();
    navigate('/warden-login');
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <nav className="navbar">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'info' })} />
      <div className="navbar-brand">
        <img src={srmLogo} alt="SRM Logo" className="navbar-logo" />
        <span className="navbar-title">Request Outing</span>
      </div>
      
      <button className="mobile-menu-button" onClick={toggleMenu}>
        <span>☰</span>
      </button>

      <div className={`nav-links ${isMenuOpen ? 'active' : ''}`}>
        {!isArchGate && !wardenLoggedIn && (user ? (
          <Link to="/slot-booking" onClick={() => setIsMenuOpen(false)}>Request Outing</Link>
        ) : (
          <Link to="/login" onClick={() => { handleBookSlotClick(); setIsMenuOpen(false); }}>Request Outing</Link>
        ))}
        {(isAdmin && !isArchGate && !wardenLoggedIn) && (
          <Link to="/pending-bookings" onClick={() => setIsMenuOpen(false)}>Pending Bookings</Link>
        )}
        {(isAdmin && !isArchGate && !wardenLoggedIn) && (
          <Link to="/admin-student-info" onClick={() => setIsMenuOpen(false)}>Student Info</Link>
        )}
        {wardenLoggedIn && (
          <>
            <Link to="/pending-bookings" onClick={() => setIsMenuOpen(false)}>Pending Bookings</Link>
            <Link to="/admin-student-info" onClick={() => setIsMenuOpen(false)}>Student Info</Link>
          </>
        )}
        {isArchGate && (
          <>
            <button onClick={() => navigate('/arch-otp')} className="nav-btn">OTP</button>
            <button onClick={() => navigate('/arch-outing-details')} className="nav-btn">Outing Details</button>
          </>
        )}
      </div>

      <div className="auth-section">
        {isArchGate ? (
          <div className="user-info">
            <span>{sessionStorage.getItem('archGateId')}</span>
            <button onClick={handleArchGateLogout} className="logout-button">
              Logout
            </button>
          </div>
        ) : wardenLoggedIn ? (
          <div className="user-info">
            <span>{wardenUsername}</span>
            <button onClick={handleWardenLogout} className="logout-button">
              Logout
            </button>
          </div>
        ) : user ? (
          <div className="user-info">
            <span>{user.email}</span>
            <button onClick={handleLogout} className="logout-button">
              Logout
            </button>
          </div>
        ) : (
          <button onClick={() => navigate('/login')} className="login-button">
            Login
          </button>
        )}
      </div>
    </nav>
  );
};

export default Navbar; 
