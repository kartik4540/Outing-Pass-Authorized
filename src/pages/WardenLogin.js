import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authenticateSystemUser } from '../services/api';

const WardenLogin = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const warden = await authenticateSystemUser(username, password);
      if (warden) {
        // Set session info in sessionStorage
        sessionStorage.setItem('wardenLoggedIn', 'true');
        sessionStorage.setItem('wardenUsername', warden.id);
        sessionStorage.setItem('wardenHostels', JSON.stringify(warden.hostels || []));
        sessionStorage.setItem('wardenEmail', warden.email || '');
        sessionStorage.setItem('wardenRole', warden.role || 'warden');
        window.location.href = '/pending-bookings'; // Force full reload
      } else {
        setError('Invalid username or password');
      }
    } catch (err) {
      setError('Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'80vh'}}>
      <form onSubmit={handleSubmit} style={{border:'1px solid #ccc',padding:32,borderRadius:8,minWidth:320,boxShadow:'0 2px 8px #0001'}}>
        <h2>Warden Login</h2>
        <div style={{marginBottom:16}}>
          <label>Username<br/>
            <input value={username} onChange={e=>setUsername(e.target.value)} required style={{width:'100%',padding:8}} />
          </label>
        </div>
        <div style={{marginBottom:16}}>
          <label>Password<br/>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required style={{width:'100%',padding:8}} />
          </label>
        </div>
        {error && <div style={{color:'red',marginBottom:8}}>{error}</div>}
        <button type="submit" style={{width:'100%',padding:10}} disabled={loading}>{loading ? 'Logging in...' : 'Login'}</button>
      </form>
    </div>
  );
};

export default WardenLogin; 