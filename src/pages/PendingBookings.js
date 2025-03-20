import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { fetchBookedSlots, handleBookingAction, fetchPendingBookings } from '../services/api';
import { supabase } from '../supabaseClient';
import './PendingBookings.css';

const PendingBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState('waiting');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [counts, setCounts] = useState({ waiting: 0, confirmed: 0, rejected: 0 });
  const navigate = useNavigate();

  useEffect(() => {
    checkAdminAndFetchBookings();
  }, []);

  const checkAdminAndFetchBookings = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate('/login');
        return;
      }

      const adminEmails = ['km5260@srmist.edu.in', 'manorant@srmist.edu.in'];
      if (!adminEmails.includes(user.email)) {
        navigate('/');
        return;
      }

      await fetchAllBookings(user.email);
    } catch (error) {
      console.error('Error:', error);
      setError('Failed to authenticate');
    }
  };

  const fetchAllBookings = async (adminEmail) => {
    try {
      setLoading(true);
      
      // Fetch all pending bookings using fetchPendingBookings
      const bookingsData = await fetchPendingBookings(adminEmail);
      
      // Filter based on selected status
      const filteredBookings = selectedStatus === 'all' 
        ? bookingsData 
        : bookingsData.filter(booking => booking.status === selectedStatus);
      
      setBookings(filteredBookings);
      
      // Calculate counts
      const waiting = bookingsData.filter(booking => booking.status === 'waiting').length;
      const confirmed = bookingsData.filter(booking => booking.status === 'confirmed').length;
      const rejected = bookingsData.filter(booking => booking.status === 'rejected').length;
      setCounts({ waiting, confirmed, rejected });
      
      setError(null);
    } catch (error) {
      console.error('Error fetching bookings:', error);
      setError('Failed to fetch bookings. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (status) => {
    setSelectedStatus(status);
    
    try {
      setLoading(true);
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      // We don't need to fetch bookings again - just filter the existing data
      if (bookings.length > 0) {
        const filteredBookings = status === 'all' 
          ? bookings 
          : bookings.filter(booking => booking.status === status);
          
        setBookings(filteredBookings);
      } else {
        // If we don't have bookings yet, fetch them
        await fetchAllBookings(user.email);
      }
      
      setError(null);
    } catch (error) {
      console.error('Error changing status filter:', error);
      setError('Failed to filter bookings. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const processBookingAction = async (bookingId, action) => {
    try {
      setLoading(true);
      
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      
      // Process the booking action
      const result = await handleBookingAction(bookingId, action, user.email);
      
      // Show success message
      setSuccess(`Booking ${action === 'confirm' ? 'confirmed' : 'rejected'} successfully`);
      
      // Refresh bookings with current filter
      await handleStatusChange(selectedStatus);
      
      return result;
    } catch (error) {
      console.error(`Error ${action}ing booking:`, error);
      setError(`Failed to ${action} booking. Please try again later.`);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="loading">Loading...</div>;
  if (error) return <div className="error-message">{error}</div>;

  return (
    <div className="pending-bookings-page">
      <h2>Lab Bookings</h2>
      {success && <div className="success-message">{success}</div>}
      
      <div className="status-filter-buttons">
        <button
          className={`status-button ${selectedStatus === 'waiting' ? 'active' : ''}`}
          onClick={() => handleStatusChange('waiting')}
        >
          Waiting ({counts.waiting})
        </button>
        <button
          className={`status-button ${selectedStatus === 'confirmed' ? 'active' : ''}`}
          onClick={() => handleStatusChange('confirmed')}
        >
          Confirmed ({counts.confirmed})
        </button>
        <button
          className={`status-button ${selectedStatus === 'rejected' ? 'active' : ''}`}
          onClick={() => handleStatusChange('rejected')}
        >
          Rejected ({counts.rejected})
        </button>
      </div>
      
      {bookings.length > 0 ? (
        <div className="bookings-list">
          {bookings.map(booking => (
            <div key={booking.id} className="booking-card">
              <div className="booking-info">
                <div className="info-group">
                  <h3>User Details</h3>
                  <p><strong>Name:</strong> {booking.name}</p>
                  <p><strong>Email:</strong> {booking.email}</p>
                  <p><strong>Faculty ID:</strong> {booking.faculty_id}</p>
                  <p><strong>Department:</strong> {booking.department}</p>
                </div>
                <div className="info-group">
                  <h3>Booking Details</h3>
                  <p><strong>Date:</strong> {booking.formatted_date || booking.date}</p>
                  <p><strong>Day Order:</strong> {booking.day_order}</p>
                  <p><strong>Lab:</strong> {booking.lab}</p>
                  <p><strong>Time Slot:</strong> {booking.time_slot}</p>
                </div>
              </div>
              {selectedStatus === 'waiting' && (
                <div className="action-buttons">
                  <button
                    onClick={() => processBookingAction(booking.id, 'confirm')}
                    className="confirm-button"
                    disabled={loading}
                  >
                    Confirm
                  </button>
                  <button
                    onClick={() => processBookingAction(booking.id, 'reject')}
                    className="reject-button"
                    disabled={loading}
                  >
                    Reject
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="no-bookings">No {selectedStatus} bookings available</div>
      )}
    </div>
  );
};

export default PendingBookings; 