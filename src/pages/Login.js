import React from 'react';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { supabase } from '../supabaseClient';
import './Login.css';

const Login = () => {
  return (
    <div className="login-page">
      <div className="login-container">
        <div className="welcome-section">
          <h1>SRM MAC LAB Slot Booking</h1>
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
    </div>
  );
};

export default Login; 