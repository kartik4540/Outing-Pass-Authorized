import React, { useState } from 'react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '../supabaseClient';
import './Login.css';
import { useNavigate } from 'react-router-dom';

const Login = () => {
  const [showArchModal, setShowArchModal] = useState(false);
  const [archId, setArchId] = useState('');
  const [archPass, setArchPass] = useState('');
  const [archError, setArchError] = useState('');
  const navigate = useNavigate();

  const handleArchSubmit = (e) => {
    e.preventDefault();
    // Placeholder: Replace with real auth logic
    if (archId === '' || archPass === '') {
      setArchError('Please enter both ID and password.');
    } else {
      setArchError('');
      alert(`Arch Gate Login\nID: ${archId}\nPassword: ${archPass}`);
      setShowArchModal(false);
      setArchId('');
      setArchPass('');
    }
  };
  return (
    <div className="login-page">
      <div className="login-container">
        <div className="welcome-section">
          <h1>Request Outing</h1>
          <p className="subtitle">Sign in with your SRM email (@srmist.edu.in)</p>
        </div>
        <div className="illustration">
          <div className="lab-icon">🔬</div>
          <div className="computer-icon">💻</div>
          <div className="book-icon">📚</div>
        </div>
        <Auth
          supabaseClient={supabase}
          appearance={{
            theme: ThemeSupa,
            variables: {
              default: {
                colors: {
                  brand: '#1a73e8',
                  brandAccent: '#1557b0',
                },
              },
            },
            className: {
              container: 'auth-form-container',
              button: 'auth-button',
            },
          }}
          providers={['google']}
          onlyThirdPartyProviders={true}
          redirectTo={`${window.location.origin}`}
          queryParams={{
            access_type: 'offline',
            hd: 'srmist.edu.in',
            include_granted_scopes: 'true'
          }}
        />
        <p className="note">* Only @srmist.edu.in email addresses are allowed</p>
      </div>
      {/* Arch Gate Login Button */}
      <button
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          background: '#fff',
          color: '#333',
          border: '1px solid #ccc',
          borderRadius: 24,
          padding: '10px 18px',
          fontSize: 14,
          boxShadow: '0 2px 8px #0001',
          zIndex: 1000
        }}
        onClick={() => navigate('/arch-gate-login')}
      >
        Custom Login
      </button>
      {/* Warden Login Button */}
      <button
        style={{
          position: 'fixed',
          bottom: 24,
          left: 24,
          background: '#fff',
          color: '#333',
          border: '1px solid #ccc',
          borderRadius: 24,
          padding: '10px 18px',
          fontSize: 14,
          boxShadow: '0 2px 8px #0001',
          zIndex: 1000
        }}
        onClick={() => navigate('/warden-login')}
      >
        Warden Login
      </button>
      {/* Arch Gate Modal */}
      {showArchModal && (
        <div className="arch-gate-modal-overlay" onClick={() => setShowArchModal(false)}>
          <div className="arch-gate-modal" onClick={e => e.stopPropagation()}>
            <h3>Custom Login</h3>
            <form onSubmit={handleArchSubmit}>
              <input
                type="text"
                placeholder="Custom ID"
                value={archId}
                onChange={e => setArchId(e.target.value)}
                className="arch-gate-input"
                autoFocus
              />
              <input
                type="password"
                placeholder="Password"
                value={archPass}
                onChange={e => setArchPass(e.target.value)}
                className="arch-gate-input"
              />
              {archError && <div className="arch-gate-error">{archError}</div>}
              <button type="submit" className="arch-gate-submit">Login</button>
              <button type="button" className="arch-gate-cancel" onClick={() => setShowArchModal(false)}>Cancel</button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Login; 