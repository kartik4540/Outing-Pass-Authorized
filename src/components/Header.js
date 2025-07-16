import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import logo from '../assets/Srmseal.png';
import './Header.css';

const Header = () => {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);

  useEffect(() => {
    // Get initial user
    supabase.auth.getUser().then(({ data: { user } }) => {
      setUser(user);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user || null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      navigate('/auth');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  return (
    <header>
      <div className="header-left">
        <img src={logo} alt="SRM College Logo" className="logo" />
        <h1>Welcome to SRM Kattankulathur (KTR) Campus</h1>
      </div>
      <nav>
        <ul>
          <li><Link to="/slot-booking">Request Outing</Link></li>
        </ul>
      </nav>
      <div className="user-section">
        {user && (
          <>
            <span className="user-email">{user.email}</span>
            <button onClick={handleLogout} className="logout-btn">Logout</button>
          </>
        )}
      </div>
      <style jsx>{`
        header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 1rem 2rem;
          background: #fff;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .header-left {
          display: flex;
          align-items: center;
        }
        .user-section {
          display: flex;
          align-items: center;
          gap: 1rem;
        }
        .user-email {
          font-size: 0.9rem;
          color: #666;
        }
        .logout-btn {
          padding: 0.5rem 1rem;
          background: #dc3545;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          transition: background 0.2s;
        }
        .logout-btn:hover {
          background: #c82333;
        }
      `}</style>
    </header>
  );
};

export default Header; 