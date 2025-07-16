import React from 'react';

const Toast = ({ message, type = 'info', onClose }) => {
  if (!message) return null;
  return (
    <div style={{
      position: 'fixed',
      bottom: 32,
      right: 32,
      background: type === 'error' ? '#f44336' : '#323232',
      color: '#fff',
      padding: '16px 24px',
      borderRadius: 8,
      boxShadow: '0 2px 8px #0003',
      zIndex: 2000,
      minWidth: 240,
      display: 'flex',
      alignItems: 'center',
      gap: 12
    }}>
      <span style={{ flex: 1 }}>{message}</span>
      <button onClick={onClose} style={{
        background: 'transparent',
        border: 'none',
        color: '#fff',
        fontWeight: 'bold',
        fontSize: 18,
        cursor: 'pointer',
        marginLeft: 8
      }}>×</button>
    </div>
  );
};

export default Toast; 