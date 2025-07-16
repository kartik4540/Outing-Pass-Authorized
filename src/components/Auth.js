import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { supabase } from '../supabaseClient'
import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import Toast from './Toast';

const AuthComponent = () => {
  const navigate = useNavigate()
  const [toast, setToast] = useState({ message: '', type: 'info' });

  useEffect(() => {
    supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN') {
        const user = session?.user
        if (user?.email?.endsWith('@srmist.edu.in')) {
          navigate('/')
        } else {
          // Sign out if not an SRM email
          await supabase.auth.signOut()
          sessionStorage.clear();
          setToast({ message: 'Please use your SRM email address (@srmist.edu.in) to sign in.', type: 'error' });
        }
      }
    })
  }, [navigate])

  return (
    <div className="auth-container">
      <Toast message={toast.message} type={toast.type} onClose={() => setToast({ message: '', type: 'info' })} />
      <div className="auth-wrapper">
        <div className="auth-box">
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
      </div>
      <style jsx>{`
        .auth-container {
          width: 100%;
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
          position: relative;
          overflow: hidden;
        }
        .auth-container::before {
          content: '';
          position: absolute;
          width: 200%;
          height: 200%;
          background: radial-gradient(circle, rgba(255,255,255,0.2) 0%, rgba(255,255,255,0) 70%);
          top: -50%;
          left: -50%;
          animation: rotate 30s linear infinite;
        }
        @keyframes rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .auth-wrapper {
          max-width: 480px;
          width: 90%;
          padding: 20px;
          position: relative;
          z-index: 1;
        }
        .auth-box {
          background: rgba(255, 255, 255, 0.95);
          padding: 40px;
          border-radius: 20px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
          backdrop-filter: blur(10px);
          border: 1px solid rgba(255, 255, 255, 0.3);
          transition: transform 0.3s ease;
        }
        .auth-box:hover {
          transform: translateY(-5px);
        }
        .welcome-section {
          text-align: center;
          margin-bottom: 30px;
        }
        h1 {
          color: #2d3748;
          margin-bottom: 10px;
          font-size: 28px;
          font-weight: 700;
          background: linear-gradient(45deg, #1a73e8, #34a853);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        .subtitle {
          color: #718096;
          font-size: 16px;
          margin-bottom: 20px;
        }
        .note {
          text-align: center;
          color: #718096;
          font-size: 14px;
          margin-top: 20px;
          font-style: italic;
        }
        .illustration {
          display: flex;
          justify-content: center;
          gap: 20px;
          margin-bottom: 30px;
          animation: float 3s ease-in-out infinite;
        }
        @keyframes float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
        }
        .lab-icon, .computer-icon, .book-icon {
          font-size: 32px;
          padding: 15px;
          background: white;
          border-radius: 50%;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
          transition: transform 0.3s ease;
        }
        .lab-icon:hover, .computer-icon:hover, .book-icon:hover {
          transform: scale(1.1);
        }
        :global(.auth-form-container) {
          width: 100%;
        }
        :global(.auth-button) {
          width: 100%;
          height: 48px;
          background: #fff;
          border: 1px solid #dadce0;
          border-radius: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          cursor: pointer;
          transition: all 0.3s ease;
          font-size: 16px;
          font-weight: 500;
          color: #3c4043;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
        :global(.auth-button:hover) {
          background-color: #f8f9fa;
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
          transform: translateY(-2px);
        }
        :global(.auth-button:active) {
          transform: translateY(0);
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
        }
      `}</style>
    </div>
  )
}

export default AuthComponent 