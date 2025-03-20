import React, { useState, useEffect } from 'react';
import { setDayOrderReference, getDayOrderReferences } from '../services/api';
import './AdminDayOrder.css';

const AdminDayOrder = ({ adminEmail }) => {
  const [referenceDate, setReferenceDate] = useState('');
  const [dayOrder, setDayOrder] = useState('');
  const [latestReference, setLatestReference] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchReferences();
  }, [adminEmail]);

  const fetchReferences = async () => {
    try {
      setLoading(true);
      const data = await getDayOrderReferences(adminEmail);
      // Get only the most recent reference
      if (data && data.length > 0) {
        setLatestReference(data[0]); // Assuming the API returns data sorted by date desc
      }
    } catch (error) {
      setError('Failed to fetch day order reference');
      console.error('Error fetching references:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setLoading(true);
      setError('');
      setSuccess('');

      await setDayOrderReference(adminEmail, referenceDate, parseInt(dayOrder));
      
      // Clear form and show success message
      setReferenceDate('');
      setDayOrder('');
      setSuccess('Day order reference set successfully!');
      
      // Refresh the references
      fetchReferences();
    } catch (error) {
      setError(error.message || 'Failed to set day order reference');
      console.error('Error setting reference:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-day-order">
      <h3>Set Day Order Reference</h3>
      
      {error && <div className="error-message">{error}</div>}
      {success && <div className="success-message">{success}</div>}
      
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="referenceDate">Reference Date:</label>
          <input
            type="date"
            id="referenceDate"
            value={referenceDate}
            onChange={(e) => setReferenceDate(e.target.value)}
            required
          />
        </div>
        
        <div className="form-group">
          <label htmlFor="dayOrder">Day Order:</label>
          <select
            id="dayOrder"
            value={dayOrder}
            onChange={(e) => setDayOrder(e.target.value)}
            required
          >
            <option value="">Select Day Order</option>
            <option value="1">1</option>
            <option value="2">2</option>
            <option value="3">3</option>
            <option value="4">4</option>
            <option value="5">5</option>
          </select>
        </div>
        
        <button type="submit" disabled={loading}>
          {loading ? 'Setting...' : 'Set Day Order Reference'}
        </button>
      </form>

      <div className="references-history">
        <h4>Current Day Order Reference</h4>
        {loading && <div className="loading">Loading reference...</div>}
        {latestReference ? (
          <div className="current-reference">
            <p><strong>Date:</strong> {new Date(latestReference.reference_date).toLocaleDateString()}</p>
            <p><strong>Day Order:</strong> {latestReference.day_order}</p>
            <p><strong>Set By:</strong> {latestReference.set_by}</p>
            <p><strong>Set At:</strong> {new Date(latestReference.created_at).toLocaleString()}</p>
          </div>
        ) : (
          <p className="no-references">No day order reference set yet.</p>
        )}
      </div>
    </div>
  );
};

export default AdminDayOrder; 