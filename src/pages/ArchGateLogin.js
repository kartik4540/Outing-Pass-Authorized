import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authenticateSystemUser } from '../services/api';

export default function ArchGateLogin() {
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const user = await authenticateSystemUser(id, password);
      if (user && user.role === 'arch_gate') {
        sessionStorage.setItem('archGateLoggedIn', 'true');
        sessionStorage.setItem('archGateId', user.username);
        navigate('/arch-otp');
      } else {
        setError('Invalid ID or password');
      }
    } catch (err) {
      setError('Login failed. Please try again.');
    }
  };

  return (
    <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'80vh'}}>
      <form onSubmit={handleSubmit} style={{border:'1px solid #ccc',padding:32,borderRadius:8,minWidth:320,boxShadow:'0 2px 8px #0001'}}>
        <h2>Custom Login</h2>
        <div style={{marginBottom:16}}>
          <label>ID<br/>
            <input value={id} onChange={e=>setId(e.target.value)} required style={{width:'100%',padding:8}} />
          </label>
        </div>
        <div style={{marginBottom:16}}>
          <label>Password<br/>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required style={{width:'100%',padding:8}} />
          </label>
        </div>
        {error && <div style={{color:'red',marginBottom:8}}>{error}</div>}
        <button type="submit" style={{width:'100%',padding:10}}>Login</button>
      </form>
    </div>
  );
} 