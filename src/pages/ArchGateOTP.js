import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchOutingDetailsByOTP, markOTPAsUsed } from '../services/api';

export default function ArchGateOTP() {
  const [otp, setOtp] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const details = await fetchOutingDetailsByOTP(otp);
      if (details) {
        await markOTPAsUsed(otp);
        sessionStorage.setItem('archGateOutingDetails', JSON.stringify(details));
        navigate('/arch-outing-details');
      } else {
        setError('Invalid OTP');
      }
    } catch (err) {
      setError('Invalid OTP');
    }
  };

  return (
    <div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'80vh'}}>
      <form onSubmit={handleSubmit} style={{border:'1px solid #ccc',padding:32,borderRadius:8,minWidth:320,boxShadow:'0 2px 8px #0001'}}>
        <h2>Enter OTP</h2>
        <div style={{marginBottom:16}}>
          <label>OTP<br/>
            <input value={otp} onChange={e=>setOtp(e.target.value)} required style={{width:'100%',padding:8,letterSpacing:4}} maxLength={6} />
          </label>
        </div>
        {error && <div style={{color:'red',marginBottom:8}}>{error}</div>}
        <button type="submit" style={{width:'100%',padding:10}}>Verify OTP</button>
      </form>
    </div>
  );
} 