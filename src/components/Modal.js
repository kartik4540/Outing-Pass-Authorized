import React from 'react';

const Modal = ({ children, onClose }) => (
  <div style={{
    position: 'fixed',
    top: 0, left: 0, right: 0, bottom: 0,
    background: 'rgba(0,0,0,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2100
  }}>
    <div style={{
      background: '#fff',
      borderRadius: 8,
      padding: 24,
      minWidth: 320,
      maxWidth: '90vw',
      boxShadow: '0 4px 24px #0002',
      position: 'relative'
    }}>
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          background: 'transparent',
          border: 'none',
          fontSize: 20,
          cursor: 'pointer'
        }}
        aria-label="Close"
      >×</button>
      {children}
    </div>
  </div>
);

export default Modal; 